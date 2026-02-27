import { NextResponse } from "next/server";
import { getPlaidClient, ensurePlaidTables } from "@/lib/plaid";
import { getDb } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { v4 as uuid } from "uuid";

export async function POST() {
  try {
    const client = getPlaidClient();
    const sql = getDb();

    await ensurePlaidTables(sql);

    // Get all active Plaid items
    const items = await sql`
      SELECT * FROM plaid_items WHERE status = 'active'
    `;

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No bank accounts connected",
        synced: 0,
      });
    }

    let totalSynced = 0;

    for (const item of items) {
      const accessToken = decrypt(item.access_token);
      let hasMore = true;
      let cursor = item.cursor || undefined;

      while (hasMore) {
        const response = await client.transactionsSync({
          access_token: accessToken,
          cursor: cursor || undefined,
        });

        const { added, modified, removed, has_more, next_cursor } =
          response.data;

        // Process added transactions
        for (const txn of added) {
          const txnId = uuid();
          const primaryCategory =
            txn.personal_finance_category?.primary || null;
          const detailedCategory =
            txn.personal_finance_category?.detailed || null;

          await sql`
            INSERT INTO plaid_transactions (id, plaid_account_id, transaction_id, amount, date, name, merchant_name, category, category_detailed, pending)
            VALUES (${txnId}, ${txn.account_id}, ${txn.transaction_id}, ${txn.amount}, ${txn.date}, ${txn.name}, ${txn.merchant_name || null}, ${primaryCategory}, ${detailedCategory}, ${txn.pending})
            ON CONFLICT (transaction_id) DO UPDATE SET
              amount = EXCLUDED.amount,
              name = EXCLUDED.name,
              merchant_name = EXCLUDED.merchant_name,
              category = EXCLUDED.category,
              category_detailed = EXCLUDED.category_detailed,
              pending = EXCLUDED.pending
          `;
          totalSynced++;
        }

        // Process modified transactions
        for (const txn of modified) {
          const primaryCategory =
            txn.personal_finance_category?.primary || null;
          const detailedCategory =
            txn.personal_finance_category?.detailed || null;

          await sql`
            UPDATE plaid_transactions SET
              amount = ${txn.amount},
              name = ${txn.name},
              merchant_name = ${txn.merchant_name || null},
              category = ${primaryCategory},
              category_detailed = ${detailedCategory},
              pending = ${txn.pending}
            WHERE transaction_id = ${txn.transaction_id}
          `;
        }

        // Process removed transactions
        for (const txn of removed) {
          if (txn.transaction_id) {
            await sql`
              DELETE FROM plaid_transactions WHERE transaction_id = ${txn.transaction_id}
            `;
          }
        }

        hasMore = has_more;
        cursor = next_cursor;
      }

      // Save cursor for next sync
      await sql`
        UPDATE plaid_items SET cursor = ${cursor}, updated_at = NOW() WHERE id = ${item.id}
      `;

      // Update account balances
      try {
        const balanceResponse = await client.accountsGet({
          access_token: accessToken,
        });
        for (const account of balanceResponse.data.accounts) {
          await sql`
            UPDATE plaid_accounts SET
              current_balance = ${account.balances.current},
              available_balance = ${account.balances.available},
              last_synced = NOW()
            WHERE account_id = ${account.account_id}
          `;
        }
      } catch {
        // Balance update is non-critical
      }
    }

    return NextResponse.json({
      success: true,
      synced: totalSynced,
    });
  } catch (error: unknown) {
    console.error("Error syncing transactions:", error);
    return NextResponse.json(
      { error: "Failed to sync transactions" },
      { status: 500 }
    );
  }
}
