import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

// GET - list all receipts with optional filters
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const supplier = searchParams.get("supplier");
    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Build query dynamically - since Neon uses tagged templates,
    // we handle optional filters by always including them with null checks
    let receipts;
    if (supplier && status && startDate && endDate) {
      receipts = await sql`
        SELECT r.*,
          (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) as item_count,
          (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id AND ri.match_status IN ('auto_matched', 'manual_matched')) as matched_count
        FROM receipts r
        WHERE r.supplier LIKE ${'%' + supplier + '%'} AND r.status = ${status} AND r.receipt_date >= ${startDate} AND r.receipt_date <= ${endDate}
        ORDER BY r.created_at DESC`;
    } else if (status) {
      receipts = await sql`
        SELECT r.*,
          (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) as item_count,
          (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id AND ri.match_status IN ('auto_matched', 'manual_matched')) as matched_count
        FROM receipts r
        WHERE r.status = ${status}
        ORDER BY r.created_at DESC`;
    } else {
      receipts = await sql`
        SELECT r.*,
          (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) as item_count,
          (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id AND ri.match_status IN ('auto_matched', 'manual_matched')) as matched_count,
          (SELECT string_agg(ri.raw_name, ', ') FROM receipt_items ri WHERE ri.receipt_id = r.id) as item_names
        FROM receipts r
        ORDER BY r.created_at DESC`;
    }

    const priceAlerts = await sql`SELECT ri.raw_name,
                (ri.total_price / GREATEST(ri.quantity, 1)) as new_price,
                i.name as ingredient_name,
                i.package_price as old_price, r.id as receipt_id, r.receipt_date
         FROM receipt_items ri
         JOIN receipts r ON ri.receipt_id = r.id
         JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE r.status = 'confirmed'
           AND i.package_price > 0
           AND ri.total_price > 0
           AND ri.match_status IN ('auto_matched', 'manual_matched')
           AND (((ri.total_price / GREATEST(ri.quantity, 1)) - i.package_price) / i.package_price) > 0.30
         ORDER BY r.created_at DESC
         LIMIT 10`;

    return NextResponse.json({ receipts, priceAlerts });
  } catch (error: unknown) {
    console.error("Error fetching receipts:", error);
    return NextResponse.json(
      { error: "Failed to fetch receipts" },
      { status: 500 }
    );
  }
}

// POST - create a new receipt record
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();

    const { supplier, receipt_date, subtotal, tax, total, image_path, notes } = body;

    const id = uuid();

    await sql`INSERT INTO receipts (id, supplier, receipt_date, subtotal, tax, total, image_path, status, notes)
       VALUES (${id}, ${supplier || null}, ${receipt_date || null}, ${subtotal || 0}, ${tax || 0}, ${total || 0}, ${image_path || null}, 'pending', ${notes || null})`;

    return NextResponse.json({ id, status: "pending" });
  } catch (error: unknown) {
    console.error("Error creating receipt:", error);
    return NextResponse.json(
      { error: "Failed to create receipt" },
      { status: 500 }
    );
  }
}
