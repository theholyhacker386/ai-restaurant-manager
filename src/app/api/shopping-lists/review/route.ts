import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { callOpenAIWithRetry } from "@/lib/openai";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * AI review of a shopping list — flags anomalies, missing items, and things
 * that don't make sense. Acts as a quality-control watchdog, not a suggestion engine.
 */
export async function POST(req: Request) {
  try {
    const sql = getDb();
    const { listId } = await req.json();

    if (!listId) {
      return NextResponse.json({ error: "Missing listId" }, { status: 400 });
    }

    // Get the shopping list and its items
    const listRows = await sql`
      SELECT id, name, based_on_days, multiplier, total_estimated_cost, created_at
      FROM shopping_lists WHERE id = ${listId}
    ` as any[];

    if (listRows.length === 0) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const list = listRows[0];
    const items = await sql`
      SELECT ingredient_name, supplier, quantity_needed, estimated_cost, package_info
      FROM shopping_list_items
      WHERE shopping_list_id = ${listId}
      ORDER BY supplier, ingredient_name
    ` as any[];

    // Get historical context: what did previous shopping lists look like?
    const prevLists = await sql`
      SELECT sl.id, sl.name, sl.based_on_days, sl.total_estimated_cost, sl.created_at,
        COUNT(sli.id) as item_count
      FROM shopping_lists sl
      LEFT JOIN shopping_list_items sli ON sli.shopping_list_id = sl.id
      WHERE sl.id != ${listId}
      GROUP BY sl.id
      ORDER BY sl.created_at DESC
      LIMIT 3
    ` as any[];

    // Get previous list items for comparison (most recent previous list)
    let prevItems: any[] = [];
    if (prevLists.length > 0) {
      prevItems = await sql`
        SELECT ingredient_name, supplier, quantity_needed, estimated_cost
        FROM shopping_list_items
        WHERE shopping_list_id = ${prevLists[0].id}
        ORDER BY supplier, ingredient_name
      ` as any[];
    }

    // Get ingredient details that might be useful (what's fresh vs frozen, etc.)
    const ingredientContext = await sql`
      SELECT name, unit, supplier, ingredient_type, package_size, package_unit, current_stock
      FROM ingredients
      WHERE supplier != 'Homemade'
      ORDER BY supplier, name
    ` as any[];

    // Get recent weekly sales volume for context
    const salesContext = await sql`
      SELECT
        SUM(CASE WHEN date >= (CURRENT_DATE - 7)::text THEN order_count ELSE 0 END) as orders_this_week,
        SUM(CASE WHEN date >= (CURRENT_DATE - 14)::text AND date < (CURRENT_DATE - 7)::text THEN order_count ELSE 0 END) as orders_last_week,
        SUM(CASE WHEN date >= (CURRENT_DATE - 28)::text THEN order_count ELSE 0 END) / 4.0 as avg_weekly_orders
      FROM daily_sales
    ` as any[];

    // Build the AI prompt
    const currentListText = items.map((i: any) =>
      `  ${i.ingredient_name} | ${i.supplier} | ${i.quantity_needed} | ${i.estimated_cost}${i.package_info ? ` (${i.package_info})` : ""}`
    ).join("\n");

    const prevListText = prevItems.length > 0
      ? prevItems.map((i: any) =>
          `  ${i.ingredient_name} | ${i.supplier} | ${i.quantity_needed} | ${i.estimated_cost}`
        ).join("\n")
      : "No previous list available for comparison.";

    const sales = salesContext[0] || {};

    const systemPrompt = `You are an inventory watchdog for a small cafe/restaurant. Your job is to review a generated shopping list and flag anything that looks wrong, suspicious, or worth double-checking.

You are NOT a suggestion engine. Do NOT:
- Suggest switching suppliers or products (fresh and frozen are DIFFERENT products for DIFFERENT uses)
- Make generic "save money" tips
- Suggest buying in bulk unless they're already buying the item in large quantities
- Give business advice

You ARE a quality checker. DO flag:
- Quantities that seem way off (too high or too low compared to what's normal)
- Items that are usually ordered but are MISSING from this list
- Items that appeared on the previous list but disappeared (did the recipe change or is something broken?)
- Costs that jumped significantly with no clear reason
- Things that mathematically don't add up
- Items where the quantity seems impossible (like 0.15 fl oz of something — that's basically nothing, probably a data issue)

Context about this business:
- Small cafe specializing in acai bowls, smoothies, toast, sandwiches, and specialty coffee
- Orders this week: ${Math.round(sales.orders_this_week || 0)}
- Orders last week: ${Math.round(sales.orders_last_week || 0)}
- Average weekly orders (last 4 weeks): ${Math.round(sales.avg_weekly_orders || 0)}

Respond with a JSON array of flags. Each flag has:
- "type": "warning" (something looks wrong) | "info" (worth noting) | "missing" (expected item not on list)
- "item": the ingredient name (or "General" for overall observations)
- "message": short, plain English explanation (1-2 sentences max, no jargon)

Keep it to the most important flags only (max 8). If the list looks fine, return an empty array [].
Return ONLY valid JSON array, no markdown.`;

    const userPrompt = `CURRENT SHOPPING LIST (based on ${list.based_on_days} days of sales, total: $${Number(list.total_estimated_cost).toFixed(2)}):
${currentListText}

PREVIOUS SHOPPING LIST (for comparison):
${prevListText}

INGREDIENT DATABASE (shows what's tracked — check if anything commonly used is missing):
${ingredientContext.map((i: any) => `  ${i.name} | ${i.supplier} | stock: ${i.current_stock} ${i.unit}`).join("\n")}

Review this shopping list and flag anything that doesn't look right.`;

    const response = await callOpenAIWithRetry((ai) =>
      ai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      })
    );

    const content = response.choices[0]?.message?.content || "[]";
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const flags = JSON.parse(cleaned);

    return NextResponse.json({ flags });
  } catch (error: any) {
    console.error("Shopping list review error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
