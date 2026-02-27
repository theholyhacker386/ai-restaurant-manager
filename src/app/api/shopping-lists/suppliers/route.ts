import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

/**
 * Get all unique suppliers from ingredients.
 */
export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const suppliers = await sql`
      SELECT DISTINCT supplier, COUNT(*) as ingredient_count
      FROM ingredients
      WHERE supplier IS NOT NULL AND supplier != '' AND restaurant_id = ${restaurantId}
      GROUP BY supplier
      ORDER BY ingredient_count DESC
    `;

    return NextResponse.json(suppliers);
  } catch (error: unknown) {
    console.error("Suppliers error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
