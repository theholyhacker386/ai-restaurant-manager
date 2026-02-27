import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.NEON_DATABASE_URL || "");

async function run() {
  // Get all learned rules from approved transactions
  const rules = await sql`
    SELECT merchant_pattern, category_id, category_name, times_used
    FROM plaid_category_rules
    ORDER BY times_used DESC
  `;
  console.log(`Found ${rules.length} learned rules`);

  let totalAutoApproved = 0;

  for (const rule of rules) {
    const pattern = rule.merchant_pattern;
    if (!pattern || pattern.length < 3) continue;

    const searchPattern = pattern.slice(0, 20);

    // Find unapproved transactions matching this merchant
    const similar = await sql`
      SELECT transaction_id, name, merchant_name, amount, date, source
      FROM plaid_transactions
      WHERE review_status IN ('needs_review', 'pending')
        AND amount > 0
        AND (
          LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(merchant_name, ''), '[0-9#*]+', '', 'g'), '\s+', ' ', 'g'))) LIKE ${"%" + searchPattern + "%"}
          OR LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(name, ''), '[0-9#*]+', '', 'g'), '\s+', ' ', 'g'))) LIKE ${"%" + searchPattern + "%"}
        )
    `;

    if (similar.length === 0) continue;

    for (const sim of similar) {
      // Fully approve
      await sql`
        UPDATE plaid_transactions SET
          approved_category_id = ${rule.category_id},
          suggested_category_id = ${rule.category_id},
          review_status = 'approved',
          auto_categorized = true
        WHERE transaction_id = ${sim.transaction_id}
      `;

      // Create expense entry
      const existingExp = await sql`
        SELECT id FROM expenses WHERE source_transaction_id = ${sim.transaction_id}
      `;

      if (existingExp.length === 0) {
        const expenseId = crypto.randomUUID();
        await sql`
          INSERT INTO expenses (id, category_id, description, amount, date, source, source_transaction_id)
          VALUES (${expenseId}, ${rule.category_id}, ${sim.merchant_name || sim.name}, ${Math.abs(sim.amount)}, ${sim.date}, ${sim.source || 'plaid'}, ${sim.transaction_id})
        `;
        await sql`
          UPDATE plaid_transactions SET expense_id = ${expenseId} WHERE transaction_id = ${sim.transaction_id}
        `;
      }

      totalAutoApproved++;
    }

    console.log(`  "${searchPattern}..." → ${rule.category_name}: ${similar.length} auto-approved`);
  }

  // Check final status
  const status = await sql`
    SELECT review_status, COUNT(*) as cnt FROM plaid_transactions WHERE source = 'statement' GROUP BY review_status ORDER BY cnt DESC
  `;
  console.log("\nFinal status:");
  for (const row of status) {
    console.log(`  ${row.review_status}: ${row.cnt}`);
  }

  console.log(`\nTotal auto-approved: ${totalAutoApproved}`);
}

run().catch(console.error);
