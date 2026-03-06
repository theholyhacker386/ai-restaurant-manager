import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { v4 as uuid } from "uuid";

// POST - create a new menu category
export async function POST(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const body = await request.json();

    const { name, sort_order } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    const id = uuid();

    await sql`INSERT INTO menu_categories (id, name, sort_order, restaurant_id)
       VALUES (${id}, ${name}, ${sort_order || 0}, ${restaurantId})
       ON CONFLICT DO NOTHING`;

    return NextResponse.json({ id, name, sort_order });
  } catch (error: any) {
    console.error("Error creating menu category:", error);
    return NextResponse.json(
      { error: "Failed to create menu category" },
      { status: 500 }
    );
  }
}
