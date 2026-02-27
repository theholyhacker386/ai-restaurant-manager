import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: Request) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    const listId = searchParams.get("id");

    // If a specific list ID is provided, return that list with all items
    if (listId) {
      const lists = (await sql`
        SELECT id, name, based_on_days, multiplier, total_estimated_cost, status, notes, created_at
        FROM shopping_lists WHERE id = ${listId}
      `) as any[];

      if (lists.length === 0) {
        return NextResponse.json({ error: "List not found" }, { status: 404 });
      }

      const list = lists[0];
      const items = (await sql`
        SELECT id, ingredient_name, supplier, quantity_needed, estimated_cost, packages_to_buy, package_info, checked, ingredient_id
        FROM shopping_list_items WHERE shopping_list_id = ${listId}
        ORDER BY supplier, ingredient_name
      `) as any[];

      // Group items by supplier
      const bySupplier: Record<string, any[]> = {};
      for (const item of items) {
        const supplier = item.supplier || "Other";
        if (!bySupplier[supplier]) bySupplier[supplier] = [];
        bySupplier[supplier].push(item);
      }

      return NextResponse.json({
        ...list,
        total_estimated_cost: Number(list.total_estimated_cost),
        items,
        bySupplier,
      });
    }

    // Otherwise, return all recent lists
    const lists = (await sql`
      SELECT id, name, based_on_days, multiplier, total_estimated_cost, status, created_at
      FROM shopping_lists
      ORDER BY created_at DESC
      LIMIT 20
    `) as any[];

    // Get item counts per list
    for (const list of lists) {
      const counts = (await sql`
        SELECT COUNT(*) as total_items,
          COUNT(*) FILTER (WHERE checked = true) as checked_items
        FROM shopping_list_items WHERE shopping_list_id = ${list.id}
      `) as any[];
      list.total_items = Number(counts[0]?.total_items || 0);
      list.checked_items = Number(counts[0]?.checked_items || 0);
      list.total_estimated_cost = Number(list.total_estimated_cost);
    }

    return NextResponse.json(lists);
  } catch (error: any) {
    console.error("Shopping lists error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Parse the leading number from a quantity string like "75 bananas" or "6 bags" or "24 tbsp"
function parseQuantityNumber(qty: string | null | undefined): number {
  if (!qty) return 0;
  const match = String(qty).match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

// Toggle item checked status OR update list status
export async function PATCH(req: Request) {
  try {
    const sql = getDb();
    const body = await req.json();

    // Update list status (e.g. mark as "completed")
    if (body.listId && body.status) {
      await sql`
        UPDATE shopping_lists SET status = ${body.status} WHERE id = ${body.listId}
      `;
      return NextResponse.json({ success: true });
    }

    // Toggle individual item — also update ingredient stock
    if (body.itemId !== undefined && body.checked !== undefined) {
      // 1. Update the checked status
      await sql`
        UPDATE shopping_list_items SET checked = ${body.checked} WHERE id = ${body.itemId}
      `;

      // 2. Look up the shopping list item to get ingredient_name and quantity info
      const items = (await sql`
        SELECT id, ingredient_name, quantity_needed, packages_to_buy
        FROM shopping_list_items WHERE id = ${body.itemId}
      `) as any[];

      if (items.length > 0) {
        const item = items[0];
        const ingredientName = item.ingredient_name;

        // Guard: skip stock update if this item was already received via the receive flow
        const alreadyReceived = (await sql`
          SELECT 1 FROM order_receipt_items
          WHERE shopping_list_item_id = ${body.itemId} AND status IN ('received', 'adjusted')
          LIMIT 1
        `) as any[];
        if (alreadyReceived.length > 0) {
          return NextResponse.json({ success: true, note: "Stock already updated via receive flow" });
        }

        // 3. Find the matching ingredient
        const ingredients = (await sql`
          SELECT id, name, current_stock, package_size, unit
          FROM ingredients WHERE LOWER(name) = LOWER(${ingredientName})
        `) as any[];

        if (ingredients.length > 0) {
          const ingredient = ingredients[0];
          const packageSize = Number(ingredient.package_size) || 0;
          const packagesToBuy = Number(item.packages_to_buy) || 1;

          // Calculate the stock adjustment amount:
          // If package_size exists, multiply it by packages_to_buy
          // Otherwise, parse the raw number from quantity_needed
          let stockAmount: number;
          if (packageSize > 0) {
            stockAmount = packageSize * packagesToBuy;
          } else {
            stockAmount = parseQuantityNumber(item.quantity_needed);
          }

          if (stockAmount > 0) {
            const usageId = `receipt_${item.id}`;

            if (body.checked) {
              // CHECKING: Add stock (item received/purchased)
              await sql`
                UPDATE ingredients
                SET current_stock = current_stock + ${stockAmount}, stock_counted_at = NOW(), updated_at = now()
                WHERE id = ${ingredient.id}
              `;

              // Log as inventory transaction (negative quantity_used = incoming stock)
              // First remove any existing record for this item to prevent duplicates
              await sql`
                DELETE FROM inventory_usage WHERE id = ${usageId}
              `;
              await sql`
                INSERT INTO inventory_usage (id, ingredient_id, quantity_used, unit, transaction_qty, date)
                VALUES (${usageId}, ${ingredient.id}, ${-stockAmount}, ${ingredient.unit || 'unit'}, ${packagesToBuy}, CURRENT_DATE)
              `;
            } else {
              // UNCHECKING: Reverse the stock addition (subtract back)
              await sql`
                UPDATE ingredients
                SET current_stock = GREATEST(0, current_stock - ${stockAmount}), stock_counted_at = NOW(), updated_at = now()
                WHERE id = ${ingredient.id}
              `;

              // Remove the inventory transaction log
              await sql`
                DELETE FROM inventory_usage WHERE id = ${usageId}
              `;
            }
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error: any) {
    console.error("Shopping list patch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Delete a shopping list
export async function DELETE(req: Request) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    const listId = searchParams.get("id");

    if (!listId) {
      return NextResponse.json({ error: "List ID required" }, { status: 400 });
    }

    // Delete items first, then the list
    await sql`DELETE FROM shopping_list_items WHERE shopping_list_id = ${listId}`;
    await sql`DELETE FROM shopping_lists WHERE id = ${listId}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Shopping list delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
