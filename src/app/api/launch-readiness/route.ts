import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    // Run all queries in parallel
    const [
      recipesWithItemsRows,
      totalMenuItemsRows,
      suppliersAssignedRows,
      totalIngredientsRows,
      ingredientsPricedRows,
      businessSettingsRows,
      categoriesRows,
    ] = await Promise.all([
      // Count menu items that have at least one recipe row
      sql`SELECT COUNT(DISTINCT menu_item_id) as count FROM recipes WHERE restaurant_id = ${restaurantId}`,
      // Total menu items
      sql`SELECT COUNT(*) as count FROM menu_items WHERE restaurant_id = ${restaurantId}`,
      // Ingredients with a supplier assigned
      sql`SELECT COUNT(*) as count FROM ingredients WHERE restaurant_id = ${restaurantId} AND supplier IS NOT NULL AND supplier != ''`,
      // Total ingredients
      sql`SELECT COUNT(*) as count FROM ingredients WHERE restaurant_id = ${restaurantId}`,
      // Ingredients with cost_per_unit > 0
      sql`SELECT COUNT(*) as count FROM ingredients WHERE restaurant_id = ${restaurantId} AND cost_per_unit > 0`,
      // Business settings
      sql`SELECT business_hours, food_cost_target FROM business_settings WHERE restaurant_id = ${restaurantId}`,
      // Menu categories
      sql`SELECT COUNT(*) as count FROM menu_categories WHERE restaurant_id = ${restaurantId}`,
    ]);

    const recipeDone = Number(recipesWithItemsRows[0]?.count || 0);
    const recipeTotal = Number(totalMenuItemsRows[0]?.count || 0);

    const supplierDone = Number(suppliersAssignedRows[0]?.count || 0);
    const ingredientTotal = Number(totalIngredientsRows[0]?.count || 0);

    const pricedDone = Number(ingredientsPricedRows[0]?.count || 0);

    // Business hours check
    let businessHoursSet = false;
    if (businessSettingsRows.length > 0) {
      const bh = businessSettingsRows[0].business_hours;
      if (bh) {
        const hours = typeof bh === "string" ? JSON.parse(bh) : bh;
        businessHoursSet = Object.values(hours).some(
          (v: any) => v !== null && v !== undefined
        );
      }
    }

    // Cost targets check
    let costTargetsSet = false;
    if (businessSettingsRows.length > 0) {
      const fct = businessSettingsRows[0].food_cost_target;
      costTargetsSet = fct !== null && fct !== undefined && Number(fct) > 0;
    }

    // Categories check
    const categoriesSet = Number(categoriesRows[0]?.count || 0) > 0;

    // Build checks object
    const checks = {
      recipesComplete: {
        pass: recipeTotal > 0 && recipeDone >= recipeTotal,
        done: recipeDone,
        total: recipeTotal,
      },
      suppliersAssigned: {
        pass: ingredientTotal > 0 && supplierDone >= ingredientTotal,
        done: supplierDone,
        total: ingredientTotal,
      },
      ingredientsPriced: {
        pass: ingredientTotal > 0 && pricedDone >= ingredientTotal,
        done: pricedDone,
        total: ingredientTotal,
      },
      businessHoursSet: { pass: businessHoursSet },
      costTargetsSet: { pass: costTargetsSet },
      categoriesSet: { pass: categoriesSet },
    };

    // Calculate score as weighted average
    // recipes (40%), suppliers (30%), pricing (20%), other checks (10%)
    const recipeScore =
      recipeTotal > 0 ? (recipeDone / recipeTotal) * 100 : 0;
    const supplierScore =
      ingredientTotal > 0 ? (supplierDone / ingredientTotal) * 100 : 0;
    const pricingScore =
      ingredientTotal > 0 ? (pricedDone / ingredientTotal) * 100 : 0;

    // "Other" checks: businessHours, costTargets, categories — each is worth 1/3 of the 10%
    const otherChecks = [businessHoursSet, costTargetsSet, categoriesSet];
    const otherScore =
      (otherChecks.filter(Boolean).length / otherChecks.length) * 100;

    const score = Math.round(
      recipeScore * 0.4 +
        supplierScore * 0.3 +
        pricingScore * 0.2 +
        otherScore * 0.1
    );

    const ready = score >= 100;

    return NextResponse.json({ ready, score, checks });
  } catch (error: any) {
    console.error("Error fetching launch readiness:", error);

    if (
      error.message === "Not authenticated" ||
      error.message === "No restaurant associated with this account"
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to load launch readiness" },
      { status: 500 }
    );
  }
}
