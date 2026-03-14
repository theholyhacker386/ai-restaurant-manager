import { NextRequest, NextResponse } from "next/server";
import { getTenantDbWithFallback } from "@/lib/tenant";
import { ensurePlaidTables } from "@/lib/plaid";
import { categorizeTransactions } from "@/lib/categorize-transactions";
import { checkRateLimit } from "@/lib/rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  try {
    // Accept optional userId for onboarding context (falls back to auth session)
    const body = await request.json().catch(() => ({}));
    const userId = body?.userId;
    const { sql, restaurantId } = await getTenantDbWithFallback(userId);

    // Rate limit: 20 categorize requests per 15 minutes per restaurant
    const { limited } = checkRateLimit(`plaid-categorize-${restaurantId}`, 20, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await ensurePlaidTables(sql);

    // Step 1: Mark negative-amount pending transactions as income
    const incomeMarked = await sql`
      UPDATE plaid_transactions SET review_status = 'income'
      WHERE review_status = 'pending' AND amount < 0 AND restaurant_id = ${restaurantId}
      RETURNING transaction_id
    `;

    // Step 2: Get uncategorized EXPENSE transactions (positive amounts)
    const transactions = await sql`
      SELECT * FROM plaid_transactions
      WHERE review_status = 'pending' AND amount > 0 AND pending = false
        AND restaurant_id = ${restaurantId}
      ORDER BY date DESC
    `;

    if (transactions.length === 0 && incomeMarked.length === 0) {
      return NextResponse.json({ success: true, categorized: 0, message: "No new transactions to categorize" });
    }

    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        categorized: 0,
        income_marked: incomeMarked.length,
        message: `Marked ${incomeMarked.length} income transactions`,
      });
    }

    // Get learned rules for this restaurant
    const learnedRules = await sql`
      SELECT merchant_pattern, category_id, category_name, times_used
      FROM plaid_category_rules
      WHERE restaurant_id = ${restaurantId}
      ORDER BY times_used DESC
    `;

    // Categorize — AI suggests categories but NOTHING is auto-approved
    const { matches, transferIds, incomeIds } = await categorizeTransactions(transactions as any, learnedRules as any);

    // Mark transfers
    for (const txnId of transferIds) {
      await sql`
        UPDATE plaid_transactions SET review_status = 'transfer'
        WHERE transaction_id = ${txnId} AND restaurant_id = ${restaurantId}
      `;
    }

    // Mark AI-detected income
    for (const txnId of incomeIds) {
      await sql`
        UPDATE plaid_transactions SET
          amount = -ABS(amount),
          review_status = 'income'
        WHERE transaction_id = ${txnId} AND restaurant_id = ${restaurantId}
      `;
    }

    // Save suggestions — all go to "needs_review" so user must approve
    for (const match of matches) {
      await sql`
        UPDATE plaid_transactions SET
          suggested_category_id = ${match.category_id},
          auto_categorized = true,
          review_status = 'needs_review'
        WHERE transaction_id = ${match.transaction_id} AND restaurant_id = ${restaurantId}
      `;
    }

    return NextResponse.json({
      success: true,
      categorized: matches.length,
      needs_review: matches.length,
      transfers_detected: transferIds.length,
      income_detected: incomeIds.length,
      income_marked: incomeMarked.length,
    });
  } catch (error: unknown) {
    console.error("Error categorizing:", error);
    return NextResponse.json(
      { error: "Failed to categorize transactions" },
      { status: 500 }
    );
  }
}
