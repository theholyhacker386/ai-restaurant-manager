import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST — approve a menu item's current food cost
export async function POST(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const { itemId, foodCostPct } = await request.json();

    if (!itemId || foodCostPct === undefined) {
      return NextResponse.json(
        { error: "itemId and foodCostPct are required" },
        { status: 400 }
      );
    }

    await sql`
      UPDATE menu_items
      SET approved_food_cost = ${foodCostPct}
      WHERE id = ${itemId} AND restaurant_id = ${restaurantId}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error approving menu item:", error);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }
}

// DELETE — remove approval (put it back in review)
export async function DELETE(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const { itemId } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    await sql`
      UPDATE menu_items
      SET approved_food_cost = NULL
      WHERE id = ${itemId} AND restaurant_id = ${restaurantId}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error unapproving menu item:", error);
    return NextResponse.json({ error: "Failed to unapprove" }, { status: 500 });
  }
}
