import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { categorizeTransactions } from "../lib/categorize-transactions";

const sql = neon(process.env.NEON_DATABASE_URL || "");

async function run() {
  const transactions = await sql`
    SELECT id, transaction_id, amount, date, name, merchant_name, category, category_detailed
    FROM plaid_transactions
    WHERE review_status = 'pending' AND amount > 0
    ORDER BY date DESC
  `;
  console.log("Found", transactions.length, "transactions to categorize");

  if (transactions.length === 0) {
    console.log("Nothing to do");
    return;
  }

  const learnedRules = await sql`
    SELECT merchant_pattern, category_id, category_name, times_used
    FROM plaid_category_rules ORDER BY times_used DESC
  `;
  console.log("Learned rules:", learnedRules.length);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { matches, transferIds, incomeIds } = await categorizeTransactions(transactions as any, learnedRules as any);
  console.log("Results:", matches.length, "categorized,", transferIds.length, "transfers,", incomeIds.length, "income");

  for (const txnId of transferIds) {
    await sql`UPDATE plaid_transactions SET review_status = 'transfer' WHERE transaction_id = ${txnId}`;
  }
  for (const txnId of incomeIds) {
    await sql`UPDATE plaid_transactions SET amount = -ABS(amount), review_status = 'income' WHERE transaction_id = ${txnId}`;
  }
  for (const match of matches) {
    await sql`UPDATE plaid_transactions SET suggested_category_id = ${match.category_id}, auto_categorized = true, review_status = 'needs_review' WHERE transaction_id = ${match.transaction_id}`;
  }

  const breakdown: Record<string, number> = {};
  for (const m of matches) {
    breakdown[m.category_id] = (breakdown[m.category_id] || 0) + 1;
  }
  console.log("\nCategory breakdown:");
  for (const [cat, count] of Object.entries(breakdown).sort((a, b) => (b[1] as number) - (a[1] as number))) {
    console.log(" ", cat, ":", count);
  }
  console.log("\nDone!");
}

run().catch(console.error);
