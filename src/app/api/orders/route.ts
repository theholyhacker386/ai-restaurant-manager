import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    const ingredients = await sql`
      SELECT
        i.id,
        i.name,
        i.unit,
        i.package_size,
        i.package_unit,
        i.package_price,
        i.supplier,
        i.ingredient_type,
        i.current_stock,
        i.reorder_point,
        i.par_level,
        i.cost_per_unit
      FROM ingredients i
      WHERE i.restaurant_id = ${restaurantId}
      ORDER BY i.supplier, i.ingredient_type, i.name
    ` as any[];

    // Group ingredients by supplier
    const ordersBySupplier: Record<string, any[]> = {};

    ingredients.forEach((ingredient) => {
      const supplier = ingredient.supplier || "Unassigned Supplier";

      if (!ordersBySupplier[supplier]) {
        ordersBySupplier[supplier] = [];
      }

      // Calculate reorder needs
      const stock = Number(ingredient.current_stock || 0);
      const reorderPoint = Number(ingredient.reorder_point || 0);
      const parLevel = Number(ingredient.par_level || 0);
      const packageSize = Number(ingredient.package_size || 0);
      const packagePrice = Number(ingredient.package_price || 0);
      const costPerUnit = Number(ingredient.cost_per_unit || 0);

      // Needs reorder if stock is at or below reorder point (and reorder point is set)
      const needsReorder = reorderPoint > 0 && stock <= reorderPoint;

      // How much to order: bring stock up to par level
      let orderQty = 0;
      if (needsReorder && parLevel > 0) {
        orderQty = parLevel - stock;
      } else if (needsReorder) {
        // Default: order enough to reach 2x reorder point
        orderQty = reorderPoint * 2 - stock;
      }

      // If we have package info, round up to whole packages
      let packagesToBuy = 0;
      let estimatedCost = 0;
      if (orderQty > 0 && packageSize > 0) {
        packagesToBuy = Math.ceil(orderQty / packageSize);
        estimatedCost = packagesToBuy * packagePrice;
        orderQty = packagesToBuy * packageSize; // Actual qty after rounding to packages
      } else if (orderQty > 0) {
        estimatedCost = orderQty * costPerUnit;
      }

      // Build a human-friendly order display string
      let orderDisplay = '';
      if (packagesToBuy > 0) {
        const pkgUnit = ingredient.package_unit || ingredient.unit;
        const caseMatch = pkgUnit.match(/case|bottle|tub|box|bag|container|bucket|pack/i);
        if (caseMatch) {
          const unitWord = caseMatch[0].toLowerCase();
          orderDisplay = `${packagesToBuy} ${unitWord}${packagesToBuy > 1 ? 's' : ''}`;
        } else {
          orderDisplay = `${packagesToBuy} pkg${packagesToBuy > 1 ? 's' : ''} (${packageSize} ${pkgUnit})`;
        }
      } else if (orderQty > 0) {
        orderDisplay = `${Math.round(orderQty * 100) / 100} ${ingredient.unit}`;
      }

      ordersBySupplier[supplier].push({
        ...ingredient,
        needsReorder,
        orderQty,
        packagesToBuy,
        estimatedCost,
        orderDisplay,
      });
    });

    const orders = Object.entries(ordersBySupplier).map(([supplier, items]) => ({
      supplier,
      items,
      totalItems: items.length,
      itemsNeedingReorder: items.filter((i: any) => i.needsReorder).length,
      totalCost: items.reduce((sum: number, i: any) => sum + i.estimatedCost, 0),
    }));

    // Sort so suppliers with items needing reorder appear first, then alphabetical
    orders.sort((a, b) => {
      if (a.itemsNeedingReorder > 0 && b.itemsNeedingReorder === 0) return -1;
      if (a.itemsNeedingReorder === 0 && b.itemsNeedingReorder > 0) return 1;
      return a.supplier.localeCompare(b.supplier);
    });

    return NextResponse.json({ orders, allIngredients: ingredients });
  } catch (error) {
    console.error("Orders API error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
