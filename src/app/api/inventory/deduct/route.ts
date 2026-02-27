import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function POST(request: Request) {
  const { menuItemId, quantity } = await request.json();

  if (!menuItemId || !quantity) {
    return NextResponse.json({ error: "Missing menuItemId or quantity" }, { status: 400 });
  }

  try {
    const { sql, restaurantId } = await getTenantDb();

    const recipe = await sql`
      SELECT
        r.ingredient_id,
        r.quantity as recipe_qty,
        i.name as ingredient_name,
        i.unit
      FROM recipes r
      JOIN ingredients i ON r.ingredient_id = i.id
      WHERE r.menu_item_id = ${menuItemId}
      AND i.ingredient_type = 'food'
      AND i.restaurant_id = ${restaurantId}
    ` as any[];

    if (recipe.length === 0) {
      return NextResponse.json(
        { warning: "No recipe found for this menu item", deducted: [] },
        { status: 200 }
      );
    }

    const deductions: any[] = [];

    for (const item of recipe) {
      const totalDeduction = item.recipe_qty * quantity;
      deductions.push({
        ingredient_id: item.ingredient_id,
        ingredient_name: item.ingredient_name,
        deducted: totalDeduction,
        unit: item.unit,
      });
    }

    return NextResponse.json({
      success: true,
      deductions,
      lowStockAlerts: [],
    });
  } catch (error) {
    console.error("Inventory deduction error:", error);
    return NextResponse.json({ error: "Failed to deduct inventory" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Missing startDate or endDate" }, { status: 400 });
    }

    const { sql, restaurantId } = await getTenantDb();

    const usage = await sql`
      SELECT
        i.name as ingredient_name,
        iu.date::text as date,
        SUM(iu.quantity_used)::numeric as total_used,
        iu.unit,
        i.package_size,
        i.package_unit,
        COUNT(*)::int as transaction_count
      FROM inventory_usage iu
      JOIN ingredients i ON iu.ingredient_id = i.id
      WHERE iu.date >= ${startDate}::date AND iu.date <= ${endDate}::date
        AND iu.restaurant_id = ${restaurantId}
      GROUP BY i.id, i.name, iu.date, iu.unit, i.package_size, i.package_unit
      ORDER BY iu.date DESC, i.name
    `;

    return NextResponse.json({ usage });
  } catch (error) {
    console.error("Usage history error:", error);
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}
