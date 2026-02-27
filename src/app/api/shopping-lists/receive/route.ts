import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { convertToBaseUnit } from "@/lib/unit-conversions";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET — Load a shopping list's items enriched with ingredient data + what's already been received.
 * Also supports ?pending=true to get combined pending items across all open orders.
 */
export async function GET(req: Request) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    const listId = searchParams.get("listId");
    const pending = searchParams.get("pending");

    // Combined pending view: all items still waiting across all open orders
    if (pending === "true") {
      const pendingItems = (await sql`
        SELECT
          sli.id as shopping_list_item_id,
          sli.ingredient_name,
          sli.supplier,
          sli.quantity_needed,
          sli.packages_to_buy,
          sli.package_info,
          sli.ingredient_id,
          sli.shopping_list_id,
          sl.name as list_name,
          sl.created_at as list_date,
          i.package_size,
          i.package_unit,
          i.unit as base_unit,
          COALESCE(
            (SELECT SUM(ori.received_packages)
             FROM order_receipt_items ori
             JOIN order_receipts orr ON orr.id = ori.order_receipt_id
             WHERE ori.shopping_list_item_id = sli.id
             AND ori.status IN ('received', 'adjusted')),
            0
          ) as total_received
        FROM shopping_list_items sli
        JOIN shopping_lists sl ON sl.id = sli.shopping_list_id
        LEFT JOIN ingredients i ON i.id = sli.ingredient_id
        WHERE sl.status != 'completed'
          AND sl.status != 'closed'
          AND sli.checked = false
        ORDER BY sli.supplier, sli.ingredient_name
      `) as any[];

      // Group by supplier
      const bySupplier: Record<string, any[]> = {};
      for (const item of pendingItems) {
        const supplier = item.supplier || "Other";
        if (!bySupplier[supplier]) bySupplier[supplier] = [];
        const packagesToBuy = Number(item.packages_to_buy) || 0;
        const totalReceived = Number(item.total_received) || 0;
        const remaining = Math.max(0, packagesToBuy - totalReceived);
        if (remaining > 0) {
          bySupplier[supplier].push({
            ...item,
            packages_to_buy: packagesToBuy,
            total_received: totalReceived,
            remaining,
          });
        }
      }

      return NextResponse.json({ bySupplier });
    }

    // Single list view
    if (!listId) {
      return NextResponse.json({ error: "listId required" }, { status: 400 });
    }

    // Get list info
    const lists = (await sql`
      SELECT id, name, based_on_days, multiplier, total_estimated_cost, status, notes, created_at
      FROM shopping_lists WHERE id = ${listId}
    `) as any[];

    if (lists.length === 0) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const list = lists[0];

    // Get items enriched with ingredient data and receive history
    const items = (await sql`
      SELECT
        sli.id,
        sli.ingredient_name,
        sli.supplier,
        sli.quantity_needed,
        sli.estimated_cost,
        sli.packages_to_buy,
        sli.package_info,
        sli.checked,
        sli.ingredient_id,
        i.package_size,
        i.package_unit,
        i.unit as base_unit,
        i.current_stock,
        COALESCE(
          (SELECT SUM(ori.received_packages)
           FROM order_receipt_items ori
           JOIN order_receipts orr ON orr.id = ori.order_receipt_id
           WHERE ori.shopping_list_item_id = sli.id
           AND ori.status IN ('received', 'adjusted')),
          0
        ) as total_received,
        (SELECT ori.status
         FROM order_receipt_items ori
         JOIN order_receipts orr ON orr.id = ori.order_receipt_id
         WHERE ori.shopping_list_item_id = sli.id
         AND ori.status = 'reorder'
         LIMIT 1
        ) as reorder_status
      FROM shopping_list_items sli
      LEFT JOIN ingredients i ON i.id = sli.ingredient_id
      WHERE sli.shopping_list_id = ${listId}
      ORDER BY sli.supplier, sli.ingredient_name
    `) as any[];

    // Compute remaining for each item
    const enrichedItems = items.map((item: any) => {
      const packagesToBuy = Number(item.packages_to_buy) || 0;
      const totalReceived = Number(item.total_received) || 0;
      const remaining = Math.max(0, packagesToBuy - totalReceived);
      return {
        ...item,
        packages_to_buy: packagesToBuy,
        total_received: totalReceived,
        remaining,
        package_size: item.package_size ? Number(item.package_size) : null,
        current_stock: item.current_stock ? Number(item.current_stock) : 0,
        is_reorder: item.reorder_status === "reorder",
      };
    });

    // Group by supplier
    const bySupplier: Record<string, any[]> = {};
    for (const item of enrichedItems) {
      const supplier = item.supplier || "Other";
      if (!bySupplier[supplier]) bySupplier[supplier] = [];
      bySupplier[supplier].push(item);
    }

    return NextResponse.json({
      ...list,
      total_estimated_cost: Number(list.total_estimated_cost),
      items: enrichedItems,
      bySupplier,
    });
  } catch (error: any) {
    console.error("Receive GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST — Save one shipment batch. Updates inventory for received/adjusted items.
 * Body: { listId, receivedBy?, notes?, items: [{ shopping_list_item_id, ingredient_id, ingredient_name,
 *   ordered_packages, ordered_package_size, ordered_package_unit,
 *   received_packages, actual_package_size, actual_package_unit,
 *   status: 'received' | 'adjusted' | 'reorder', notes? }] }
 */
export async function POST(req: Request) {
  try {
    const sql = getDb();
    const body = await req.json();
    const { listId, receivedBy, notes, items } = body;

    if (!listId || !items || items.length === 0) {
      return NextResponse.json({ error: "listId and items required" }, { status: 400 });
    }

    // Create order receipt record
    const receiptId = uuid();
    await sql`
      INSERT INTO order_receipts (id, shopping_list_id, received_by, status, notes, confirmed_at)
      VALUES (${receiptId}, ${listId}, ${receivedBy || null}, 'confirmed', ${notes || null}, NOW())
    `;

    let stockUpdates = 0;
    let reorderCount = 0;

    for (const item of items) {
      const itemId = uuid();

      // Save the receipt item record
      await sql`
        INSERT INTO order_receipt_items (
          id, order_receipt_id, shopping_list_item_id, ingredient_id, ingredient_name,
          ordered_packages, ordered_package_size, ordered_package_unit,
          received_packages, actual_package_size, actual_package_unit,
          status, notes
        ) VALUES (
          ${itemId}, ${receiptId}, ${item.shopping_list_item_id || null},
          ${item.ingredient_id || null}, ${item.ingredient_name},
          ${item.ordered_packages || null}, ${item.ordered_package_size || null}, ${item.ordered_package_unit || null},
          ${item.received_packages || 0}, ${item.actual_package_size || null}, ${item.actual_package_unit || null},
          ${item.status}, ${item.notes || null}
        )
      `;

      if (item.status === "received" || item.status === "adjusted") {
        // Update inventory
        const ingredientId = item.ingredient_id;
        if (!ingredientId) continue;

        // Get ingredient's base unit
        const ingredients = (await sql`
          SELECT id, unit, package_size, package_unit FROM ingredients WHERE id = ${ingredientId}
        `) as any[];
        if (ingredients.length === 0) continue;

        const ingredient = ingredients[0];
        const baseUnit = (ingredient.unit || "").toLowerCase();

        // Calculate stock to add
        const receivedPkgs = Number(item.received_packages) || 0;
        const actualSize = Number(item.actual_package_size) || Number(ingredient.package_size) || 1;
        const actualUnit = item.actual_package_unit || ingredient.package_unit || baseUnit;

        const converted = convertToBaseUnit(actualSize, actualUnit, baseUnit);
        // If conversion failed (incompatible units), fall back to the stored package_size
        const sizeInBaseUnit = converted !== null ? converted : (Number(ingredient.package_size) || 1);
        const stockToAdd = receivedPkgs * sizeInBaseUnit;

        if (stockToAdd > 0) {
          await sql`
            UPDATE ingredients
            SET current_stock = COALESCE(current_stock, 0) + ${stockToAdd},
                stock_counted_at = NOW(), updated_at = NOW()
            WHERE id = ${ingredientId}
          `;

          // Log to inventory_usage
          const usageId = `receive_${itemId}`;
          await sql`
            INSERT INTO inventory_usage (id, ingredient_id, quantity_used, unit, transaction_qty, date)
            VALUES (${usageId}, ${ingredientId}, ${-stockToAdd}, ${baseUnit}, ${receivedPkgs}, CURRENT_DATE)
          `;

          stockUpdates++;
        }

        // Mark shopping list item as checked if fully received
        if (item.shopping_list_item_id) {
          const totalReceived = (await sql`
            SELECT COALESCE(SUM(received_packages), 0) as total
            FROM order_receipt_items
            WHERE shopping_list_item_id = ${item.shopping_list_item_id}
            AND status IN ('received', 'adjusted')
          `) as any[];

          const ordered = Number(item.ordered_packages) || 0;
          const received = Number(totalReceived[0]?.total) || 0;
          if (received >= ordered && ordered > 0) {
            await sql`
              UPDATE shopping_list_items SET checked = true WHERE id = ${item.shopping_list_item_id}
            `;
          }
        }
      } else if (item.status === "reorder") {
        // Create reorder flag
        if (item.ingredient_id) {
          const flagId = uuid();
          await sql`
            INSERT INTO reorder_flags (id, ingredient_id, source_shopping_list_id, reason)
            VALUES (${flagId}, ${item.ingredient_id}, ${listId}, 'out_of_stock')
            ON CONFLICT DO NOTHING
          `;
          reorderCount++;
        }

        // Mark as reorder in the shopping list item too
        if (item.shopping_list_item_id) {
          await sql`
            UPDATE shopping_list_items SET checked = true WHERE id = ${item.shopping_list_item_id}
          `;
        }
      }
    }

    return NextResponse.json({
      success: true,
      receipt_id: receiptId,
      stock_updates: stockUpdates,
      reorder_count: reorderCount,
    });
  } catch (error: any) {
    console.error("Receive POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH — Close/complete an order. Any still-pending items get flagged as reorders.
 * Body: { listId }
 */
export async function PATCH(req: Request) {
  try {
    const sql = getDb();
    const { listId } = await req.json();

    if (!listId) {
      return NextResponse.json({ error: "listId required" }, { status: 400 });
    }

    // Find items still not fully received
    const pendingItems = (await sql`
      SELECT sli.id, sli.ingredient_id, sli.ingredient_name, sli.packages_to_buy,
        COALESCE(
          (SELECT SUM(ori.received_packages)
           FROM order_receipt_items ori
           JOIN order_receipts orr ON orr.id = ori.order_receipt_id
           WHERE ori.shopping_list_item_id = sli.id
           AND ori.status IN ('received', 'adjusted')),
          0
        ) as total_received
      FROM shopping_list_items sli
      WHERE sli.shopping_list_id = ${listId} AND sli.checked = false
    `) as any[];

    // Flag unreceived items for reorder
    let flagCount = 0;
    for (const item of pendingItems) {
      const ordered = Number(item.packages_to_buy) || 0;
      const received = Number(item.total_received) || 0;
      if (received < ordered && item.ingredient_id) {
        const flagId = uuid();
        // Check if a flag already exists for this ingredient
        const existing = (await sql`
          SELECT 1 FROM reorder_flags WHERE ingredient_id = ${item.ingredient_id} AND resolved = false LIMIT 1
        `) as any[];
        if (existing.length === 0) {
          await sql`
            INSERT INTO reorder_flags (id, ingredient_id, source_shopping_list_id, reason)
            VALUES (${flagId}, ${item.ingredient_id}, ${listId}, 'did_not_arrive')
          `;
          flagCount++;
        }
      }
      // Mark all remaining items as checked (order is done)
      await sql`
        UPDATE shopping_list_items SET checked = true WHERE id = ${item.id}
      `;
    }

    // Mark the shopping list as closed
    await sql`
      UPDATE shopping_lists SET status = 'closed' WHERE id = ${listId}
    `;

    return NextResponse.json({
      success: true,
      flagged_for_reorder: flagCount,
    });
  } catch (error: any) {
    console.error("Receive PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
