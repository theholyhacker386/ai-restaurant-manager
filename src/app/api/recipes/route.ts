import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

// GET recipes for a menu item
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const menuItemId = searchParams.get("menu_item_id");

    if (!menuItemId) {
      return NextResponse.json(
        { error: "menu_item_id is required" },
        { status: 400 }
      );
    }

    const recipes = await sql`
      SELECT
        r.id,
        r.menu_item_id,
        r.ingredient_id,
        r.quantity,
        r.quantity_unit,
        r.notes,
        i.name as ingredient_name,
        i.cost_per_unit,
        i.unit as ingredient_unit,
        i.supplier,
        i.package_size,
        i.package_price,
        (r.quantity * i.cost_per_unit * (CASE
            WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN 1.0/28.3495
            WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN 1.0/453.592
            WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN 1.0/16.0
            ELSE 1.0 END)) as line_cost
      FROM recipes r
      JOIN ingredients i ON r.ingredient_id = i.id
      WHERE r.menu_item_id = ${menuItemId}
      ORDER BY i.name
    `;

    const totalCost = recipes.reduce(
      (sum: number, r: any) => sum + (r.line_cost || 0),
      0
    );

    return NextResponse.json({
      recipes,
      total_cost: Math.round(totalCost * 100) / 100,
    });
  } catch (error: any) {
    console.error("Error fetching recipes:", error);
    return NextResponse.json(
      { error: "Failed to fetch recipes" },
      { status: 500 }
    );
  }
}

// POST - add an ingredient to a menu item's recipe
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();

    const { menu_item_id, ingredient_id, quantity, quantity_unit, notes } = body;

    if (!menu_item_id || !ingredient_id || !quantity || !quantity_unit) {
      return NextResponse.json(
        {
          error:
            "menu_item_id, ingredient_id, quantity, and quantity_unit are required",
        },
        { status: 400 }
      );
    }

    const id = uuid();

    await sql`INSERT INTO recipes (id, menu_item_id, ingredient_id, quantity, quantity_unit, notes)
       VALUES (${id}, ${menu_item_id}, ${ingredient_id}, ${quantity}, ${quantity_unit}, ${notes || null})`;

    return NextResponse.json({ id, menu_item_id, ingredient_id, quantity });
  } catch (error: any) {
    console.error("Error adding recipe ingredient:", error);
    return NextResponse.json(
      { error: "Failed to add recipe ingredient" },
      { status: 500 }
    );
  }
}

// PATCH - update a recipe ingredient's quantity and/or swap ingredient
export async function PATCH(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();

    const { id, quantity, quantity_unit, ingredient_id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Recipe id is required" },
        { status: 400 }
      );
    }

    const existing = await sql`SELECT id FROM recipes WHERE id = ${id}`;
    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Recipe entry not found" },
        { status: 404 }
      );
    }

    // Swap ingredient if provided
    if (ingredient_id) {
      const ingredientRows = await sql`SELECT id, unit FROM ingredients WHERE id = ${ingredient_id}`;
      if (ingredientRows.length === 0) {
        return NextResponse.json(
          { error: "Ingredient not found" },
          { status: 404 }
        );
      }
      await sql`UPDATE recipes SET ingredient_id = ${ingredient_id}, quantity_unit = ${ingredientRows[0].unit} WHERE id = ${id}`;
    }

    // Update quantity if provided
    if (quantity !== undefined && quantity !== null) {
      if (quantity <= 0) {
        return NextResponse.json(
          { error: "Quantity must be greater than 0" },
          { status: 400 }
        );
      }
      await sql`UPDATE recipes SET quantity = ${quantity} WHERE id = ${id}`;
    }

    // Update quantity_unit if provided
    if (quantity_unit) {
      await sql`UPDATE recipes SET quantity_unit = ${quantity_unit} WHERE id = ${id}`;
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("Error updating recipe:", error);
    return NextResponse.json(
      { error: "Failed to update recipe" },
      { status: 500 }
    );
  }
}

// DELETE - remove an ingredient from a recipe
export async function DELETE(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const recipeId = searchParams.get("id");

    if (!recipeId) {
      return NextResponse.json(
        { error: "Recipe id is required" },
        { status: 400 }
      );
    }

    await sql`DELETE FROM recipes WHERE id = ${recipeId}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting recipe:", error);
    return NextResponse.json(
      { error: "Failed to delete recipe" },
      { status: 500 }
    );
  }
}
