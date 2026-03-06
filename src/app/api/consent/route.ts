import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Valid consent types
const CONSENT_TYPES = [
  "privacy_policy",
  "terms_of_service",
  "data_processing",
  "plaid_data_access",
  "marketing",
] as const;

let tableEnsured = false;

/** Ensure the consent_records table exists (once per process). */
async function ensureConsentTable(sql: any) {
  if (tableEnsured) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS consent_records (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        restaurant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        consent_type TEXT NOT NULL,
        granted BOOLEAN NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_consent_restaurant_user ON consent_records (restaurant_id, user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_consent_type ON consent_records (consent_type)`;
    tableEnsured = true;
  } catch (error) {
    console.error("Failed to ensure consent_records table:", error);
  }
}

// GET — return most recent consent per type for the current user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { sql, restaurantId } = await getTenantDb();
    await ensureConsentTable(sql);

    const rows = await sql`
      SELECT DISTINCT ON (consent_type)
        id, consent_type, granted, created_at
      FROM consent_records
      WHERE user_id = ${session.user.id}
        AND restaurant_id = ${restaurantId}
      ORDER BY consent_type, created_at DESC
    `;

    return NextResponse.json({ consents: rows });
  } catch (error: any) {
    console.error("Error fetching consents:", error);
    return NextResponse.json({ error: "Failed to load consent records" }, { status: 500 });
  }
}

// POST — record a new consent event
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { consentType, granted } = body;

    if (!consentType || !CONSENT_TYPES.includes(consentType)) {
      return NextResponse.json(
        { error: `Invalid consent type. Must be one of: ${CONSENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const { sql, restaurantId } = await getTenantDb();
    await ensureConsentTable(sql);

    const { ipAddress, userAgent } = getRequestMeta(request);

    await sql`
      INSERT INTO consent_records (restaurant_id, user_id, consent_type, granted, ip_address, user_agent)
      VALUES (${restaurantId}, ${session.user.id}, ${consentType}, ${granted !== false}, ${ipAddress}, ${userAgent})
    `;

    logAuditEvent({
      restaurantId,
      eventType: granted !== false ? "consent_granted" : "consent_revoked",
      userId: session.user.id,
      userEmail: session.user.email || undefined,
      userRole: (session.user as any).role,
      ipAddress,
      userAgent,
      details: { consentType },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error recording consent:", error);
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 });
  }
}
