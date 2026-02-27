import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    const statements = await sql`
      SELECT id, file_name, bank_name, statement_date, period_start, period_end,
             transaction_count, status, error_message, created_at
      FROM bank_statements
      WHERE restaurant_id = ${restaurantId}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return NextResponse.json({ statements });
  } catch (error: unknown) {
    console.error("Error fetching statements:", error);
    return NextResponse.json(
      { error: "Failed to fetch statements" },
      { status: 500 }
    );
  }
}
