import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { v4 as uuid } from "uuid";

// GET all menu items with their cost data
export async function GET() {
  try {
    const sql = getDb();
    const settings = await getSettings();

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
        ) as food_recipe_count,
        (SELECT COUNT(*)
         FROM recipes r
         JOIN ingredients i ON r.ingredient_id = i.id
         WHERE r.menu_item_id = mi.id AND i.ingredient_type IN ('food', 'sub_recipe') AND i.cost_per_unit = 0
        ) as zero_cost_count,
        (SELECT COUNT(*)
         FROM recipes r
         JOIN ingredients i ON r.ingredient_id = i.id
         WHERE r.menu_item_id = mi.id AND i.ingredient_type IN ('food', 'sub_recipe') AND r.quantity = 0
        ) as missing_weight_count,
        (SELECT COUNT(*)
         FROM recipes r
         JOIN ingredients i ON r.ingredient_id = i.id
         WHERE r.menu_item_id = mi.id AND (i.unit = 'batch' OR i.unit = 'batch portion' OR r.notes LIKE '%TEMP%')
        ) as batch_cost_count,
        mi.approved_food_cost
      FROM menu_items mi
      LEFT JOIN menu_categories mc ON mi.category_id = mc.id
      ORDER BY mc.sort_order, mi.name
    `;

    // Add calculated fields
    const enrichedItems = items.map((item: any) => {
      const foodCostPct =
        item.selling_price > 0
          ? (item.total_ingredient_cost / item.selling_price) * 100
          : 0;
      const profitPerItem = item.selling_price - item.total_ingredient_cost;
      const suggestedPrice =
        item.total_ingredient_cost > 0
          ? item.total_ingredient_cost / (settings.food_cost_target / 100)
          : 0;

      let status: string;
      const roundedCost = Math.round(foodCostPct * 10) / 10;

      if (item.food_recipe_count === 0) {
        status = "needs-input";
      } else if (item.zero_cost_count > 0 || item.batch_cost_count > 0 || item.missing_weight_count > 0) {
        status = "incomplete";
      } else if (foodCostPct <= settings.food_cost_target) {
        status = "good";
      } else if (foodCostPct <= settings.food_cost_warning) {
        status = "warning";
      } else {
        status = "danger";
      }

      // If the owner previously approved this food cost, and the cost
      // hasn't changed significantly (within 2%), mark as "approved"
      // so it doesn't clutter the review list. If costs change, the
      // approval is stale and it goes back to warning/danger.
      const approvedCost = item.approved_food_cost ? Number(item.approved_food_cost) : null;
      const isApproved = approvedCost !== null
        && (status === "warning" || status === "danger")
        && Math.abs(roundedCost - approvedCost) <= 2;

      return {
        ...item,
        food_cost_percentage: roundedCost,
        profit_per_item: Math.round(profitPerItem * 100) / 100,
        suggested_price: Math.round(suggestedPrice * 100) / 100,
        packaging_cost: Math.round(item.packaging_cost * 100) / 100,
        status: isApproved ? "approved" : status,
        approved_food_cost: approvedCost,
      };
    });

    return NextResponse.json({ items: enrichedItems });
  } catch (error: any) {
    console.error("Error fetching menu items:", error);
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 }
    );
  }
}

// POST - create a new menu item
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();

    const { name, selling_price, category_id, notes } = body;

    if (!name || selling_price === undefined) {
      return NextResponse.json(
        { error: "Name and selling price are required" },
        { status: 400 }
      );
    }

    const id = uuid();

    await sql`INSERT INTO menu_items (id, name, selling_price, category_id, notes)
       VALUES (${id}, ${name}, ${selling_price}, ${category_id || null}, ${notes || null})`;

    return NextResponse.json({ id, name, selling_price });
  } catch (error: any) {
    console.error("Error creating menu item:", error);
    return NextResponse.json(
      { error: "Failed to create menu item" },
      { status: 500 }
    );
  }
}
