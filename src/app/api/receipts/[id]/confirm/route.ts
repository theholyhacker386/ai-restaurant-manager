import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { convertToBaseUnit } from "@/lib/unit-conversions";

interface ConfirmItem {
  item_id: string;
  ingredient_id: string | null;
  action: "update" | "one_off" | "skip";
  units_per_pack?: number; // e.g. 2 loaves per pack
  override_qty?: number; // override receipt qty if wrong
}

// POST - confirm matches and update ingredient prices
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;
    const body = await request.json();
    const { items } = body as { items: ConfirmItem[] };

    const receiptRows = await sql`SELECT * FROM receipts WHERE id = ${id}`;
    const receipt = receiptRows[0];

    if (!receipt) {
      return NextResponse.json(
        { error: "Receipt not found" },
        { status: 404 }
      );
    }

    const priceUpdates: Array<{
      ingredient_name: string;
      old_price: number;
      new_price: number;
      change_pct: number;
    }> = [];

    for (const item of items) {
      if (item.action === "skip" || !item.ingredient_id) {
        await sql`UPDATE receipt_items SET match_status = 'skipped', ingredient_id = NULL WHERE id = ${item.item_id}`;
        continue;
      }

      const receiptItemRows = await sql`SELECT * FROM receipt_items WHERE id = ${item.item_id}`;
      const receiptItem: any = receiptItemRows[0];

      if (!receiptItem) continue;

      // Update the match on the receipt item
      const matchStatus = item.action === "one_off" ? "one_off" : "manual_matched";
      if (item.ingredient_id !== receiptItem.ingredient_id || receiptItem.match_status !== matchStatus) {
        await sql`UPDATE receipt_items SET ingredient_id = ${item.ingredient_id}, match_status = ${matchStatus}, is_one_off = ${item.action === "one_off"} WHERE id = ${item.item_id}`;
      }

      const ingredientRows = await sql`SELECT * FROM ingredients WHERE id = ${item.ingredient_id}`;
      const ingredient: any = ingredientRows[0];

      if (!ingredient) continue;

      // Calculate the REAL price per package:
      // If user specified units_per_pack (e.g. 2-pack) or qty > 1, divide accordingly
      const receiptQty = item.override_qty || receiptItem.quantity || 1;
      const unitsPerPack = item.units_per_pack || 1;
      const totalUnits = receiptQty * unitsPerPack;
      const totalPaid = receiptItem.total_price || 0;
      // Price for ONE package (what the ingredient tracks)
      const newPrice = totalUnits > 0 ? totalPaid / totalUnits : totalPaid;

      const oldPrice = ingredient.package_price || 0;
      const changePct = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;

      // Always record in price history (so you have a record of what you paid)
      // Use the actual receipt size if available (handles substitutions like 2lb instead of 5lb)
      const historySize = (receiptItem.item_size && Number(receiptItem.item_size) > 0)
        ? Number(receiptItem.item_size)
        : ingredient.package_size;
      const historyUnit = receiptItem.item_size_unit || ingredient.package_unit;
      const historyCostPerUnit = historySize > 0 ? newPrice / historySize : 0;
      const historySource = item.action === "one_off" ? "receipt_oneoff" : "receipt";
      await sql`INSERT INTO ingredient_price_history (id, ingredient_id, package_price, package_size, package_unit, cost_per_unit, source, receipt_id)
         VALUES (${uuid()}, ${item.ingredient_id}, ${newPrice}, ${historySize}, ${historyUnit}, ${historyCostPerUnit}, ${historySource}, ${id})`;

      // Only update the ingredient's actual price if this is a regular purchase (not one-off)
      if (item.action === "update") {
        const newCostPerUnit = ingredient.package_size > 0 ? newPrice / ingredient.package_size : 0;

        await sql`UPDATE ingredients
           SET package_price = ${newPrice}, cost_per_unit = ${newCostPerUnit}, last_updated = NOW(), updated_at = NOW()
           WHERE id = ${item.ingredient_id}`;

        // Increment current_stock when receiving inventory
        // Convert receipt quantity to the ingredient's native unit (e.g. oz, fl oz, each)
        //
        // Smart size handling: If the receipt AI detected the actual package size
        // (e.g. "2LB" strawberries instead of the usual "5LB"), use THAT size.
        // This handles Walmart/store substitutions correctly.
        //
        // Unit conversion: receipt item_size_unit → ingredient's base unit
        const receiptSize = receiptItem.item_size ? Number(receiptItem.item_size) : 0;
        const receiptSizeUnit = receiptItem.item_size_unit || "";
        const ingredientUnit = (ingredient.unit || "").toLowerCase();

        let sizePerPackage: number;
        if (receiptSize > 0 && receiptSizeUnit) {
          // We have the actual size from the receipt — try to convert to the ingredient's base unit
          const converted = convertToBaseUnit(receiptSize, receiptSizeUnit, ingredientUnit);
          if (converted !== null) {
            sizePerPackage = converted;
          } else {
            // Incompatible units (e.g. "lb" to "each") — fall back to stored package_size
            sizePerPackage = ingredient.package_size > 0 ? ingredient.package_size : 1;
          }
        } else if (ingredient.package_size > 0) {
          // Fall back to the stored expected package size
          sizePerPackage = ingredient.package_size;
        } else {
          sizePerPackage = 1;
        }

        const stockToAdd = totalUnits * sizePerPackage;

        await sql`
          UPDATE ingredients
          SET current_stock = COALESCE(current_stock, 0) + ${stockToAdd},
              stock_counted_at = NOW(),
              updated_at = NOW()
          WHERE id = ${item.ingredient_id}
        `;

        priceUpdates.push({
          ingredient_name: ingredient.name,
          old_price: oldPrice,
          new_price: newPrice,
          change_pct: Math.round(changePct * 10) / 10,
        });
      }
    }

    await sql`UPDATE receipts SET status = 'confirmed' WHERE id = ${id}`;

    // Save learned matches to memory — so next time we see the same product, we know instantly
    for (const item of items) {
      if (item.action === "skip" || !item.ingredient_id) continue;
      const riRows = await sql`SELECT raw_name FROM receipt_items WHERE id = ${item.item_id}`;
      if (!riRows[0]) continue;
      const rawLower = (riRows[0].raw_name as string).toLowerCase().trim();
      // Also store a simplified version (no numbers, special chars) for fuzzy fallback
      const normalized = rawLower
        .replace(/\b\d+(\.\d+)?\s*(oz|lb|ct|pk|gal|fl)\b/gi, "")
        .replace(/\b\d{1,6}\s*\/\s*case\b/gi, "")
        .replace(/[^a-z\s]/g, " ")
        .replace(/\b\d+\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      await sql`INSERT INTO receipt_match_memory (raw_name_lower, raw_name_normalized, ingredient_id)
        VALUES (${rawLower}, ${normalized}, ${item.ingredient_id})
        ON CONFLICT (raw_name_lower) DO UPDATE SET
          ingredient_id = ${item.ingredient_id},
          match_count = receipt_match_memory.match_count + 1,
          updated_at = NOW()`;
    }

    // Auto-create a COGS expense so this receipt counts in food cost tracking
    // Both regular price updates AND one-off purchases count as actual money spent on food
    const matchedItems = items.filter((i) => i.action === "update" || i.action === "one_off");
    if (matchedItems.length > 0) {
      // Calculate total from matched items (not the full receipt — skip non-food items)
      let cogsTotal = 0;
      for (const item of matchedItems) {
        const riRows = await sql`SELECT total_price FROM receipt_items WHERE id = ${item.item_id}`;
        if (riRows[0]) cogsTotal += Number(riRows[0].total_price) || 0;
      }

      if (cogsTotal > 0) {
        // Find the "Ingredients/Food" COGS category, fall back to any COGS category
        const catRows = await sql`SELECT id FROM expense_categories WHERE type = 'cogs' ORDER BY CASE WHEN name ILIKE '%ingredient%' OR name ILIKE '%food%' THEN 0 ELSE 1 END LIMIT 1`;
        const categoryId = catRows[0]?.id || null;

        const supplier = (receipt as Record<string, unknown>).supplier as string || "Unknown Store";
        const receiptDate = (receipt as Record<string, unknown>).receipt_date as string || new Date().toISOString().slice(0, 10);

        // Only create expense if we haven't already for this receipt (idempotent)
        const existingExpense = await sql`SELECT id FROM expenses WHERE source = 'receipt' AND source_transaction_id = ${id} LIMIT 1`;
        if (existingExpense.length === 0) {
          await sql`INSERT INTO expenses (id, category_id, description, amount, date, is_recurring, source, source_transaction_id, notes)
            VALUES (${uuid()}, ${categoryId}, ${`Receipt: ${supplier}`}, ${cogsTotal}, ${receiptDate}, ${false}, 'receipt', ${id}, ${`Auto-created from receipt confirmation (${matchedItems.length} items)`})`;
        }
      }
    }

    return NextResponse.json({
      success: true,
      receipt_id: id,
      price_updates: priceUpdates,
      alerts: priceUpdates.filter((u) => Math.abs(u.change_pct) > 30),
    });
  } catch (error: unknown) {
    console.error("Error confirming receipt:", error);
    return NextResponse.json(
      { error: "Failed to confirm receipt" },
      { status: 500 }
    );
  }
}
