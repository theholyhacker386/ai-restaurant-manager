import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET — validate a setup token (staff invite) or invite token (new restaurant owner)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const invite = searchParams.get("invite");

    const sql = getDb();

    // Handle restaurant invite token (new restaurant owner)
    if (invite) {
      const rows = await sql`
        SELECT id, restaurant_name, owner_name, owner_email FROM restaurant_invites
        WHERE token = ${invite}
          AND expires_at > NOW()
          AND used_at IS NULL
      `;

      if (rows.length === 0) {
        return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 404 });
      }

      return NextResponse.json({
        type: "invite",
        name: rows[0].owner_name,
        restaurantName: rows[0].restaurant_name,
        email: rows[0].owner_email,
        role: "owner",
      });
    }

    // Handle staff setup token (existing flow)
    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, name, role FROM users
      WHERE setup_token = ${token}
        AND setup_token_expires > NOW()
        AND pin_hash IS NULL
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "This setup link is invalid or has already been used." }, { status: 404 });
    }

    return NextResponse.json({ type: "staff", name: rows[0].name, role: rows[0].role });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — set PIN using a setup token OR create new account from invite
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, invite, pin } = body;

    if (!pin) {
      return NextResponse.json({ error: "PIN is required" }, { status: 400 });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });
    }

    const sql = getDb();

    // Check PIN isn't taken by someone else
    const usersWithPins = await sql`SELECT id, pin_hash FROM users WHERE pin_hash IS NOT NULL`;
    for (const u of usersWithPins) {
      const match = await bcrypt.compare(pin, u.pin_hash);
      if (match) {
        return NextResponse.json({ error: "This PIN is already taken. Please choose a different one." }, { status: 409 });
      }
    }

    const pinHash = await bcrypt.hash(pin, 10);

    // Handle restaurant invite (new restaurant owner)
    if (invite) {
      const inviteRows = await sql`
        SELECT id, restaurant_name, owner_name, owner_email FROM restaurant_invites
        WHERE token = ${invite}
          AND expires_at > NOW()
          AND used_at IS NULL
      `;

      if (inviteRows.length === 0) {
        return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 404 });
      }

      const inv = inviteRows[0];

      // Create the restaurant
      const restaurantId = `rest_${uuid().split("-")[0]}`;
      await sql`
        INSERT INTO restaurants (id, name, status)
        VALUES (${restaurantId}, ${inv.restaurant_name}, 'active')
      `;

      // Create the owner user account
      const userId = uuid();
      await sql`
        INSERT INTO users (id, email, name, role, pin, pin_hash, restaurant_id, onboarding_completed)
        VALUES (${userId}, ${inv.owner_email}, ${inv.owner_name}, 'owner', ${pin}, ${pinHash}, ${restaurantId}, false)
      `;

      // Update the restaurant with the owner_user_id
      await sql`UPDATE restaurants SET owner_user_id = ${userId} WHERE id = ${restaurantId}`;

      // Mark invite as used
      await sql`UPDATE restaurant_invites SET used_at = NOW() WHERE id = ${inv.id}`;

      // Create an onboarding session for this user
      await sql`
        INSERT INTO onboarding_sessions (id, customer_name, business_name, restaurant_id, is_complete)
        VALUES (${userId}, ${inv.owner_name}, ${inv.restaurant_name}, ${restaurantId}, false)
        ON CONFLICT (id) DO NOTHING
      `;

      return NextResponse.json({
        success: true,
        role: "owner",
        restaurantId,
        redirectTo: "/onboarding",
      });
    }

    // Handle staff setup token (existing flow)
    if (!token) {
      return NextResponse.json({ error: "Token or invite required" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, role FROM users
      WHERE setup_token = ${token}
        AND setup_token_expires > NOW()
        AND pin_hash IS NULL
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "This setup link is invalid or has already been used." }, { status: 404 });
    }

    const userId = rows[0].id;
    const userRole = rows[0].role;

    // Save PIN
    await sql`
      UPDATE users
      SET pin = ${pin}, pin_hash = ${pinHash}, setup_token = NULL, setup_token_expires = NULL
      WHERE id = ${userId}
    `;

    return NextResponse.json({ success: true, role: userRole });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
