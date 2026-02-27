import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    // Get all completed bank statements, extract distinct months
    const rows = await sql`
      SELECT DISTINCT
        TO_CHAR(period_start::date, 'YYYY-MM') AS month_key,
        TO_CHAR(period_start::date, 'Mon YYYY') AS label,
        DATE_TRUNC('month', period_start::date)::date AS start_date,
        (DATE_TRUNC('month', period_start::date) + INTERVAL '1 month' - INTERVAL '1 day')::date AS end_date
      FROM bank_statements
      WHERE status = 'completed'
        AND period_start IS NOT NULL
        AND restaurant_id = ${restaurantId}
      ORDER BY month_key DESC
    `;

    return NextResponse.json({ months: rows });
  } catch (error: unknown) {
    console.error("Error fetching completed months:", error);
    return NextResponse.json(
      { error: "Failed to fetch completed months" },
      { status: 500 }
    );
  }
}
