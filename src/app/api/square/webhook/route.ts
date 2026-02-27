import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { findMatchingMenuItem } from "@/lib/square-matching";
import crypto from "crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Convert recipe quantity to ingredient's native unit
function convertUnits(qty: number, fromUnit: string, toUnit: string): number {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return qty;
  const f = fromUnit.toLowerCase().trim();
  const t = toUnit.toLowerCase().trim();
  if (f === t) return qty;
  // grams → ounces
  if (f === "g" && t === "oz") return qty / 28.35;
  // grams → pounds
  if (f === "g" && t === "lb") return qty / 453.6;
  // ounces → grams
  if (f === "oz" && t === "g") return qty * 28.35;
  // pounds → ounces
  if (f === "lb" && t === "oz") return qty * 16;
  // ounces → pounds
  if (f === "oz" && t === "lb") return qty / 16;
  // fl oz conversions (treat same as oz for now)
  if (f === "g" && t === "fl oz") return qty / 28.35;
  // slices/serving/half/each — close enough, no conversion
  return qty;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // Verify Square webhook signature if key is configured
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (signatureKey) {
      const signature = request.headers.get("x-square-hmacsha256-signature");
      const notificationUrl = request.headers.get("x-square-notification-url") || request.url;
      const expectedSignature = crypto
        .createHmac("sha256", signatureKey)
        .update(notificationUrl + rawBody)
        .digest("base64");
      if (signature !== expectedSignature) {
        console.warn("Square webhook signature mismatch - rejecting");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);
    const eventType = body.type;
    const data = body.data;

    console.log("Square webhook received:", eventType);

    if (eventType === "order.created" || eventType === "order.updated") {
      const orderId = data?.id || data?.object?.order?.id;

      if (!orderId) {
        console.log("No order ID in webhook");
        return NextResponse.json({ received: true });
      }

      await processOrderInventory(orderId, data);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function processOrderInventory(orderId: string, orderData: any) {
  const sql = getDb();

  try {
    const order = orderData?.object?.order || orderData;
    const lineItems = order?.line_items || [];

    console.log(`Processing ${lineItems.length} line items from order ${orderId}`);

    // Load all menu items once for matching
    const allMenuItems = await sql`SELECT id, name, square_item_id FROM menu_items` as { id: string; name: string; square_item_id: string | null }[];

    for (const lineItem of lineItems) {
      const catalogId = lineItem.catalog_object_id || "";
      const itemName = lineItem.name || "";

      const menuItem = findMatchingMenuItem(itemName, catalogId, allMenuItems);

      if (!menuItem) {
        console.log(`No menu item found for: "${itemName}" (catalog: ${catalogId})`);
        continue;
      }
      const quantity = parseInt(lineItem.quantity || "1");
      console.log(`Deducting ingredients for ${menuItem.name} (qty: ${quantity})`);

      const recipe = await sql`
        SELECT
          r.ingredient_id,
          r.quantity as recipe_qty,
          r.quantity_unit as recipe_unit,
          i.name as ingredient_name,
          i.unit,
          i.supplier,
          i.batch_yield
        FROM recipes r
        JOIN ingredients i ON r.ingredient_id = i.id
        WHERE r.menu_item_id = ${menuItem.id}
      `;

      for (const item of recipe as any[]) {
        const convertedQty = convertUnits(item.recipe_qty, item.recipe_unit, item.unit);
        const totalDeduction = convertedQty * quantity;

        if (item.supplier === "Homemade") {
          // Drill into sub-recipe to get actual raw ingredients
          const subIngredients = await sql`
            SELECT ci.id, ci.name, ci.unit,
              sri.quantity as sub_qty
            FROM sub_recipe_ingredients sri
            JOIN ingredients ci ON sri.child_ingredient_id = ci.id
            WHERE sri.parent_ingredient_id = ${item.ingredient_id}
          ` as any[];

          for (const sub of subIngredients) {
            // If batch_yield is set, sub-recipe quantities are per-batch, so scale down
            const batchYield = Number(item.batch_yield) || 0;
            const subDeduction = batchYield > 0
              ? (sub.sub_qty / batchYield) * totalDeduction
              : sub.sub_qty * totalDeduction;

            // Deduplication: skip if this order already recorded for this ingredient
            const existing = await sql`
              SELECT id FROM inventory_usage
              WHERE square_order_id = ${orderId} AND ingredient_id = ${sub.id}
            `;
            if (existing.length > 0) {
              console.log(`  - ${sub.name}: already recorded for order ${orderId}, skipping`);
              continue;
            }

            const usageId = `usage_${Date.now()}_${sub.id}_${Math.random().toString(36).slice(2, 8)}`;

            await sql`
              INSERT INTO inventory_usage (id, ingredient_id, menu_item_id, square_order_id, quantity_used, unit, transaction_qty, date)
              VALUES (${usageId}, ${sub.id}, ${menuItem.id}, ${orderId}, ${subDeduction}, ${sub.unit}, ${quantity}, CURRENT_DATE)
            `;

            // Only deduct from stock if this sale happened AFTER the last manual count
            await sql`
              UPDATE ingredients SET current_stock = GREATEST(0, current_stock - ${subDeduction}), updated_at = now()
              WHERE id = ${sub.id}
                AND (stock_counted_at IS NULL OR CURRENT_DATE > stock_counted_at::date)
            `;

            console.log(`  - ${sub.name} (sub-recipe): -${subDeduction} ${sub.unit} (saved)`);
          }
        } else {
          // Direct ingredient — deduplication check
          const existing = await sql`
            SELECT id FROM inventory_usage
            WHERE square_order_id = ${orderId} AND ingredient_id = ${item.ingredient_id}
          `;
          if (existing.length > 0) {
            console.log(`  - ${item.ingredient_name}: already recorded for order ${orderId}, skipping`);
            continue;
          }

          const usageId = `usage_${Date.now()}_${item.ingredient_id}_${Math.random().toString(36).slice(2, 8)}`;

          await sql`
            INSERT INTO inventory_usage (id, ingredient_id, menu_item_id, square_order_id, quantity_used, unit, transaction_qty, date)
            VALUES (${usageId}, ${item.ingredient_id}, ${menuItem.id}, ${orderId}, ${totalDeduction}, ${item.unit}, ${quantity}, CURRENT_DATE)
          `;

          // Only deduct from stock if this sale happened AFTER the last manual count
          await sql`
            UPDATE ingredients SET current_stock = GREATEST(0, current_stock - ${totalDeduction}), updated_at = now()
            WHERE id = ${item.ingredient_id}
              AND (stock_counted_at IS NULL OR CURRENT_DATE > stock_counted_at::date)
          `;

          console.log(`  - ${item.ingredient_name}: -${totalDeduction} ${item.unit} (saved)`);
        }
      }
    }
  } catch (error) {
    console.error("Order processing error:", error);
  }
}
