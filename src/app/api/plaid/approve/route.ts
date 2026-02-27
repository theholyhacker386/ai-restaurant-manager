import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensurePlaidTables } from "@/lib/plaid";

/**
 * Helper: fully approve a single transaction — mark it approved, create expense entry, learn the rule.
 * Returns the merchant pattern so we can find similar transactions.
 */
async function approveSingle(
  sql: ReturnType<typeof getDb>,
  transactionId: string,
  categoryId: string,
  categoryName: string,
  isSoftExpense: boolean = false
): Promise<{ merchantPattern: string | null }> {
  const txns = await sql`
    SELECT * FROM plaid_transactions WHERE transaction_id = ${transactionId}
  `;
  if (txns.length === 0) return { merchantPattern: null };

  const txn = txns[0];

  // Mark as approved
  await sql`
    UPDATE plaid_transactions SET
      approved_category_id = ${categoryId},
      suggested_category_id = ${categoryId},
      review_status = 'approved',
      is_soft_expense = ${isSoftExpense}
    WHERE transaction_id = ${transactionId}
  `;

  // Create or update expense entry
  const existing = await sql`
    SELECT id FROM expenses WHERE source_transaction_id = ${transactionId}
  `;

  let expenseId;
  if (existing.length > 0) {
    expenseId = existing[0].id;
    await sql`
      UPDATE expenses SET category_id = ${categoryId}, description = ${txn.merchant_name || txn.name}
      WHERE id = ${expenseId}
    `;
  } else {
    expenseId = crypto.randomUUID();
    await sql`
      INSERT INTO expenses (id, category_id, description, amount, date, source, source_transaction_id, is_soft_expense)
      VALUES (${expenseId}, ${categoryId}, ${txn.merchant_name || txn.name}, ${Math.abs(txn.amount)}, ${txn.date}, ${txn.source || 'plaid'}, ${transactionId}, ${isSoftExpense})
    `;
  }

  await sql`
    UPDATE plaid_transactions SET expense_id = ${expenseId} WHERE transaction_id = ${transactionId}
  `;

  // Learn the merchant → category rule
  const merchantPattern = (txn.merchant_name || txn.name || "")
    .toLowerCase()
    .replace(/[0-9#*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (merchantPattern.length > 2) {
    const ruleId = crypto.randomUUID();
    await sql`
      INSERT INTO plaid_category_rules (id, merchant_pattern, category_id, category_name)
      VALUES (${ruleId}, ${merchantPattern}, ${categoryId}, ${categoryName})
      ON CONFLICT (merchant_pattern, category_id) DO UPDATE SET
        times_used = plaid_category_rules.times_used + 1,
        updated_at = NOW()
    `;
  }

  return { merchantPattern };
}

/**
 * After approving transactions, find ALL similar merchants across ALL months
 * and fully auto-approve them with the same category.
 */
async function autoApproveMatchingMerchants(
  sql: ReturnType<typeof getDb>,
  merchantPatterns: Map<string, { categoryId: string; categoryName: string }>
): Promise<number> {
  let totalAutoApproved = 0;

  for (const [pattern, { categoryId, categoryName }] of merchantPatterns) {
    if (pattern.length < 3) continue;

    // Use the first 20 chars of the pattern to find similar merchants
    const searchPattern = pattern.slice(0, 20);

    // Find ALL transactions from the same merchant — including already-approved ones
    // so if the user CHANGES a category, it fixes everything everywhere
    const similar = await sql`
      SELECT transaction_id, name, merchant_name, amount, date, source, review_status, approved_category_id
      FROM plaid_transactions
      WHERE review_status IN ('needs_review', 'pending', 'approved')
        AND amount > 0
        AND (
          LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(merchant_name, ''), '[0-9#*]+', '', 'g'), '\s+', ' ', 'g'))) LIKE ${"%" + searchPattern + "%"}
          OR LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(name, ''), '[0-9#*]+', '', 'g'), '\s+', ' ', 'g'))) LIKE ${"%" + searchPattern + "%"}
        )
    `;

    for (const sim of similar) {
      // Skip if already approved with the SAME category (nothing to change)
      if (sim.review_status === "approved" && sim.approved_category_id === categoryId) continue;

      // Fully approve — same as if they clicked approve manually
      await sql`
        UPDATE plaid_transactions SET
          approved_category_id = ${categoryId},
          suggested_category_id = ${categoryId},
          review_status = 'approved',
          auto_categorized = true
        WHERE transaction_id = ${sim.transaction_id}
      `;

      // Create expense entry
      const existingExp = await sql`
        SELECT id FROM expenses WHERE source_transaction_id = ${sim.transaction_id}
      `;

      let expenseId;
      if (existingExp.length > 0) {
        expenseId = existingExp[0].id;
        await sql`
          UPDATE expenses SET category_id = ${categoryId}
          WHERE id = ${expenseId}
        `;
      } else {
        expenseId = crypto.randomUUID();
        await sql`
          INSERT INTO expenses (id, category_id, description, amount, date, source, source_transaction_id)
          VALUES (${expenseId}, ${categoryId}, ${sim.merchant_name || sim.name}, ${Math.abs(sim.amount)}, ${sim.date}, ${sim.source || 'plaid'}, ${sim.transaction_id})
        `;
      }

      await sql`
        UPDATE plaid_transactions SET expense_id = ${expenseId} WHERE transaction_id = ${sim.transaction_id}
      `;

      totalAutoApproved++;
    }

    if (similar.length > 0) {
      console.log(`[auto-approve] "${searchPattern}..." → ${categoryName}: auto-approved ${similar.length} matching transactions`);
    }
  }

  return totalAutoApproved;
}

// Single approve
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    await ensurePlaidTables(sql);

    const { transaction_id, category_id, category_name, is_soft_expense } = await request.json();

    if (!transaction_id || !category_id) {
      return NextResponse.json(
        { error: "Missing transaction_id or category_id" },
        { status: 400 }
      );
    }

    const { merchantPattern } = await approveSingle(sql, transaction_id, category_id, category_name || "", is_soft_expense || false);

    // Auto-approve all matching merchants across ALL months
    const patterns = new Map<string, { categoryId: string; categoryName: string }>();
    if (merchantPattern) {
      patterns.set(merchantPattern, { categoryId: category_id, categoryName: category_name || "" });
    }
    const autoApproved = await autoApproveMatchingMerchants(sql, patterns);

    return NextResponse.json({ success: true, also_approved: autoApproved });
  } catch (error: unknown) {
    console.error("Error approving transaction:", error);
    return NextResponse.json(
      { error: "Failed to approve transaction" },
      { status: 500 }
    );
  }
}

// Bulk approve
export async function PUT(request: NextRequest) {
  try {
    const sql = getDb();
    await ensurePlaidTables(sql);

    const { approvals } = await request.json();

    if (!Array.isArray(approvals) || approvals.length === 0) {
      return NextResponse.json(
        { error: "No approvals provided" },
        { status: 400 }
      );
    }

    // Collect all merchant patterns from this batch
    const patterns = new Map<string, { categoryId: string; categoryName: string }>();

    let approved = 0;
    for (const item of approvals) {
      const { merchantPattern } = await approveSingle(
        sql,
        item.transaction_id,
        item.category_id,
        item.category_name || "",
        item.is_soft_expense || false
      );

      if (merchantPattern) {
        patterns.set(merchantPattern, {
          categoryId: item.category_id,
          categoryName: item.category_name || "",
        });
      }
      approved++;
    }

    // After all approvals, auto-approve matching merchants across ALL other months
    const autoApproved = await autoApproveMatchingMerchants(sql, patterns);

    return NextResponse.json({
      success: true,
      approved,
      also_auto_approved: autoApproved,
    });
  } catch (error: unknown) {
    console.error("Error bulk approving:", error);
    return NextResponse.json(
      { error: "Failed to approve transactions" },
      { status: 500 }
    );
  }
}
