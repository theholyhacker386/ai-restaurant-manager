import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { ensurePlaidTables } from "@/lib/plaid";

/**
 * Helper: fully approve a single transaction — mark it approved, create expense entry, learn the rule.
 * Returns the merchant pattern so we can find similar transactions.
 */
async function approveSingle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  restaurantId: string,
  transactionId: string,
  categoryId: string,
  categoryName: string
): Promise<{ merchantPattern: string | null }> {
  const txns = await sql`
    SELECT * FROM plaid_transactions
    WHERE transaction_id = ${transactionId} AND restaurant_id = ${restaurantId}
  `;
  if (txns.length === 0) return { merchantPattern: null };

  const txn = txns[0];

  // Mark as approved
  await sql`
    UPDATE plaid_transactions SET
      approved_category_id = ${categoryId},
      suggested_category_id = ${categoryId},
      review_status = 'approved'
    WHERE transaction_id = ${transactionId} AND restaurant_id = ${restaurantId}
  `;

  // Create or update expense entry
  const existing = await sql`
    SELECT id FROM expenses
    WHERE source_transaction_id = ${transactionId} AND restaurant_id = ${restaurantId}
  `;

  let expenseId;
  if (existing.length > 0) {
    expenseId = existing[0].id;
    await sql`
      UPDATE expenses SET category_id = ${categoryId}, description = ${txn.merchant_name || txn.name}
      WHERE id = ${expenseId} AND restaurant_id = ${restaurantId}
    `;
  } else {
    expenseId = crypto.randomUUID();
    await sql`
      INSERT INTO expenses (id, category_id, description, amount, date, source, source_transaction_id, restaurant_id)
      VALUES (${expenseId}, ${categoryId}, ${txn.merchant_name || txn.name}, ${Math.abs(txn.amount)}, ${txn.date}, ${txn.source || 'plaid'}, ${transactionId}, ${restaurantId})
    `;
  }

  await sql`
    UPDATE plaid_transactions SET expense_id = ${expenseId}
    WHERE transaction_id = ${transactionId} AND restaurant_id = ${restaurantId}
  `;

  // Learn the merchant -> category rule
  const merchantPattern = (txn.merchant_name || txn.name || "")
    .toLowerCase()
    .replace(/[0-9#*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (merchantPattern.length > 2) {
    const ruleId = crypto.randomUUID();
    await sql`
      INSERT INTO plaid_category_rules (id, restaurant_id, merchant_pattern, category_id, category_name)
      VALUES (${ruleId}, ${restaurantId}, ${merchantPattern}, ${categoryId}, ${categoryName})
      ON CONFLICT (restaurant_id, merchant_pattern, category_id) DO UPDATE SET
        times_used = plaid_category_rules.times_used + 1,
        updated_at = NOW()
    `;
  }

  return { merchantPattern };
}

/**
 * After approving transactions, find ALL similar merchants across ALL months
 * and fully auto-approve them with the same category — scoped to this restaurant.
 */
async function autoApproveMatchingMerchants(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  restaurantId: string,
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
      WHERE restaurant_id = ${restaurantId}
        AND review_status IN ('needs_review', 'pending', 'approved')
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
        WHERE transaction_id = ${sim.transaction_id} AND restaurant_id = ${restaurantId}
      `;

      // Create expense entry
      const existingExp = await sql`
        SELECT id FROM expenses
        WHERE source_transaction_id = ${sim.transaction_id} AND restaurant_id = ${restaurantId}
      `;

      let expenseId;
      if (existingExp.length > 0) {
        expenseId = existingExp[0].id;
        await sql`
          UPDATE expenses SET category_id = ${categoryId}
          WHERE id = ${expenseId} AND restaurant_id = ${restaurantId}
        `;
      } else {
        expenseId = crypto.randomUUID();
        await sql`
          INSERT INTO expenses (id, category_id, description, amount, date, source, source_transaction_id, restaurant_id)
          VALUES (${expenseId}, ${categoryId}, ${sim.merchant_name || sim.name}, ${Math.abs(sim.amount)}, ${sim.date}, ${sim.source || 'plaid'}, ${sim.transaction_id}, ${restaurantId})
        `;
      }

      await sql`
        UPDATE plaid_transactions SET expense_id = ${expenseId}
        WHERE transaction_id = ${sim.transaction_id} AND restaurant_id = ${restaurantId}
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
    const { sql, restaurantId } = await getTenantDb();
    await ensurePlaidTables(sql);

    const { transaction_id, category_id, category_name } = await request.json();

    if (!transaction_id || !category_id) {
      return NextResponse.json(
        { error: "Missing transaction_id or category_id" },
        { status: 400 }
      );
    }

    const { merchantPattern } = await approveSingle(sql, restaurantId, transaction_id, category_id, category_name || "");

    // Auto-approve all matching merchants across ALL months
    const patterns = new Map<string, { categoryId: string; categoryName: string }>();
    if (merchantPattern) {
      patterns.set(merchantPattern, { categoryId: category_id, categoryName: category_name || "" });
    }
    const autoApproved = await autoApproveMatchingMerchants(sql, restaurantId, patterns);

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
    const { sql, restaurantId } = await getTenantDb();
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
        restaurantId,
        item.transaction_id,
        item.category_id,
        item.category_name || ""
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
    const autoApproved = await autoApproveMatchingMerchants(sql, restaurantId, patterns);

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
