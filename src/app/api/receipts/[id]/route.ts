import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET - single receipt with all its items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;

    const receiptRows = await sql`SELECT * FROM receipts WHERE id = ${id}`;
    const receipt = receiptRows[0];

    if (!receipt) {
      return NextResponse.json(
        { error: "Receipt not found" },
        { status: 404 }
      );
    }

    const items = await sql`SELECT ri.*, i.name as ingredient_name, i.package_price as current_package_price,
                i.package_size as current_package_size, i.package_unit as current_package_unit,
                i.cost_per_unit as current_cost_per_unit
         FROM receipt_items ri
         LEFT JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE ri.receipt_id = ${id}
         ORDER BY ri.created_at`;

    return NextResponse.json({ receipt, items });
  } catch (error: unknown) {
    console.error("Error fetching receipt:", error);
    return NextResponse.json(
      { error: "Failed to fetch receipt" },
      { status: 500 }
    );
  }
}

// DELETE - remove a receipt and its items
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;

    const receiptRows = await sql`SELECT * FROM receipts WHERE id = ${id}`;
    const receipt = receiptRows[0];

    if (!receipt) {
      return NextResponse.json(
        { error: "Receipt not found" },
        { status: 404 }
      );
    }

    // Delete related records first (receipt_items, price history, expenses)
    await sql`DELETE FROM ingredient_price_history WHERE receipt_id = ${id}`;
    await sql`DELETE FROM expenses WHERE source = 'receipt' AND source_transaction_id = ${id}`;
    await sql`DELETE FROM receipt_items WHERE receipt_id = ${id}`;
    await sql`DELETE FROM receipts WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting receipt:", error);
    return NextResponse.json(
      { error: "Failed to delete receipt" },
      { status: 500 }
    );
  }
}
