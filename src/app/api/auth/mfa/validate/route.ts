import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyMfaCode, verifyBackupCode, createMfaCompletionToken } from "@/lib/mfa";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

// POST — Validate a TOTP code during login (second step)
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 attempts per 5 minutes per IP
    const reqMeta = getRequestMeta(request);
    const rl = checkRateLimit(`mfa:${reqMeta.ipAddress}`, 10, 5 * 60 * 1000);
    if (rl.limited) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const { code, userId, isBackupCode } = await request.json();

    if (!code || !userId) {
      return NextResponse.json({ error: "Code and userId are required" }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`SELECT id, email, name, role, mfa_secret, mfa_enabled, mfa_backup_codes, onboarding_completed FROM users WHERE id = ${userId}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = rows[0];
    if (!user.mfa_enabled || !user.mfa_secret) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    const { ipAddress, userAgent } = reqMeta;
    let isValid = false;

    if (isBackupCode) {
      // Verify backup code
      const storedCodes: string[] = typeof user.mfa_backup_codes === "string"
        ? JSON.parse(user.mfa_backup_codes)
        : user.mfa_backup_codes || [];

      const result = verifyBackupCode(storedCodes, code);
      isValid = result.valid;

      if (isValid) {
        // Remove used backup code
        await sql`UPDATE users SET mfa_backup_codes = ${JSON.stringify(result.remainingCodes)} WHERE id = ${userId}`;
      }
    } else {
      // Verify TOTP code
      isValid = verifyMfaCode(user.mfa_secret, code);
    }

    if (!isValid) {
      try {
        logAuditEvent({
          eventType: "mfa_failed",
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          ipAddress,
          userAgent,
          details: { method: isBackupCode ? "backup_code" : "totp" },
        });
      } catch {
        // Audit logging is best-effort
      }
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    // MFA passed — create a signed completion token
    const mfaCompletionToken = createMfaCompletionToken(user.id);

    try {
      logAuditEvent({
        eventType: "login",
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        ipAddress,
        userAgent,
        details: { method: "mfa", mfa_method: isBackupCode ? "backup_code" : "totp" },
      });
    } catch {
      // Audit logging is best-effort
    }

    return NextResponse.json({
      success: true,
      mfaCompletionToken,
    });
  } catch (error) {
    console.error("MFA validate error:", error);
    return NextResponse.json({ error: "Failed to validate MFA" }, { status: 500 });
  }
}
