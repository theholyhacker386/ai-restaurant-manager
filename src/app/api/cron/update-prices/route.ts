import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { lookupPrice } from "@/lib/supplier-prices";

/**
 * Weekly cron job: Update ingredient prices from supplier websites.
 * Runs once a week, checks every ingredient against its supplier.
 * Only updates prices that are older than 7 days.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = neon(process.env.NEON_DATABASE_URL!);
  const results = { updated: 0, failed: 0, skipped: 0, total: 0 };

  try {
    // Get all restaurants' ingredients that have a supplier
    const ingredients = await sql`
      SELECT DISTINCT i.name as ingredient_name, i.supplier as supplier_name
      FROM ingredients i
      WHERE i.supplier IS NOT NULL
        AND i.supplier != ''
        AND i.supplier != 'Other'
      LIMIT 500
    `;

    results.total = ingredients.length;

    for (const ing of ingredients) {
      try {
        const result = await lookupPrice(ing.ingredient_name, ing.supplier_name);

        if (result.found && result.price) {
          // Update the ingredient's price in the database
          await sql`
            UPDATE ingredients
            SET package_price = ${result.price},
                package_unit = COALESCE(${result.unit || null}, package_unit)
            WHERE LOWER(name) = ${ing.ingredient_name.toLowerCase()}
              AND LOWER(supplier) = ${ing.supplier_name.toLowerCase()}
              AND (package_price IS NULL OR package_price != ${result.price})
          `;
          results.updated++;
        } else {
          results.failed++;
        }

        // Be respectful — delay between lookups
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        results.failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Price update complete: ${results.updated} updated, ${results.failed} not found, ${results.skipped} skipped out of ${results.total} ingredients`,
      results,
    });
  } catch (error) {
    console.error("Weekly price update error:", error);
    return NextResponse.json(
      { error: "Price update failed", details: String(error) },
      { status: 500 }
    );
  }
}
