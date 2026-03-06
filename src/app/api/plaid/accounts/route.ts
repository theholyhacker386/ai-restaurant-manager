import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { ensurePlaidTables } from "@/lib/plaid";

export async function GET(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    await ensurePlaidTables(sql);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Get connected accounts for this restaurant only
    const accounts = await sql`
      SELECT pa.*, pi.institution_name, pi.status as item_status
      FROM plaid_accounts pa
      JOIN plaid_items pi ON pa.plaid_item_id = pi.id
      WHERE pi.status = 'active' AND pa.restaurant_id = ${restaurantId}
      ORDER BY pa.created_at DESC
    `;

    // Get transactions for this restaurant (with optional date filter)
    let transactions;
    if (startDate && endDate) {
      transactions = await sql`
        SELECT * FROM plaid_transactions
        WHERE date >= ${startDate} AND date <= ${endDate} AND pending = false
          AND restaurant_id = ${restaurantId}
        ORDER BY date DESC
      `;
    } else {
      transactions = await sql`
        SELECT * FROM plaid_transactions
        WHERE pending = false AND restaurant_id = ${restaurantId}
        ORDER BY date DESC
      `;
    }

    return NextResponse.json({ accounts, transactions });
  } catch (error: unknown) {
    console.error("Error fetching Plaid data:", error);
    return NextResponse.json(
      { error: "Failed to fetch bank data" },
      { status: 500 }
    );
  }
}
