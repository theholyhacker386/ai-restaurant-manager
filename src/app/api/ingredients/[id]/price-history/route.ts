import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

// GET - price history for one ingredient
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const { id } = await params;

    const rows = await sql`SELECT * FROM ingredients WHERE id = ${id} AND restaurant_id = ${restaurantId}`;
    const ingredient = rows[0];

    if (!ingredient) {
      return NextResponse.json(
        { error: "Ingredient not found" },
        { status: 404 }
      );
    }

    const history = await sql`SELECT iph.*, r.supplier, r.receipt_date
         FROM ingredient_price_history iph
         LEFT JOIN receipts r ON iph.receipt_id = r.id
         WHERE iph.ingredient_id = ${id}
         ORDER BY iph.recorded_at DESC`;

    return NextResponse.json({ ingredient, history });
  } catch (error: unknown) {
    console.error("Error fetching price history:", error);
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    );
  }
}
