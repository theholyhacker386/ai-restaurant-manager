import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/tenant";
import { v4 as uuid } from "uuid";
import crypto from "crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET — list all restaurants and pending invites (admin only)
 */
export async function GET() {
  try {
    const { sql } = await getAdminDb();

    const restaurants = await sql`
      SELECT r.id, r.name, r.status, r.created_at,
        u.name as owner_name, u.email as owner_email
      FROM restaurants r
      LEFT JOIN users u ON u.id = r.owner_user_id
      ORDER BY r.created_at DESC
    `;

    const invites = await sql`
      SELECT id, token, restaurant_name, owner_name, owner_email, expires_at, used_at
      FROM restaurant_invites
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return NextResponse.json({ restaurants, invites });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST — create a new restaurant invite link (admin only)
 *
 * Body: { restaurantName, ownerName, ownerEmail }
 * Returns: { inviteLink }
 */
export async function POST(req: Request) {
  try {
    const { sql } = await getAdminDb();
    const { restaurantName, ownerName, ownerEmail } = await req.json();

    if (!restaurantName || !ownerName || !ownerEmail) {
      return NextResponse.json(
        { error: "Restaurant name, owner name, and owner email are required" },
        { status: 400 }
      );
    }

    // Generate a secure invite token
    const token = crypto.randomBytes(32).toString("hex");
    const id = `inv_${uuid().split("-")[0]}`;

    // Expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await sql`
      INSERT INTO restaurant_invites (id, token, restaurant_name, owner_name, owner_email, expires_at)
      VALUES (${id}, ${token}, ${restaurantName}, ${ownerName}, ${ownerEmail}, ${expiresAt.toISOString()})
    `;

    // Build invite link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteLink = `${baseUrl}/setup?invite=${token}`;

    return NextResponse.json({ success: true, inviteLink, token });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
