import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { verifyMfaCode } from "@/lib/mfa";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";

// GET — Check MFA status for current user
export async function GET() {
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

    return NextResponse.json({ mfaEnabled: rows[0].mfa_enabled === true });
  } catch (error) {
    console.error("MFA status error:", error);
    return NextResponse.json({ error: "Failed to check MFA status" }, { status: 500 });
  }
}

// DELETE — Disable MFA (requires a valid code to confirm)
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`SELECT mfa_secret, mfa_enabled, email, role FROM users WHERE id = ${session.user.id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = rows[0];
    if (!user.mfa_enabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    // Must provide valid code to disable
    const isValid = verifyMfaCode(user.mfa_secret, code);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    await sql`
      UPDATE users SET
        mfa_enabled = false,
        mfa_secret = NULL,
        mfa_backup_codes = NULL
      WHERE id = ${session.user.id}
    `;

    try {
      const { ipAddress, userAgent } = getRequestMeta(request);
      logAuditEvent({
        eventType: "mfa_disabled",
        userId: session.user.id,
        userEmail: user.email,
        userRole: user.role,
        ipAddress,
        userAgent,
      });
    } catch {
      // Audit logging is best-effort
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MFA disable error:", error);
    return NextResponse.json({ error: "Failed to disable MFA" }, { status: 500 });
  }
}
