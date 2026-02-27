import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

// POST - save a receipt as a food cost expense without matching to ingredients
// Used for one-off purchases from non-regular suppliers
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;

    const receiptRows = await sql`SELECT * FROM receipts WHERE id = ${id}`;
    const receipt = receiptRows[0] as Record<string, unknown> | undefined;

    if (!receipt) {
      return NextResponse.json(
        { error: "Receipt not found" },
        { status: 404 }
      );
    }

    // Mark all items as one-off (no ingredient matching needed)
    await sql`UPDATE receipt_items SET match_status = 'one_off', is_one_off = true WHERE receipt_id = ${id}`;

    // Mark the receipt as confirmed
    await sql`UPDATE receipts SET status = 'confirmed' WHERE id = ${id}`;

    // Create a COGS expense for the receipt total
    const supplier = (receipt.supplier as string) || "Unknown Store";
    const receiptDate = (receipt.receipt_date as string) || new Date().toISOString().slice(0, 10);
    const total = Number(receipt.total) || Number(receipt.subtotal) || 0;

    if (total > 0) {
      // Find a COGS category
      const catRows = await sql`SELECT id FROM expense_categories WHERE type = 'cogs' ORDER BY CASE WHEN name ILIKE '%ingredient%' OR name ILIKE '%food%' THEN 0 ELSE 1 END LIMIT 1`;
      const categoryId = catRows[0]?.id || null;

      // Only create if we haven't already (idempotent)
      const existing = await sql`SELECT id FROM expenses WHERE source = 'receipt' AND source_transaction_id = ${id} LIMIT 1`;
      if (existing.length === 0) {
        await sql`INSERT INTO expenses (id, category_id, description, amount, date, is_recurring, source, source_transaction_id, notes)
          VALUES (${uuid()}, ${categoryId}, ${`One-off purchase: ${supplier}`}, ${total}, ${receiptDate}, ${false}, 'receipt', ${id}, ${`One-off food purchase — not a regular supplier`})`;
      }
    }

    return NextResponse.json({
      success: true,
      receipt_id: id,
      expense_amount: total,
      supplier,
    });
  } catch (error: unknown) {
    console.error("Error saving receipt as cost:", error);
    return NextResponse.json(
      { error: "Failed to save receipt" },
      { status: 500 }
    );
  }
}
