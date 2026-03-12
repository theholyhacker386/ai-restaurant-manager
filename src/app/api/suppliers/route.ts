import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

/**
 * GET /api/suppliers
 * Returns all suppliers saved for this restaurant (from suppliers table + unique from ingredients).
 */
export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    // Get from dedicated suppliers table
    const tableSuppliers = await sql`
      SELECT name FROM suppliers
      WHERE restaurant_id = ${restaurantId}
      ORDER BY name
    `;

    // Get unique suppliers from ingredients table too
    const ingredientSuppliers = await sql`
      SELECT DISTINCT supplier as name FROM ingredients
      WHERE supplier IS NOT NULL
        AND supplier != ''
        AND supplier != 'Homemade'
        AND restaurant_id = ${restaurantId}
    `;

    // Merge and deduplicate
    const allNames = new Set<string>();
    for (const row of [...tableSuppliers, ...ingredientSuppliers]) {
      if (row.name) allNames.add(row.name);
    }

    const suppliers = Array.from(allNames).sort();
    return NextResponse.json({ suppliers });
  } catch (error: unknown) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json(
      { error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}
