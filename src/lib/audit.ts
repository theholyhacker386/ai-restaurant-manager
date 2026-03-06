import { getDb } from "@/lib/db";

export type AuditEventType =
  | "login"
  | "login_failed"
  | "logout"
  | "access_denied"
  | "user_created"
  | "user_deleted"
  | "user_deactivated"
  | "settings_changed"
  | "password_changed"
  | "role_changed"
  | "consent_granted"
  | "consent_revoked"
  | "data_exported"
  | "data_deleted"
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_failed"
  | "plaid_connected"
  | "plaid_disconnected";

let tableEnsured = false;

/**
 * Ensure the audit_log table exists. Called once on first use, then skipped.
 */
async function ensureTable() {
  if (tableEnsured) return;
  try {
    const sql = getDb();
    await sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        restaurant_id TEXT,
        event_type TEXT NOT NULL,
        user_id TEXT,
        user_email TEXT,
        user_role TEXT,
        ip_address TEXT,
        user_agent TEXT,
        resource TEXT,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    // Create indexes if they don't exist
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_restaurant_date ON audit_log (restaurant_id, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log (event_type)`;
    tableEnsured = true;
  } catch (error) {
    console.error("Failed to ensure audit_log table:", error);
  }
}

/**
 * Log a security/audit event. Never throws — failures are console.error'd.
 * This is fire-and-forget: it will NEVER block the request or throw an error.
 */
export async function logAuditEvent(params: {
  restaurantId?: string;
  eventType: AuditEventType;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await ensureTable();
    const sql = getDb();
    await sql`
      INSERT INTO audit_log (restaurant_id, event_type, user_id, user_email, user_role, ip_address, user_agent, resource, details)
      VALUES (
        ${params.restaurantId || null},
        ${params.eventType},
        ${params.userId || null},
        ${params.userEmail || null},
        ${params.userRole || null},
        ${params.ipAddress || null},
        ${params.userAgent || null},
        ${params.resource || null},
        ${params.details ? JSON.stringify(params.details) : null}
      )
    `;
  } catch (error) {
    console.error("Failed to log audit event:", error);
  }
}

/**
 * Extract IP address and user agent from a request (works on Vercel).
 */
export function getRequestMeta(req: Request): {
  ipAddress: string;
  userAgent: string;
} {
  const forwarded = req.headers.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  return { ipAddress, userAgent };
}
