import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { v4 as uuid } from "uuid";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generate a shopping list from sales data + recipes.
 * Can filter by supplier (e.g., just Walmart or just Costco).
 * Uses bulk SQL queries for performance (3 queries instead of hundreds).
 */
export async function POST(req: Request) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const { days = 7, multiplier = 1.0, supplier: supplierFilter } = await req.json();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = new Date().toISOString().split("T")[0];

    // Single bulk query: calculate all ingredient needs (direct + sub-recipe)
    // with unit conversion, batch_yield scaling, and stock subtraction
    const needs = (await sql`
      WITH sales AS (
        SELECT menu_item_id, SUM(quantity_sold) as qty
        FROM item_sales
        WHERE date >= ${startStr} AND date <= ${endStr} AND menu_item_id IS NOT NULL
          AND restaurant_id = ${restaurantId}
        GROUP BY menu_item_id
      ),
      direct_needs AS (
        SELECT i.id, i.name, i.unit,
          SUM(
            CASE
              WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN (r.quantity / 28.35) * s.qty
              WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN (r.quantity / 453.6) * s.qty
              WHEN r.quantity_unit = 'g' AND i.unit = 'fl oz' THEN (r.quantity / 28.35) * s.qty
              WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN (r.quantity / 16) * s.qty
              WHEN r.quantity_unit = 'lb' AND i.unit = 'oz' THEN (r.quantity * 16) * s.qty
              WHEN r.quantity_unit = 'oz' AND i.unit = 'g' THEN (r.quantity * 28.35) * s.qty
              ELSE r.quantity * s.qty
            END
          ) as total_needed,
          i.supplier, i.cost_per_unit, i.package_size, i.package_unit, i.package_price, i.current_stock
        FROM sales s
        JOIN recipes r ON r.menu_item_id = s.menu_item_id
        JOIN ingredients i ON r.ingredient_id = i.id
        WHERE i.supplier != 'Homemade' AND i.restaurant_id = ${restaurantId}
        GROUP BY i.id, i.name, i.unit, i.supplier, i.cost_per_unit, i.package_size, i.package_unit, i.package_price, i.current_stock
      ),
      sub_needs AS (
        SELECT ci.id, ci.name, ci.unit,
          SUM(
            CASE
              WHEN COALESCE(i.batch_yield, 0) > 0 THEN
                (sri.quantity / i.batch_yield) * (
                  CASE
                    WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN (r.quantity / 28.35)
                    WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN (r.quantity / 453.6)
                    WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN (r.quantity / 16)
                    WHEN r.quantity_unit = 'lb' AND i.unit = 'oz' THEN (r.quantity * 16)
                    ELSE r.quantity
                  END
                ) * s.qty
              ELSE
                sri.quantity * r.quantity * s.qty
            END
          ) as total_needed,
          ci.supplier, ci.cost_per_unit, ci.package_size, ci.package_unit, ci.package_price, ci.current_stock
        FROM sales s
        JOIN recipes r ON r.menu_item_id = s.menu_item_id
        JOIN ingredients i ON r.ingredient_id = i.id
        JOIN sub_recipe_ingredients sri ON sri.parent_ingredient_id = i.id
        JOIN ingredients ci ON sri.child_ingredient_id = ci.id
        WHERE i.supplier = 'Homemade' AND i.restaurant_id = ${restaurantId}
        GROUP BY ci.id, ci.name, ci.unit, ci.supplier, ci.cost_per_unit, ci.package_size, ci.package_unit, ci.package_price, ci.current_stock
      ),
      all_needs AS (
        SELECT * FROM direct_needs
        UNION ALL
        SELECT * FROM sub_needs
      )
      SELECT id, name, unit, supplier, cost_per_unit, package_size, package_unit, package_price,
        GREATEST(0, SUM(total_needed) - MAX(current_stock)) as need_qty
      FROM all_needs
      GROUP BY id, name, unit, supplier, cost_per_unit, package_size, package_unit, package_price
      HAVING GREATEST(0, SUM(total_needed) - MAX(current_stock)) > 0
      ORDER BY supplier, name
    `) as any[];

    // Check for unresolved reorder flags (items flagged during receiving)
    const reorderFlags = (await sql`
      SELECT rf.id as flag_id, rf.ingredient_id, rf.reason,
        i.name, i.unit, i.supplier, i.cost_per_unit, i.package_size, i.package_unit, i.package_price, i.current_stock
      FROM reorder_flags rf
      JOIN ingredients i ON i.id = rf.ingredient_id
      WHERE rf.resolved = false AND rf.restaurant_id = ${restaurantId}
    `) as any[];

    // Merge reorder flags into needs (avoid duplicates)
    const existingIds = new Set(needs.map((n: any) => n.id));
    for (const flag of reorderFlags) {
      if (!existingIds.has(flag.ingredient_id)) {
        const pkgSize = Number(flag.package_size) || 1;
        needs.push({
          id: flag.ingredient_id,
          name: flag.name,
          unit: flag.unit,
          supplier: flag.supplier || "Other",
          cost_per_unit: flag.cost_per_unit,
          package_size: flag.package_size,
          package_unit: flag.package_unit,
          package_price: flag.package_price,
          need_qty: pkgSize, // order at least one package
          _reorder_note: `Reordered: ${flag.reason === 'out_of_stock' ? 'was out of stock' : flag.reason}`,
        });
        existingIds.add(flag.ingredient_id);
      }
    }

    if (needs.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No ingredients needed — either no sales data or you have enough stock.",
      });
    }

    // Build shopping list grouped by supplier
    const supplierGroups = new Map<string, Array<{
      ingredientId: string;
      ingredient: string;
      quantityNeeded: string;
      estimatedCost: string;
      packagesToBuy: number | null;
      packageInfo: string | null;
    }>>();

    let totalEstCost = 0;

    for (const need of needs) {
      const adjustedQty = Number(need.need_qty) * multiplier;
      const supplier = need.supplier || "Other";

      if (supplierFilter && supplier.toLowerCase() !== supplierFilter.toLowerCase()) continue;

      let packagesToBuy: number | null = null;
      let packageInfo: string | null = null;
      const pkgSize = Number(need.package_size) || 0;
      const pkgPrice = Number(need.package_price) || 0;
      let estCost = adjustedQty * Number(need.cost_per_unit);
      let buyQty: string;

      if (pkgSize > 0 && pkgPrice > 0) {
        packagesToBuy = Math.ceil(adjustedQty / pkgSize);
        estCost = packagesToBuy * pkgPrice;
        const pkgUnit = need.package_unit || need.unit;
        // Detect package type for clean display
        const caseMatch = pkgUnit.match(/case|bottle|tub|box|bag|container|bucket|pack|jar|loaf/i);
        // Items sold individually (each, banana, slice, etc.) — just show the count naturally
        const isSingleUnit = pkgSize === 1 && (
          need.unit === "each" || need.unit === "slice" || need.unit === "can" ||
          /banana|avocado|pineapple|lemon|lime/i.test(pkgUnit)
        );
        if (isSingleUnit) {
          // "75 bananas" or "21 slices" — not "75 packages"
          const unitName = need.unit === "each" ? need.name.replace(/\s*\(.*\)/, "").toLowerCase() : need.unit;
          buyQty = `${packagesToBuy} ${unitName}${packagesToBuy !== 1 ? "s" : ""}`;
        } else if (caseMatch) {
          const unitWord = caseMatch[0].toLowerCase();
          buyQty = `${packagesToBuy} ${unitWord}${packagesToBuy > 1 ? "s" : ""}`;
        } else {
          buyQty = `${packagesToBuy} pkg${packagesToBuy > 1 ? "s" : ""} (${pkgSize} ${pkgUnit})`;
        }
        packageInfo = `${pkgSize} ${pkgUnit} @ $${pkgPrice.toFixed(2)} each`;
        if ((need as any)._reorder_note) packageInfo = `${(need as any)._reorder_note} | ${packageInfo}`;
      } else {
        buyQty = `${Math.round(adjustedQty * 100) / 100} ${need.unit}`;
      }

      totalEstCost += estCost;

      if (!supplierGroups.has(supplier)) supplierGroups.set(supplier, []);
      supplierGroups.get(supplier)!.push({
        ingredientId: need.id,
        ingredient: need.name,
        quantityNeeded: buyQty,
        estimatedCost: `$${estCost.toFixed(2)}`,
        packagesToBuy,
        packageInfo,
      });
    }

    // Save to database
    const listId = uuid();
    const listName = supplierFilter
      ? `${supplierFilter} List — ${endStr}`
      : `Shopping List — ${endStr}`;

    await sql`
      INSERT INTO shopping_lists (id, restaurant_id, name, based_on_days, multiplier, total_estimated_cost, status)
      VALUES (${listId}, ${restaurantId}, ${listName}, ${days}, ${multiplier}, ${totalEstCost}, 'draft')
    `;

    for (const [supplier, items] of supplierGroups) {
      for (const item of items) {
        await sql`
          INSERT INTO shopping_list_items (id, shopping_list_id, ingredient_name, supplier, quantity_needed, estimated_cost, packages_to_buy, package_info, ingredient_id)
          VALUES (${uuid()}, ${listId}, ${item.ingredient}, ${supplier}, ${item.quantityNeeded}, ${item.estimatedCost}, ${item.packagesToBuy}, ${item.packageInfo}, ${item.ingredientId})
        `;
      }
    }

    // Mark reorder flags as resolved now that they're on a new list
    if (reorderFlags.length > 0) {
      await sql`UPDATE reorder_flags SET resolved = true WHERE resolved = false AND restaurant_id = ${restaurantId}`;
    }

    // Get all unique suppliers for the UI
    const allSuppliers = (await sql`
      SELECT DISTINCT supplier FROM ingredients WHERE supplier IS NOT NULL AND supplier != '' AND restaurant_id = ${restaurantId} ORDER BY supplier
    `) as Array<{ supplier: string }>;

    return NextResponse.json({
      success: true,
      list_id: listId,
      name: listName,
      based_on: `${days} days of sales (${startStr} to ${endStr})`,
      total_estimated_cost: totalEstCost,
      total_ingredients: supplierGroups.size > 0 ? Array.from(supplierGroups.values()).reduce((s, items) => s + items.length, 0) : 0,
      suppliers: Array.from(supplierGroups.keys()),
      all_suppliers: allSuppliers.map((s) => s.supplier),
    });
  } catch (error: any) {
    console.error("Generate shopping list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
