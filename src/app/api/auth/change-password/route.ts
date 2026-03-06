import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { auth } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Both passwords are required" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const sql = getDb();

    // Get current password hash
    const rows = await sql`SELECT id, password_hash FROM users WHERE email = ${session.user.email}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = rows[0];

    // Verify current password
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    // Hash and save new password
    const newHash = await bcrypt.hash(newPassword, 10);
    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error changing password:", error);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
