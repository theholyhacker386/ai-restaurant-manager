import { NextResponse } from "next/server";
import { after } from "next/server";
import { getDb } from "@/lib/db";
import { getProcessingSummary, processAllQueued } from "@/lib/process-statement";

export const maxDuration = 300;

export async function GET() {
  try {
    const sql = getDb();

    // Get all statements from the last 24 hours with their current status
    const statements = await sql`
      SELECT
        id, file_name, status, bank_name, transaction_count, error_message, created_at
      FROM bank_statements
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `;

    const summary = await getProcessingSummary();

    // If there are queued or stuck items, re-trigger background processing.
    // This acts as a safety net — every time the UI polls for status,
    // we nudge the system to keep working in case the previous job died.
    if (summary.queued > 0 || summary.processing > 0) {
      after(async () => {
        try {
          await processAllQueued();
        } catch (err) {
          console.error("[status] Background re-trigger error:", err);
        }
      });
    }

    return NextResponse.json({
      statements,
      summary,
    });
  } catch (error: unknown) {
    console.error("Error fetching statement status:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}
