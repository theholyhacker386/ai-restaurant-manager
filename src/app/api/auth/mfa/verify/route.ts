import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { verifyMfaCode, generateBackupCodes } from "@/lib/mfa";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";

// POST — Verify a TOTP code during setup to enable MFA
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`SELECT mfa_secret, mfa_enabled, email, role FROM users WHERE id = ${session.user.id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = rows[0];
    if (user.mfa_enabled) {
      return NextResponse.json({ error: "MFA is already enabled" }, { status: 400 });
    }
    if (!user.mfa_secret) {
      return NextResponse.json({ error: "Start MFA setup first" }, { status: 400 });
    }

    // Verify the code against the stored secret
    const isValid = verifyMfaCode(user.mfa_secret, code);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid code. Try again." }, { status: 400 });
    }

    // Generate backup codes and enable MFA
    const backupCodes = generateBackupCodes();
    await sql`
      UPDATE users SET
        mfa_enabled = true,
        mfa_backup_codes = ${JSON.stringify(backupCodes)}
      WHERE id = ${session.user.id}
    `;

    try {
      const { ipAddress, userAgent } = getRequestMeta(request);
      logAuditEvent({
        eventType: "mfa_enabled",
        userId: session.user.id,
        userEmail: user.email,
        userRole: user.role,
        ipAddress,
        userAgent,
      });
    } catch {
      // Audit logging is best-effort
    }

    return NextResponse.json({
      success: true,
      backupCodes,
    });
  } catch (error) {
    console.error("MFA verify error:", error);
    return NextResponse.json({ error: "Failed to verify MFA" }, { status: 500 });
  }
}
