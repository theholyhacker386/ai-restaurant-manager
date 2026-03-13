import { NextResponse } from "next/server";
import { getTenantDbWithFallback } from "@/lib/tenant";
import { ensurePlaidTables } from "@/lib/plaid";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountIds, userId } = body;

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return NextResponse.json({ error: "No account IDs provided" }, { status: 400 });
    }

    const { sql, restaurantId } = await getTenantDbWithFallback(userId);
    await ensurePlaidTables(sql);

    // Ensure is_business column exists
    await sql`ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT false`;

    // Reset all accounts to non-business first
    await sql`UPDATE plaid_accounts SET is_business = false WHERE restaurant_id = ${restaurantId}`;

    // Mark selected accounts as business
    await sql`
      UPDATE plaid_accounts SET is_business = true
      WHERE restaurant_id = ${restaurantId} AND account_id = ANY(${accountIds})
    `;

    return NextResponse.json({ success: true, marked: accountIds.length });
  } catch (error: unknown) {
    console.error("Error marking business accounts:", error);
    return NextResponse.json({ error: "Failed to mark business accounts" }, { status: 500 });
  }
}
