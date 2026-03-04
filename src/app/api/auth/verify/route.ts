import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "No token provided." }, { status: 400 });
    }

    const sql = getDb();

    // Find user with this verification token
    const rows = await sql`
      SELECT id, restaurant_id FROM users
      WHERE verification_token = ${token}
        AND verification_token_expires > NOW()
        AND email_verified = false
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired." },
        { status: 404 }
      );
    }

    const user = rows[0];

    // Mark email as verified and clear the token
    await sql`
      UPDATE users
      SET email_verified = true,
          verification_token = NULL,
          verification_token_expires = NULL
      WHERE id = ${user.id}
    `;

    // Activate the restaurant
    if (user.restaurant_id) {
      await sql`
        UPDATE restaurants SET status = 'active' WHERE id = ${user.restaurant_id}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[VERIFY] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
