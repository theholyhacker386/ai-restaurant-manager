import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/square/sync-status
 * Returns freshness info for each sync type.
 * Used by useSquareSync to decide if a sync is needed.
 */
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM sync_metadata` as any[];

    const result: Record<string, any> = {};
    for (const row of rows) {
      const lastSyncAt = row.last_sync_at ? new Date(row.last_sync_at).getTime() : 0;
      const ageMs = lastSyncAt ? Date.now() - lastSyncAt : Infinity;
      result[row.sync_type] = {
        isFresh: ageMs < FRESHNESS_THRESHOLD_MS,
        lastSyncAt: row.last_sync_at,
        lastSyncStatus: row.last_sync_status,
        lastError: row.last_error,
        ageMs: Math.round(ageMs),
      };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Sync status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/square/sync-status
 * Updates the sync timestamp for a given sync type.
 * Body: { syncType, status, error?, durationMs? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { syncType, status, error, durationMs } = body;

    if (!syncType || !status) {
      return NextResponse.json(
        { error: "syncType and status are required" },
        { status: 400 }
      );
    }

    const sql = getDb();
    await sql`
      INSERT INTO sync_metadata (sync_type, last_sync_at, last_sync_status, last_error, sync_duration_ms)
      VALUES (${syncType}, NOW(), ${status}, ${error || null}, ${durationMs || null})
      ON CONFLICT (sync_type) DO UPDATE SET
        last_sync_at = NOW(),
        last_sync_status = EXCLUDED.last_sync_status,
        last_error = EXCLUDED.last_error,
        sync_duration_ms = EXCLUDED.sync_duration_ms
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sync status update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
