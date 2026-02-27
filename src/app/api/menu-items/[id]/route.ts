import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

// GET a single menu item with cost data and recipe info
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { sql, restaurantId } = await getTenantDb();

    const items = await sql`
        SELECT
          mi.id,
          mi.name,
          mi.selling_price,
          mi.category_id,
          mc.name as category_name,
          mi.is_active,
          mi.notes,
          mi.created_at,
          mi.updated_at,
          COALESCE(
            (SELECT SUM(r.quantity * i.cost_per_unit * (CASE
                WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN 1.0/28.3495
                WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN 1.0/453.592
                WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN 1.0/16.0
                ELSE 1.0 END))
             FROM recipes r
             JOIN ingredients i ON r.ingredient_id = i.id
             WHERE r.menu_item_id = mi.id),
            0
          ) as total_ingredient_cost,
          COALESCE(
            (SELECT SUM(r.quantity * i.cost_per_unit * (CASE
                WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN 1.0/28.3495
                WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN 1.0/453.592
                WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN 1.0/16.0
                ELSE 1.0 END))
             FROM recipes r
             JOIN ingredients i ON r.ingredient_id = i.id
             WHERE r.menu_item_id = mi.id AND i.ingredient_type = 'packaging'),
            0
          ) as packaging_cost,
          (SELECT COUNT(*)
           FROM recipes r
           JOIN ingredients i ON r.ingredient_id = i.id
           WHERE r.menu_item_id = mi.id AND i.ingredient_type IN ('food', 'sub_recipe')
          ) as food_recipe_count
        FROM menu_items mi
        LEFT JOIN menu_categories mc ON mi.category_id = mc.id
        WHERE mi.id = ${id} AND mi.restaurant_id = ${restaurantId}
    `;

    const item: any = items[0];

    if (!item) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    const foodCostPct =
      item.selling_price > 0
        ? (item.total_ingredient_cost / item.selling_price) * 100
        : 0;
    const profitPerItem = item.selling_price - item.total_ingredient_cost;
    const suggestedPrice =
      item.total_ingredient_cost > 0 ? item.total_ingredient_cost / 0.3 : 0;

    const zeroCostRows = await sql`SELECT COUNT(*) as cnt FROM recipes r
         JOIN ingredients i ON r.ingredient_id = i.id
         WHERE r.menu_item_id = ${id} AND i.ingredient_type IN ('food', 'sub_recipe') AND i.cost_per_unit = 0`;
    const hasZeroCostIngredients = (zeroCostRows[0]?.cnt || 0) > 0;

    const zeroQtyRows = await sql`SELECT COUNT(*) as cnt FROM recipes r
         JOIN ingredients i ON r.ingredient_id = i.id
         WHERE r.menu_item_id = ${id} AND i.ingredient_type IN ('food', 'sub_recipe') AND r.quantity = 0`;
    const hasMissingWeights = (zeroQtyRows[0]?.cnt || 0) > 0;

    const batchRows = await sql`SELECT COUNT(*) as cnt FROM recipes r
         JOIN ingredients i ON r.ingredient_id = i.id
         WHERE r.menu_item_id = ${id} AND (i.unit = 'batch' OR i.unit = 'batch portion' OR r.notes LIKE '%TEMP%')`;
    const hasUnbrokenBatchCosts = (batchRows[0]?.cnt || 0) > 0;

    let status: string;
    if (item.food_recipe_count === 0) {
      status = "needs-input";
    } else if (hasZeroCostIngredients || hasUnbrokenBatchCosts || hasMissingWeights) {
      status = "incomplete";
    } else if (foodCostPct <= 30) {
      status = "good";
    } else if (foodCostPct <= 35) {
      status = "warning";
    } else {
      status = "danger";
    }

    const recipes = await sql`
        SELECT
          r.id,
          r.ingredient_id,
          i.name as ingredient_name,
          r.quantity,
          r.quantity_unit,
          i.cost_per_unit,
          i.unit as ingredient_unit,
          i.ingredient_type,
          (r.quantity * i.cost_per_unit * (CASE
              WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN 1.0/28.3495
              WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN 1.0/453.592
              WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN 1.0/16.0
              ELSE 1.0 END)) as line_cost
        FROM recipes r
        JOIN ingredients i ON r.ingredient_id = i.id
        WHERE r.menu_item_id = ${id}
        ORDER BY
          CASE i.ingredient_type WHEN 'packaging' THEN 1 ELSE 0 END,
          line_cost DESC
    `;

    return NextResponse.json({
      item: {
        ...item,
        food_cost_percentage: Math.round(foodCostPct * 10) / 10,
        profit_per_item: Math.round(profitPerItem * 100) / 100,
        suggested_price: Math.round(suggestedPrice * 100) / 100,
        packaging_cost: Math.round(item.packaging_cost * 100) / 100,
        status,
      },
      recipes,
    });
  } catch (error: any) {
    console.error("Error fetching menu item:", error);
    return NextResponse.json(
      { error: "Failed to fetch menu item" },
      { status: 500 }
    );
  }
}

// PUT - update a menu item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { sql, restaurantId } = await getTenantDb();
    const body = await request.json();

    const { name, selling_price, category_id, notes, is_active } = body;

    if (!name || selling_price === undefined) {
      return NextResponse.json(
        { error: "Name and selling price are required" },
        { status: 400 }
      );
    }

    const existing = await sql`SELECT id FROM menu_items WHERE id = ${id} AND restaurant_id = ${restaurantId}`;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    const activeVal = is_active !== undefined ? is_active : true;

    await sql`UPDATE menu_items
       SET name = ${name}, selling_price = ${selling_price}, category_id = ${category_id || null}, notes = ${notes || null}, is_active = ${activeVal}, updated_at = NOW()
       WHERE id = ${id} AND restaurant_id = ${restaurantId}`;

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("Error updating menu item:", error);
    return NextResponse.json(
      { error: "Failed to update menu item" },
      { status: 500 }
    );
  }
}

// DELETE - remove a menu item
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { sql, restaurantId } = await getTenantDb();

    const existing = await sql`SELECT id FROM menu_items WHERE id = ${id} AND restaurant_id = ${restaurantId}`;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    await sql`DELETE FROM recipes WHERE menu_item_id = ${id} AND restaurant_id = ${restaurantId}`;
    await sql`DELETE FROM menu_items WHERE id = ${id} AND restaurant_id = ${restaurantId}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting menu item:", error);
    return NextResponse.json(
      { error: "Failed to delete menu item" },
      { status: 500 }
    );
  }
}
