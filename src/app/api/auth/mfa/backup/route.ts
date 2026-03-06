import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { generateBackupCodes } from "@/lib/mfa";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";

// POST — Regenerate backup codes
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sql = getDb();
    const rows = await sql`SELECT mfa_enabled, email, role FROM users WHERE id = ${session.user.id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!rows[0].mfa_enabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    const backupCodes = generateBackupCodes();
    await sql`UPDATE users SET mfa_backup_codes = ${JSON.stringify(backupCodes)} WHERE id = ${session.user.id}`;

    try {
      const { ipAddress, userAgent } = getRequestMeta(request);
      logAuditEvent({
        eventType: "mfa_enabled",
        userId: session.user.id,
        userEmail: rows[0].email,
        userRole: rows[0].role,
        ipAddress,
        userAgent,
        details: { action: "backup_codes_regenerated" },
      });
    } catch {
      // Audit logging is best-effort
    }

    return NextResponse.json({ backupCodes });
  } catch (error) {
    console.error("Backup codes error:", error);
    return NextResponse.json({ error: "Failed to regenerate backup codes" }, { status: 500 });
  }
}
