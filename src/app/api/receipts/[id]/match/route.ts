import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { findBestMatch } from "@/lib/fuzzy-match";

// POST - fuzzy-match receipt items against ingredients
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const { id } = await params;

    // Check if we should only re-match unmatched items (don't overwrite manual matches)
    const url = new URL(request.url);
    const unmatchedOnly = url.searchParams.get("unmatched_only") === "true";

    const receiptRows = await sql`SELECT * FROM receipts WHERE id = ${id} AND restaurant_id = ${restaurantId}`;
    if (receiptRows.length === 0) {
      return NextResponse.json(
        { error: "Receipt not found" },
        { status: 404 }
      );
    }

    // If unmatched_only, only grab items that haven't been matched yet
    const items = unmatchedOnly
      ? await sql`SELECT * FROM receipt_items WHERE receipt_id = ${id} AND (match_status IS NULL OR match_status = 'unmatched' OR ingredient_id IS NULL)` as Array<{ id: string; raw_name: string }>
      : await sql`SELECT * FROM receipt_items WHERE receipt_id = ${id}` as Array<{ id: string; raw_name: string }>;

    const ingredients = await sql`SELECT id, name FROM ingredients WHERE restaurant_id = ${restaurantId}` as Array<{ id: string; name: string }>;

    const results: Array<{
      item_id: string;
      raw_name: string;
      match: { ingredient_id: string; ingredient_name: string; confidence: number } | null;
    }> = [];

    // Load learned matches from memory (past user confirmations)
    const memory = await sql`SELECT raw_name_lower, raw_name_normalized, ingredient_id FROM receipt_match_memory WHERE restaurant_id = ${restaurantId}` as Array<{ raw_name_lower: string; raw_name_normalized: string; ingredient_id: string }>;
    const memoryByExact = new Map<string, string>();
    const memoryByNormalized = new Map<string, string>();
    for (const m of memory) {
      memoryByExact.set(m.raw_name_lower, m.ingredient_id);
      if (m.raw_name_normalized) memoryByNormalized.set(m.raw_name_normalized, m.ingredient_id);
    }

    for (const item of items) {
      const rawLower = item.raw_name.toLowerCase().trim();
      const normalized = rawLower
        .replace(/\b\d+(\.\d+)?\s*(oz|lb|ct|pk|gal|fl)\b/gi, "")
        .replace(/\b\d{1,6}\s*\/\s*case\b/gi, "")
        .replace(/[^a-z\s]/g, " ")
        .replace(/\b\d+\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // Step 1: Check learned matches (exact raw name or normalized)
      const learnedIngId = memoryByExact.get(rawLower) || memoryByNormalized.get(normalized);
      if (learnedIngId) {
        // Verify the ingredient still exists
        const ingExists = ingredients.find((i) => i.id === learnedIngId);
        if (ingExists) {
          await sql`UPDATE receipt_items
             SET ingredient_id = ${learnedIngId}, match_confidence = ${0.99}, match_status = 'auto_matched'
             WHERE id = ${item.id}`;
          results.push({
            item_id: item.id,
            raw_name: item.raw_name,
            match: { ingredient_id: learnedIngId, ingredient_name: ingExists.name, confidence: 0.99 },
          });
          continue;
        }
      }

      // Step 2: Fall back to fuzzy matching
      const match = findBestMatch(item.raw_name, ingredients);

      if (match) {
        await sql`UPDATE receipt_items
           SET ingredient_id = ${match.ingredient_id}, match_confidence = ${match.confidence}, match_status = ${match.confidence >= 0.7 ? "auto_matched" : "unmatched"}
           WHERE id = ${item.id}`;
      } else {
        // No match found — explicitly mark as unmatched so the UI knows
        await sql`UPDATE receipt_items
           SET match_status = 'unmatched', match_confidence = ${0}, ingredient_id = NULL
           WHERE id = ${item.id}`;
      }

      results.push({
        item_id: item.id,
        raw_name: item.raw_name,
        match,
      });
    }

    await sql`UPDATE receipts SET status = 'matched' WHERE id = ${id} AND restaurant_id = ${restaurantId}`;

    const matchedItems = await sql`SELECT ri.*, i.name as ingredient_name, i.package_price as current_package_price,
                i.package_size as current_package_size, i.package_unit as current_package_unit,
                i.cost_per_unit as current_cost_per_unit
         FROM receipt_items ri
         LEFT JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE ri.receipt_id = ${id}
         ORDER BY ri.created_at`;

    return NextResponse.json({
      receipt_id: id,
      items: matchedItems,
      match_summary: {
        total: items.length,
        auto_matched: results.filter((r) => r.match && r.match.confidence >= 0.7).length,
        needs_review: results.filter((r) => !r.match || r.match.confidence < 0.7).length,
      },
    });
  } catch (error: unknown) {
    console.error("Error matching receipt items:", error);
    return NextResponse.json(
      { error: "Failed to match receipt items" },
      { status: 500 }
    );
  }
}
