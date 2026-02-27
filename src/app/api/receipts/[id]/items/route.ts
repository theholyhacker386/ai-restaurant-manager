import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// PUT - update receipt items (for manual price/quantity corrections after scanning)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;
    const { items } = await request.json();

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items must be an array" }, { status: 400 });
    }

    // Update each item
    for (const item of items) {
      if (!item.id) continue;
      await sql`UPDATE receipt_items
        SET raw_name = ${item.raw_name},
            quantity = ${item.quantity},
            unit_price = ${item.unit_price},
            total_price = ${item.total_price}
        WHERE id = ${item.id} AND receipt_id = ${id}`;
    }

    // Recalculate receipt totals from items
    const [totals] = await sql`
      SELECT COALESCE(SUM(total_price), 0) as subtotal
      FROM receipt_items WHERE receipt_id = ${id}` as Array<{ subtotal: number }>;

    const subtotal = Number(totals?.subtotal || 0);
    await sql`UPDATE receipts SET subtotal = ${subtotal} WHERE id = ${id}`;

    return NextResponse.json({ success: true, updated: items.length, subtotal });
  } catch (error: unknown) {
    console.error("Error updating receipt items:", error);
    return NextResponse.json({ error: "Failed to update items" }, { status: 500 });
  }
}
