import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { generateMfaSecret } from "@/lib/mfa";
import QRCode from "qrcode";

// POST — Generate a TOTP secret + QR code for MFA setup
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sql = getDb();
    const rows = await sql`SELECT mfa_enabled FROM users WHERE id = ${session.user.id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (rows[0].mfa_enabled) {
      return NextResponse.json({ error: "MFA is already enabled" }, { status: 400 });
    }

    // Generate secret and QR URI
    const { secret, uri } = generateMfaSecret(session.user.email || session.user.id);

    // Store secret temporarily (not yet enabled — user must verify first)
    await sql`UPDATE users SET mfa_secret = ${secret} WHERE id = ${session.user.id}`;

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(uri);

    return NextResponse.json({
      qrCode: qrDataUrl,
      secret, // Allow manual entry as fallback
    });
  } catch (error) {
    console.error("MFA setup error:", error);
    return NextResponse.json({ error: "Failed to set up MFA" }, { status: 500 });
  }
}
