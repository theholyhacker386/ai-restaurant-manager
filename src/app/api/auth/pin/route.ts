import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST — set or update PIN
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { pin } = await req.json();

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { error: "PIN must be 4-6 digits" },
        { status: 400 }
      );
    }

    const sql = getDb();

    // Check if any other user already has this PIN
    const usersWithPins = await sql`
      SELECT id, pin_hash FROM users WHERE pin_hash IS NOT NULL AND id != ${session.user.id}
    `;

    for (const u of usersWithPins) {
      const match = await bcrypt.compare(pin, u.pin_hash);
      if (match) {
        return NextResponse.json(
          { error: "This PIN is already taken. Please choose a different one." },
          { status: 409 }
        );
      }
    }

    // Hash and store PIN
    const pinHash = await bcrypt.hash(pin, 10);
    await sql`UPDATE users SET pin = ${pin}, pin_hash = ${pinHash} WHERE id = ${session.user.id}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove PIN
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sql = getDb();
    await sql`UPDATE users SET pin = NULL, pin_hash = NULL WHERE id = ${session.user.id}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — check if current user has a PIN set
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sql = getDb();
    const rows = await sql`SELECT pin_hash FROM users WHERE id = ${session.user.id}`;

    return NextResponse.json({ hasPin: rows.length > 0 && rows[0].pin_hash !== null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
