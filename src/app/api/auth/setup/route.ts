import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET — validate a setup token and return the user's name
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT id, name, role FROM users
      WHERE setup_token = ${token}
        AND setup_token_expires > NOW()
        AND pin_hash IS NULL
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "This setup link is invalid or has already been used." }, { status: 404 });
    }

    return NextResponse.json({ name: rows[0].name, role: rows[0].role });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — set PIN using a setup token
export async function POST(req: Request) {
  try {
    const { token, pin } = await req.json();

    if (!token || !pin) {
      return NextResponse.json({ error: "Token and PIN are required" }, { status: 400 });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });
    }

    const sql = getDb();

    // Find the user with this setup token
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

    // Check PIN isn't taken by someone else
    const usersWithPins = await sql`SELECT id, pin_hash FROM users WHERE pin_hash IS NOT NULL`;
    for (const u of usersWithPins) {
      const match = await bcrypt.compare(pin, u.pin_hash);
      if (match) {
        return NextResponse.json({ error: "This PIN is already taken. Please choose a different one." }, { status: 409 });
      }
    }

    // Save PIN (both hash for login and plain for owner to view)
    const pinHash = await bcrypt.hash(pin, 10);
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
