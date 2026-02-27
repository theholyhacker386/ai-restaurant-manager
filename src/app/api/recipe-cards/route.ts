import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET all menu items with their recipes for recipe cards
export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    const items = await sql`SELECT
          mi.id,
          mi.name,
          mi.recipe_instructions,
          mc.name as category_name
        FROM menu_items mi
        LEFT JOIN menu_categories mc ON mi.category_id = mc.id
        WHERE mi.restaurant_id = ${restaurantId}
        ORDER BY mc.sort_order, mi.name`;

    const cards = [];
    for (const item of items as any[]) {
      const ingredients = await sql`SELECT
              i.name as ingredient_name,
              r.quantity,
              r.quantity_unit,
              i.ingredient_type
            FROM recipes r
            JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.menu_item_id = ${item.id}
            ORDER BY i.ingredient_type DESC, i.name`;

      const foodIngredients = (ingredients as any[]).filter(
        (i: any) => i.ingredient_type === "food" || i.ingredient_type === "sub_recipe"
      );

      if (foodIngredients.length === 0) continue;

      cards.push({
        id: item.id,
        name: item.name,
        category: item.category_name || "Uncategorized",
        instructions: item.recipe_instructions || "",
        ingredients: foodIngredients.map((i: any) => ({
          name: i.ingredient_name,
          quantity: i.quantity,
          unit: i.quantity_unit,
        })),
      });
    }

    // Also fetch sub-recipes (house made items) as their own category
    const subRecipes = await sql`SELECT id, name, recipe_instructions
      FROM ingredients WHERE ingredient_type = 'sub_recipe'
        AND restaurant_id = ${restaurantId}
      ORDER BY name` as any[];

    for (const sr of subRecipes) {
      const components = await sql`SELECT
              ci.name as ingredient_name,
              sri.quantity,
              sri.quantity_unit
            FROM sub_recipe_ingredients sri
            JOIN ingredients ci ON sri.child_ingredient_id = ci.id
            WHERE sri.parent_ingredient_id = ${sr.id}
            ORDER BY ci.name` as any[];

      if (components.length === 0) continue;

      cards.push({
        id: sr.id,
        name: sr.name,
        category: "House Made Recipes",
        instructions: sr.recipe_instructions || "",
        ingredients: components.map((c: any) => ({
          name: c.ingredient_name,
          quantity: c.quantity,
          unit: c.quantity_unit,
        })),
      });
    }

    return NextResponse.json({ cards });
  } catch (error: any) {
    console.error("Error fetching recipe cards:", error);
    return NextResponse.json(
      { error: "Failed to fetch recipe cards" },
      { status: 500 }
    );
  }
}

// PATCH - update recipe instructions for a menu item or sub-recipe
export async function PATCH(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const body = await request.json();
    const { id, recipe_instructions } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Check if this is a sub-recipe (ingredient) or a menu item
    const isIngredient = await sql`SELECT id FROM ingredients WHERE id = ${id} AND ingredient_type = 'sub_recipe' AND restaurant_id = ${restaurantId}` as any[];

    if (isIngredient.length > 0) {
      await sql`UPDATE ingredients SET recipe_instructions = ${recipe_instructions || null}, updated_at = NOW() WHERE id = ${id} AND restaurant_id = ${restaurantId}`;
    } else {
      await sql`UPDATE menu_items SET recipe_instructions = ${recipe_instructions || null}, updated_at = NOW() WHERE id = ${id} AND restaurant_id = ${restaurantId}`;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating recipe instructions:", error);
    return NextResponse.json(
      { error: "Failed to update" },
      { status: 500 }
    );
  }
}
