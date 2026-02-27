import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchOrders } from "@/lib/square";
import { findMatchingMenuItem } from "@/lib/square-matching";
import { v4 as uuid } from "uuid";

// Convert recipe quantity to ingredient's native unit
function convertUnits(qty: number, fromUnit: string, toUnit: string): number {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return qty;
  const f = fromUnit.toLowerCase().trim();
  const t = toUnit.toLowerCase().trim();
  if (f === t) return qty;
  if (f === "g" && t === "oz") return qty / 28.35;
  if (f === "g" && t === "lb") return qty / 453.6;
  if (f === "oz" && t === "g") return qty * 28.35;
  if (f === "lb" && t === "oz") return qty * 16;
  if (f === "oz" && t === "lb") return qty / 16;
  if (f === "g" && t === "fl oz") return qty / 28.35;
  return qty;
}

/**
 * GET ?backfill=true - Re-processes past Square orders into hourly buckets.
 * This is a one-time operation to populate hourly_sales for historical data.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("backfill") !== "true") {
    return NextResponse.json({ error: "Use ?backfill=true to run hourly backfill" }, { status: 400 });
  }

  try {
    const sql = getDb();

    // Find the date range of existing daily_sales
    const rangeResult = await sql`SELECT MIN(date) as min_date, MAX(date) as max_date FROM daily_sales` as any[];
    if (!rangeResult[0]?.min_date) {
      return NextResponse.json({ message: "No daily_sales data to backfill from" });
    }

    const startDate = rangeResult[0].min_date;
    const endDate = rangeResult[0].max_date;

    // Fetch all orders from Square for the full range
    const orders = await fetchOrders(startDate, endDate);

    const hourlyMap: Record<string, {
      date: string; hour: number;
      revenue: number; tax: number; tips: number; discounts: number; orderCount: number;
    }> = {};

    for (const order of orders) {
      const createdAt = order.createdAt || order.created_at || "";
      if (!createdAt) continue;
      const utcDate = new Date(createdAt);
      const localDate = new Date(utcDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const date = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
      const hour = localDate.getHours();

      const key = `${date}|${hour}`;
      if (!hourlyMap[key]) {
        hourlyMap[key] = { date, hour, revenue: 0, tax: 0, tips: 0, discounts: 0, orderCount: 0 };
      }

      const bucket = hourlyMap[key];
      bucket.orderCount++;
      bucket.revenue += Number((order.totalMoney || order.total_money)?.amount || 0) / 100;
      bucket.tax += Number((order.totalTaxMoney || order.total_tax_money)?.amount || 0) / 100;
      bucket.tips += Number((order.totalTipMoney || order.total_tip_money)?.amount || 0) / 100;
      bucket.discounts += Number((order.totalDiscountMoney || order.total_discount_money)?.amount || 0) / 100;
    }

    let inserted = 0;
    for (const bucket of Object.values(hourlyMap)) {
      const netRev = bucket.revenue - bucket.tax - bucket.discounts;
      await sql`INSERT INTO hourly_sales (id, date, hour, total_revenue, total_tax, total_tips, total_discounts, net_revenue, order_count, updated_at)
        VALUES (${uuid()}, ${bucket.date}, ${bucket.hour}, ${Math.round(bucket.revenue * 100) / 100}, ${Math.round(bucket.tax * 100) / 100}, ${Math.round(bucket.tips * 100) / 100}, ${Math.round(bucket.discounts * 100) / 100}, ${Math.round(netRev * 100) / 100}, ${bucket.orderCount}, NOW())
        ON CONFLICT(date, hour) DO UPDATE SET
          total_revenue = EXCLUDED.total_revenue,
          total_tax = EXCLUDED.total_tax,
          total_tips = EXCLUDED.total_tips,
          total_discounts = EXCLUDED.total_discounts,
          net_revenue = EXCLUDED.net_revenue,
          order_count = EXCLUDED.order_count,
          updated_at = NOW()`;
      inserted++;
    }

    return NextResponse.json({
      success: true,
      message: `Backfilled ${inserted} hourly buckets from ${orders.length} orders (${startDate} to ${endDate})`,
      hourlyBuckets: inserted,
      ordersProcessed: orders.length,
    });
  } catch (error: any) {
    console.error("Backfill error:", error);
    return NextResponse.json({ error: error.message || "Backfill failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const orders = await fetchOrders(startDate, endDate);
    const sql = getDb();

    const menuItems = await sql`SELECT id, name, square_item_id FROM menu_items` as { id: string; name: string; square_item_id: string | null }[];

    const dailyMap: Record<string, {
      revenue: number; tax: number; tips: number; discounts: number; orderCount: number;
      items: Record<string, { name: string; squareItemId: string; quantity: number; revenue: number }>;
    }> = {};

    // Hourly buckets: key = "YYYY-MM-DD|HH"
    const hourlyMap: Record<string, {
      date: string; hour: number;
      revenue: number; tax: number; tips: number; discounts: number; orderCount: number;
    }> = {};

    for (const order of orders) {
      const createdAt = order.createdAt || order.created_at || "";
      const utcDate = new Date(createdAt);
      const localDate = new Date(utcDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const date = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
      if (!date) continue;

      const hour = localDate.getHours();

      if (!dailyMap[date]) {
        dailyMap[date] = { revenue: 0, tax: 0, tips: 0, discounts: 0, orderCount: 0, items: {} };
      }

      const hourlyKey = `${date}|${hour}`;
      if (!hourlyMap[hourlyKey]) {
        hourlyMap[hourlyKey] = { date, hour, revenue: 0, tax: 0, tips: 0, discounts: 0, orderCount: 0 };
      }

      const day = dailyMap[date];
      const hourBucket = hourlyMap[hourlyKey];
      day.orderCount++;
      hourBucket.orderCount++;

      const totalMoney = order.totalMoney || order.total_money;
      const totalTax = order.totalTaxMoney || order.total_tax_money;
      const totalTip = order.totalTipMoney || order.total_tip_money;
      const totalDiscount = order.totalDiscountMoney || order.total_discount_money;

      const rev = Number(totalMoney?.amount || 0) / 100;
      const tax = Number(totalTax?.amount || 0) / 100;
      const tip = Number(totalTip?.amount || 0) / 100;
      const disc = Number(totalDiscount?.amount || 0) / 100;

      day.revenue += rev;
      day.tax += tax;
      day.tips += tip;
      day.discounts += disc;

      hourBucket.revenue += rev;
      hourBucket.tax += tax;
      hourBucket.tips += tip;
      hourBucket.discounts += disc;

      const lineItems = order.lineItems || order.line_items || [];
      for (const item of lineItems) {
        const itemName = item.name || "Unknown";
        const catalogId = item.catalogObjectId || item.catalog_object_id || "";
        const qty = Number(item.quantity || 1);
        const itemTotal = Number((item.totalMoney || item.total_money)?.amount || 0) / 100;

        const key = `${itemName}__${catalogId}`;
        if (!day.items[key]) {
          day.items[key] = { name: itemName, squareItemId: catalogId, quantity: 0, revenue: 0 };
        }
        day.items[key].quantity += qty;
        day.items[key].revenue += itemTotal;
      }
    }

    let totalDays = 0;
    let totalOrders = 0;

    for (const [date, day] of Object.entries(dailyMap)) {
      // Net revenue = gross revenue minus tax and discounts (tips are pass-through, not a deduction)
      const netRevenue = day.revenue - day.tax - day.discounts;

      await sql`INSERT INTO daily_sales (id, date, total_revenue, total_tax, total_tips, total_discounts, net_revenue, order_count, updated_at)
        VALUES (${uuid()}, ${date}, ${Math.round(day.revenue * 100) / 100}, ${Math.round(day.tax * 100) / 100}, ${Math.round(day.tips * 100) / 100}, ${Math.round(day.discounts * 100) / 100}, ${Math.round(netRevenue * 100) / 100}, ${day.orderCount}, NOW())
        ON CONFLICT(date) DO UPDATE SET
          total_revenue = EXCLUDED.total_revenue,
          total_tax = EXCLUDED.total_tax,
          total_tips = EXCLUDED.total_tips,
          total_discounts = EXCLUDED.total_discounts,
          net_revenue = EXCLUDED.net_revenue,
          order_count = EXCLUDED.order_count,
          updated_at = NOW()`;

      await sql`DELETE FROM item_sales WHERE date = ${date}`;

      for (const item of Object.values(day.items)) {
        const matchedItem = findMatchingMenuItem(item.name, item.squareItemId, menuItems);

        await sql`INSERT INTO item_sales (id, date, menu_item_id, square_item_name, square_item_id, quantity_sold, total_revenue)
          VALUES (${uuid()}, ${date}, ${matchedItem?.id || null}, ${item.name}, ${item.squareItemId || null}, ${item.quantity}, ${Math.round(item.revenue * 100) / 100})`;

        // --- Inventory deduction for this item ---
        if (matchedItem) {
          const recipes = await sql`
            SELECT r.ingredient_id, r.quantity as recipe_qty, r.quantity_unit as recipe_unit,
              i.name as ingredient_name, i.unit, i.supplier, i.batch_yield
            FROM recipes r
            JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.menu_item_id = ${matchedItem.id}
          ` as any[];

          for (const recipe of recipes) {
            const convertedQty = convertUnits(recipe.recipe_qty, recipe.recipe_unit, recipe.unit);
            const totalDeduction = convertedQty * item.quantity;

            if (recipe.supplier === "Homemade") {
              // Drill into sub-recipe to get actual raw ingredients
              const subIngredients = await sql`
                SELECT ci.id, ci.name, ci.unit,
                  sri.quantity as sub_qty
                FROM sub_recipe_ingredients sri
                JOIN ingredients ci ON sri.child_ingredient_id = ci.id
                WHERE sri.parent_ingredient_id = ${recipe.ingredient_id}
              ` as any[];

              for (const sub of subIngredients) {
                // If batch_yield is set, sub-recipe quantities are per-batch, so scale down
                const batchYield = Number(recipe.batch_yield) || 0;
                const subDeduction = batchYield > 0
                  ? (sub.sub_qty / batchYield) * totalDeduction
                  : sub.sub_qty * totalDeduction;
                const usageId = `sync_${date}_${matchedItem.id}_${sub.id}`;

                // Deduplication: only insert if this sync usage doesn't already exist
                const existing = await sql`
                  SELECT id FROM inventory_usage WHERE id = ${usageId}
                `;
                if (existing.length === 0) {
                  await sql`
                    INSERT INTO inventory_usage (id, ingredient_id, menu_item_id, quantity_used, unit, transaction_qty, date)
                    VALUES (${usageId}, ${sub.id}, ${matchedItem.id}, ${subDeduction}, ${sub.unit}, ${item.quantity}, ${date})
                  `;
                  // Only deduct from stock if this sale happened AFTER the last manual count
                  await sql`
                    UPDATE ingredients SET current_stock = GREATEST(0, current_stock - ${subDeduction}), updated_at = now()
                    WHERE id = ${sub.id}
                      AND (stock_counted_at IS NULL OR ${date}::date > stock_counted_at::date)
                  `;
                }
              }
            } else {
              // Direct ingredient (not homemade)
              const usageId = `sync_${date}_${matchedItem.id}_${recipe.ingredient_id}`;

              const existing = await sql`
                SELECT id FROM inventory_usage WHERE id = ${usageId}
              `;
              if (existing.length === 0) {
                await sql`
                  INSERT INTO inventory_usage (id, ingredient_id, menu_item_id, quantity_used, unit, transaction_qty, date)
                  VALUES (${usageId}, ${recipe.ingredient_id}, ${matchedItem.id}, ${totalDeduction}, ${recipe.unit}, ${item.quantity}, ${date})
                `;
                // Only deduct from stock if this sale happened AFTER the last manual count
                await sql`
                  UPDATE ingredients SET current_stock = GREATEST(0, current_stock - ${totalDeduction}), updated_at = now()
                  WHERE id = ${recipe.ingredient_id}
                    AND (stock_counted_at IS NULL OR ${date}::date > stock_counted_at::date)
                `;
              }
            }
          }
        }
      }

      totalDays++;
      totalOrders += day.orderCount;
    }

    // Save hourly sales buckets
    for (const bucket of Object.values(hourlyMap)) {
      const netRev = bucket.revenue - bucket.tax - bucket.discounts;
      await sql`INSERT INTO hourly_sales (id, date, hour, total_revenue, total_tax, total_tips, total_discounts, net_revenue, order_count, updated_at)
        VALUES (${uuid()}, ${bucket.date}, ${bucket.hour}, ${Math.round(bucket.revenue * 100) / 100}, ${Math.round(bucket.tax * 100) / 100}, ${Math.round(bucket.tips * 100) / 100}, ${Math.round(bucket.discounts * 100) / 100}, ${Math.round(netRev * 100) / 100}, ${bucket.orderCount}, NOW())
        ON CONFLICT(date, hour) DO UPDATE SET
          total_revenue = EXCLUDED.total_revenue,
          total_tax = EXCLUDED.total_tax,
          total_tips = EXCLUDED.total_tips,
          total_discounts = EXCLUDED.total_discounts,
          net_revenue = EXCLUDED.net_revenue,
          order_count = EXCLUDED.order_count,
          updated_at = NOW()`;
    }

    return NextResponse.json({
      success: true,
      daysProcessed: totalDays,
      ordersProcessed: totalOrders,
      totalOrdersFetched: orders.length,
      hourlyBuckets: Object.keys(hourlyMap).length,
    });
  } catch (error: any) {
    console.error("Square sync error:", error);
    if (error.message?.includes("not configured")) {
      return NextResponse.json(
        { error: "Square API is not configured. Please set your Square access token." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Failed to sync with Square" },
      { status: 500 }
    );
  }
}
