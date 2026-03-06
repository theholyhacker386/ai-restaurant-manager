import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { auth } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET — query audit log (owner-only)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can view audit logs" },
        { status: 403 }
      );
    }

    const { sql, restaurantId } = await getTenantDb();
    const { searchParams } = request.nextUrl;

    const eventType = searchParams.get("type");
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
    const offset = Number(searchParams.get("offset") || 0);

    // Build query with optional filters — always scoped to this restaurant
    let rows;
    if (eventType && userId) {
      rows = await sql`
        SELECT * FROM audit_log
        WHERE restaurant_id = ${restaurantId}
          AND event_type = ${eventType}
          AND user_id = ${userId}
          AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (eventType) {
      rows = await sql`
        SELECT * FROM audit_log
        WHERE restaurant_id = ${restaurantId}
          AND event_type = ${eventType}
          AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (userId) {
      rows = await sql`
        SELECT * FROM audit_log
        WHERE restaurant_id = ${restaurantId}
          AND user_id = ${userId}
          AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      rows = await sql`
        SELECT * FROM audit_log
        WHERE restaurant_id = ${restaurantId}
          AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return NextResponse.json({ entries: rows, limit, offset });
  } catch (error: any) {
    console.error("Error fetching audit log:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit log" },
      { status: 500 }
    );
  }
}
