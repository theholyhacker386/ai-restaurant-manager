import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

// POST - assign a menu item to a category by item name
export async function POST(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const body = await request.json();

    const { itemName, categoryId } = body;

    if (!itemName || !categoryId) {
      return NextResponse.json(
        { error: "itemName and categoryId are required" },
        { status: 400 }
      );
    }

    await sql`
      UPDATE menu_items
      SET category_id = ${categoryId}, updated_at = NOW()
      WHERE LOWER(name) = LOWER(${itemName})
        AND restaurant_id = ${restaurantId}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error assigning category:", error);
    return NextResponse.json(
      { error: "Failed to assign category" },
      { status: 500 }
    );
  }
}
