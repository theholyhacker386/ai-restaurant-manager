import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

// GET all sub-recipes with their components and calculated costs
export async function GET() {
  try {
    const sql = getDb();

    const subRecipes = await sql`SELECT id, name, unit, cost_per_unit, notes
         FROM ingredients
         WHERE ingredient_type = 'sub_recipe'
         ORDER BY name` as any[];

    const enriched = [];
    for (const sr of subRecipes) {
      const components = await sql`SELECT
            sri.id,
            sri.child_ingredient_id as ingredient_id,
            i.name as ingredient_name,
            sri.quantity,
            sri.quantity_unit,
            i.cost_per_unit,
            ROUND(CAST(sri.quantity * i.cost_per_unit AS NUMERIC), 4) as line_cost
           FROM sub_recipe_ingredients sri
           JOIN ingredients i ON sri.child_ingredient_id = i.id
           WHERE sri.parent_ingredient_id = ${sr.id}
           ORDER BY i.name`;

      const usageCount = await sql`SELECT COUNT(DISTINCT menu_item_id) as cnt
           FROM recipes WHERE ingredient_id = ${sr.id}`;

      const usedBy = await sql`SELECT DISTINCT mi.name
           FROM recipes r
           JOIN menu_items mi ON r.menu_item_id = mi.id
           WHERE r.ingredient_id = ${sr.id}
           ORDER BY mi.name` as any[];

      enriched.push({
        ...sr,
        components,
        usage_count: (usageCount[0] as any)?.cnt || 0,
        used_by: usedBy.map((u: any) => u.name),
      });
    }

    return NextResponse.json({ subRecipes: enriched });
  } catch (error: any) {
    console.error("Error fetching sub-recipes:", error);
    return NextResponse.json(
      { error: "Failed to fetch sub-recipes" },
      { status: 500 }
    );
  }
}

// POST - create a new sub-recipe
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { name, components } = body;

    if (!name || !components || components.length === 0) {
      return NextResponse.json(
        { error: "Name and at least one component are required" },
        { status: 400 }
      );
    }

    const ingredientId = `ing-sr-${uuid().substring(0, 8)}`;

    await sql`INSERT INTO ingredients (id, name, unit, cost_per_unit, ingredient_type)
       VALUES (${ingredientId}, ${name}, 'serving', 0, 'sub_recipe')`;

    for (const comp of components) {
      await sql`INSERT INTO sub_recipe_ingredients (id, parent_ingredient_id, child_ingredient_id, quantity, quantity_unit)
         VALUES (${`sr-${uuid().substring(0, 8)}`}, ${ingredientId}, ${comp.ingredient_id}, ${comp.quantity}, ${comp.quantity_unit})`;
    }

    await recalcSubRecipeCost(sql, ingredientId);

    const updated = await sql`SELECT cost_per_unit FROM ingredients WHERE id = ${ingredientId}`;

    return NextResponse.json({
      id: ingredientId,
      name,
      cost_per_unit: (updated[0] as any)?.cost_per_unit || 0,
    });
  } catch (error: any) {
    console.error("Error creating sub-recipe:", error);
    return NextResponse.json(
      { error: "Failed to create sub-recipe" },
      { status: 500 }
    );
  }
}

// PATCH - update a sub-recipe's name or components
export async function PATCH(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { id, name, components } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    if (name) {
      await sql`UPDATE ingredients SET name = ${name} WHERE id = ${id}`;
    }

    if (components) {
      await sql`DELETE FROM sub_recipe_ingredients WHERE parent_ingredient_id = ${id}`;

      for (const comp of components) {
        await sql`INSERT INTO sub_recipe_ingredients (id, parent_ingredient_id, child_ingredient_id, quantity, quantity_unit)
           VALUES (${`sr-${uuid().substring(0, 8)}`}, ${id}, ${comp.ingredient_id}, ${comp.quantity}, ${comp.quantity_unit})`;
      }

      await recalcSubRecipeCost(sql, id);
    }

    const updated = await sql`SELECT cost_per_unit FROM ingredients WHERE id = ${id}`;

    return NextResponse.json({
      success: true,
      cost_per_unit: (updated[0] as any)?.cost_per_unit,
    });
  } catch (error: any) {
    console.error("Error updating sub-recipe:", error);
    return NextResponse.json(
      { error: "Failed to update sub-recipe" },
      { status: 500 }
    );
  }
}

// DELETE - remove a sub-recipe
export async function DELETE(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const usage = await sql`SELECT COUNT(*) as cnt FROM recipes WHERE ingredient_id = ${id}`;

    if ((usage[0] as any)?.cnt > 0) {
      return NextResponse.json(
        { error: `This sub-recipe is used by ${(usage[0] as any).cnt} menu item(s). Remove it from those recipes first.` },
        { status: 400 }
      );
    }

    await sql`DELETE FROM sub_recipe_ingredients WHERE parent_ingredient_id = ${id}`;
    await sql`DELETE FROM ingredients WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting sub-recipe:", error);
    return NextResponse.json(
      { error: "Failed to delete sub-recipe" },
      { status: 500 }
    );
  }
}

async function recalcSubRecipeCost(sql: any, ingredientId: string) {
  const result = await sql`SELECT ROUND(CAST(SUM(sri.quantity * i.cost_per_unit) AS NUMERIC), 4) as total
       FROM sub_recipe_ingredients sri
       JOIN ingredients i ON sri.child_ingredient_id = i.id
       WHERE sri.parent_ingredient_id = ${ingredientId}`;

  await sql`UPDATE ingredients SET cost_per_unit = ${(result[0] as any)?.total || 0} WHERE id = ${ingredientId}`;
}
