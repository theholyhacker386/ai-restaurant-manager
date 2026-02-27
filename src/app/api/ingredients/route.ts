import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { v4 as uuid } from "uuid";

// GET all ingredients
export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    const ingredients = await sql`SELECT i.*,
                (SELECT COUNT(*) FROM recipes r WHERE r.ingredient_id = i.id) as recipe_count
         FROM ingredients i
         WHERE i.restaurant_id = ${restaurantId}
         ORDER BY i.name`;

    return NextResponse.json({ ingredients });
  } catch (error: any) {
    console.error("Error fetching ingredients:", error);
    return NextResponse.json(
      { error: "Failed to fetch ingredients" },
      { status: 500 }
    );
  }
}

// POST - create a new ingredient
export async function POST(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const body = await request.json();

    const {
      name,
      unit,
      package_size,
      package_unit,
      package_price,
      supplier,
      notes,
    } = body;

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

    const id = uuid();

    await sql`INSERT INTO ingredients (id, restaurant_id, name, unit, cost_per_unit, package_size, package_unit, package_price, supplier, notes)
       VALUES (${id}, ${restaurantId}, ${name}, ${unit}, ${cost_per_unit}, ${package_size || null}, ${package_unit || null}, ${package_price || null}, ${supplier || "Walmart"}, ${notes || null})`;

    return NextResponse.json({
      id,
      name,
      unit,
      cost_per_unit: Math.round(cost_per_unit * 100) / 100,
    });
  } catch (error: any) {
    console.error("Error creating ingredient:", error);
    return NextResponse.json(
      { error: "Failed to create ingredient" },
      { status: 500 }
    );
  }
}
