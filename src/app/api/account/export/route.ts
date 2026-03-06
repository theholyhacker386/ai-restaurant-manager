import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET — Export user's personal data (GDPR-style data portability)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;
    const { sql, restaurantId } = await getTenantDb();

    // Gather user profile
    const userRows = await sql`
      SELECT id, email, name, role, created_at
      FROM users WHERE id = ${userId} AND restaurant_id = ${restaurantId}
    `;

    // Gather consent records (table may not exist yet)
    let consentRows: any[] = [];
    try {
      consentRows = await sql`
        SELECT consent_type, granted, created_at
        FROM consent_records WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;
    } catch {
      // consent_records table doesn't exist yet
    }

    // Gather audit log — their own activity (table may not exist yet)
    let auditRows: any[] = [];
    try {
      auditRows = await sql`
        SELECT event_type, ip_address, resource, details, created_at
        FROM audit_log WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 500
      `;
    } catch {
      // audit_log table doesn't exist yet
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user: userRows[0] || null,
      consent_records: consentRows,
      activity_log: auditRows,
    };

    const { ipAddress, userAgent } = getRequestMeta(request);
    logAuditEvent({
      restaurantId,
      eventType: "data_exported",
      userId,
      userEmail: session.user.email || undefined,
      userRole: (session.user as any).role,
      ipAddress,
      userAgent,
    });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error: any) {
    console.error("Data export error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
