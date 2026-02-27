import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuid } from "uuid";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET — list all team members (owner only)
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
    const users = await sql`
      SELECT id, email, name, role, pin, (pin_hash IS NOT NULL) as has_pin,
             setup_token, setup_token_expires, created_at
      FROM users
      WHERE restaurant_id = ${restaurantId}
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

// DELETE — remove a team member
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
    await sql`DELETE FROM users WHERE id = ${userId} AND restaurant_id = ${restaurantId}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
