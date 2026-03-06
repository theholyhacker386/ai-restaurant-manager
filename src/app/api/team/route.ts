import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET — list all active team members (owner only)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "owner") {
      return NextResponse.json({ error: "Only the owner can manage the team" }, { status: 403 });
    }

    const { sql, restaurantId } = await getTenantDb();

    // Ensure soft-delete columns exist
    try {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by TEXT`;
    } catch { /* columns may already exist */ }

    const users = await sql`
      SELECT id, email, name, role, pin, (pin_hash IS NOT NULL) as has_pin,
             setup_token, setup_token_expires, created_at
      FROM users
      WHERE restaurant_id = ${restaurantId}
        AND (is_active = true OR is_active IS NULL)
      ORDER BY created_at ASC
    `;

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — add a new team member (owner only)
// Just needs a name. Generates a one-time setup link for the employee to set their PIN.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "owner") {
      return NextResponse.json({ error: "Only the owner can add team members" }, { status: 403 });
    }

    const { sql, restaurantId } = await getTenantDb();
    const { name } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const userId = `usr_${uuid().split("-")[0]}`;
    const setupToken = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Use a placeholder email (managers don't need a real one — they log in with PIN)
    const placeholderEmail = `${name.trim().toLowerCase().replace(/\s+/g, ".")}.${userId}@team.local`;

    // Placeholder password hash (they won't use email/password login)
    const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

    await sql`
      INSERT INTO users (id, email, name, password_hash, role, setup_token, setup_token_expires, restaurant_id)
      VALUES (${userId}, ${placeholderEmail}, ${name.trim()}, ${placeholderHash}, 'manager', ${setupToken}, ${expiresAt.toISOString()}, ${restaurantId})
    `;

    // Audit log: team member created
    const { ipAddress, userAgent } = getRequestMeta(req);
    logAuditEvent({
      eventType: "user_created",
      userId: session.user.id,
      userEmail: session.user.email || undefined,
      userRole: role,
      restaurantId,
      ipAddress,
      userAgent,
      resource: "/api/team",
      details: { createdUserId: userId, createdUserName: name.trim(), createdUserRole: "manager" },
    });

    return NextResponse.json({
      success: true,
      setupToken,
      user: { id: userId, name: name.trim(), role: "manager" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH — update a team member's PIN or regenerate their setup link (owner only)
export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "owner") {
      return NextResponse.json({ error: "Only the owner can edit team members" }, { status: 403 });
    }

    const { sql, restaurantId } = await getTenantDb();
    const { userId, pin, removePin, regenerateLink } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Set PIN (owner setting it for someone)
    if (pin) {
      if (!/^\d{4,6}$/.test(pin)) {
        return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });
      }
      // Check if any other user already has this PIN
      const usersWithPins = await sql`SELECT id, pin_hash FROM users WHERE pin_hash IS NOT NULL AND id != ${userId} AND restaurant_id = ${restaurantId}`;
      for (const u of usersWithPins) {
        const match = await bcrypt.compare(pin, u.pin_hash);
        if (match) {
          return NextResponse.json({ error: "This PIN is already taken by another team member" }, { status: 409 });
        }
      }
      const pinHash = await bcrypt.hash(pin, 10);
      await sql`UPDATE users SET pin = ${pin}, pin_hash = ${pinHash} WHERE id = ${userId} AND restaurant_id = ${restaurantId}`;
    }

    // Remove PIN
    if (removePin) {
      await sql`UPDATE users SET pin = NULL, pin_hash = NULL WHERE id = ${userId} AND restaurant_id = ${restaurantId}`;
    }

    // Regenerate setup link
    if (regenerateLink) {
      const setupToken = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await sql`UPDATE users SET setup_token = ${setupToken}, setup_token_expires = ${expiresAt.toISOString()} WHERE id = ${userId} AND restaurant_id = ${restaurantId}`;
      return NextResponse.json({ success: true, setupToken });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — soft-delete (deactivate) a team member
export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "owner") {
      return NextResponse.json({ error: "Only the owner can remove team members" }, { status: 403 });
    }

    const { userId } = await req.json();

    // Don't let owner delete themselves
    if (userId === session.user.id) {
      return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
    }

    const { sql, restaurantId } = await getTenantDb();

    // Get the user's info for the audit log
    const targetRows = await sql`SELECT name, email, role FROM users WHERE id = ${userId} AND restaurant_id = ${restaurantId}`;
    const targetUser = targetRows[0];

    // Soft delete: deactivate the user and clear credentials
    await sql`
      UPDATE users
      SET is_active = false,
          deactivated_at = NOW(),
          deactivated_by = ${session.user.id},
          pin = NULL,
          pin_hash = NULL,
          setup_token = NULL
      WHERE id = ${userId} AND restaurant_id = ${restaurantId}
    `;

    // Clear MFA fields if they exist (may not be merged yet)
    try {
      await sql`
        UPDATE users
        SET mfa_secret = NULL,
            mfa_enabled = false,
            mfa_backup_codes = NULL
        WHERE id = ${userId} AND restaurant_id = ${restaurantId}
      `;
    } catch {
      // MFA columns don't exist yet — that's fine
    }

    // Audit log: team member deactivated
    const { ipAddress, userAgent } = getRequestMeta(req);
    logAuditEvent({
      eventType: "user_deactivated",
      userId: session.user.id,
      userEmail: session.user.email || undefined,
      userRole: role,
      restaurantId,
      ipAddress,
      userAgent,
      resource: "/api/team",
      details: {
        deactivatedUserId: userId,
        deactivatedUserName: targetUser?.name || "unknown",
        deactivatedUserRole: targetUser?.role || "unknown",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
