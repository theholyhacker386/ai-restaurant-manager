import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensurePlaidTables } from "@/lib/plaid";
import { categorizeTransactions } from "@/lib/categorize-transactions";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST() {
  try {
    const sql = getDb();
    await ensurePlaidTables(sql);

    // Step 1: Mark negative-amount pending transactions as income
    // These are deposits (DoorDash, Square, etc.) — not expenses
    const incomeMarked = await sql`
      UPDATE plaid_transactions SET review_status = 'income'
      WHERE review_status = 'pending' AND amount < 0
      RETURNING transaction_id
    `;

    // Step 2: Get uncategorized EXPENSE transactions (positive amounts)
    const transactions = await sql`
      SELECT * FROM plaid_transactions
      WHERE review_status = 'pending' AND amount > 0 AND pending = false
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

    // Get learned rules (previously approved merchant-to-category mappings)
    const learnedRules = await sql`
      SELECT merchant_pattern, category_id, category_name, times_used
      FROM plaid_category_rules
      ORDER BY times_used DESC
    `;

    // Categorize — AI suggests categories but NOTHING is auto-approved
    const { matches, transferIds, incomeIds } = await categorizeTransactions(transactions as any, learnedRules as any);

    // Mark transfers — CC payments, bank transfers, etc.
    for (const txnId of transferIds) {
      await sql`
        UPDATE plaid_transactions SET review_status = 'transfer'
        WHERE transaction_id = ${txnId}
      `;
    }

    // Mark AI-detected income — flip amount sign and mark as income
    for (const txnId of incomeIds) {
      await sql`
        UPDATE plaid_transactions SET
          amount = -ABS(amount),
          review_status = 'income'
        WHERE transaction_id = ${txnId}
      `;
    }

    // Log what AI decided for debugging
    console.log("CATEGORIZE RESULTS:", matches.map(m => `${m.transaction_id.slice(-6)}: ${m.category_id} (${m.source})`));
    console.log("TRANSFERS:", transferIds.length, "INCOME:", incomeIds.length);

    // Save suggestions — all go to "needs_review" so user must approve at least once
    for (const match of matches) {
      await sql`
        UPDATE plaid_transactions SET
          suggested_category_id = ${match.category_id},
          auto_categorized = true,
          review_status = 'needs_review'
        WHERE transaction_id = ${match.transaction_id}
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
