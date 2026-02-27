import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET a single ingredient by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;

    const rows = await sql`SELECT * FROM ingredients WHERE id = ${id}`;
    const ingredient = rows[0];

    if (!ingredient) {
      return NextResponse.json(
        { error: "Ingredient not found" },
        { status: 404 }
      );
    }

    const recipes = await sql`SELECT r.id, r.quantity, r.quantity_unit, mi.id as menu_item_id, mi.name as menu_item_name
         FROM recipes r
         JOIN menu_items mi ON r.menu_item_id = mi.id
         WHERE r.ingredient_id = ${id}
         ORDER BY mi.name`;

    return NextResponse.json({
      ingredient,
      recipes,
      recipe_count: recipes.length,
    });
  } catch (error: unknown) {
    console.error("Error fetching ingredient:", error);
    return NextResponse.json(
      { error: "Failed to fetch ingredient" },
      { status: 500 }
    );
  }
}

// PUT - update an ingredient
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;
    const body = await request.json();

    const { name, unit, package_size, package_unit, package_price, supplier, notes } = body;

    if (!name || !unit) {
      return NextResponse.json(
        { error: "Name and unit are required" },
        { status: 400 }
      );
    }

    let cost_per_unit = 0;
    if (package_size && package_price) {
      cost_per_unit = package_price / package_size;
    }

    const result = await sql`UPDATE ingredients
         SET name = ${name}, unit = ${unit}, cost_per_unit = ${cost_per_unit}, package_size = ${package_size || null}, package_unit = ${package_unit || null},
             package_price = ${package_price || null}, supplier = ${supplier || "Walmart"}, notes = ${notes || null}, updated_at = NOW()
         WHERE id = ${id}`;

    return NextResponse.json({
      id,
      name,
      unit,
      cost_per_unit: Math.round(cost_per_unit * 100) / 100,
    });
  } catch (error: unknown) {
    console.error("Error updating ingredient:", error);
    return NextResponse.json(
      { error: "Failed to update ingredient" },
      { status: 500 }
    );
  }
}

// DELETE - remove an ingredient
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;

    const recipeCount = await sql`SELECT COUNT(*) as count FROM recipes WHERE ingredient_id = ${id}`;

    if ((recipeCount[0]?.count || 0) > 0) {
      return NextResponse.json(
        {
          error: `This ingredient is used in ${recipeCount[0].count} recipe(s). Remove it from those recipes first.`,
          recipe_count: recipeCount[0].count,
        },
        { status: 409 }
      );
    }

    await sql`DELETE FROM ingredients WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting ingredient:", error);
    return NextResponse.json(
      { error: "Failed to delete ingredient" },
      { status: 500 }
    );
  }
}
