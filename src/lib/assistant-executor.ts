/**
 * Executes AI assistant tool calls against the Neon Postgres database.
 * Uses the neon() serverless driver with tagged template literals.
 */

import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

// Helper: get today's date as YYYY-MM-DD
function today(): string {
  return new Date().toISOString().split("T")[0];
}

// Helper: get first day of current month
function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Helper: fuzzy match a name in a list (case-insensitive, partial match)
function fuzzyFind<T extends { name: string; id: string }>(
  items: T[],
  query: string
): T | undefined {
  const q = query.toLowerCase().trim();
  const exact = items.find((i) => i.name.toLowerCase() === q);
  if (exact) return exact;
  const starts = items.find((i) => i.name.toLowerCase().startsWith(q));
  if (starts) return starts;
  const contains = items.find((i) => i.name.toLowerCase().includes(q));
  if (contains) return contains;
  const reverse = items.find((i) => q.includes(i.name.toLowerCase()));
  if (reverse) return reverse;
  return undefined;
}

/**
 * Execute a tool call and return the result as a JSON-serializable object.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  screenshot?: string | null,
  restaurantId?: string
): Promise<{ success: boolean; data?: unknown; error?: string; actionCard?: ActionCard }> {
  try {
    const sql = getDb();

    switch (toolName) {
      // ── MENU ─────────────────────────────────────────
      case "add_menu_item": {
        const name = args.name as string;
        const selling_price = args.selling_price as number;
        const categoryName = args.category_name as string | undefined;
        const notes = args.notes as string | undefined;

        let category_id: string | null = null;
        if (categoryName) {
          const cats = await sql`SELECT id, name FROM menu_categories WHERE restaurant_id = ${restaurantId}`;
          const match = fuzzyFind(cats as Array<{ id: string; name: string }>, categoryName);
          if (match) {
            category_id = match.id;
          } else {
            category_id = uuid();
            await sql`INSERT INTO menu_categories (id, name, restaurant_id) VALUES (${category_id}, ${categoryName}, ${restaurantId})`;
          }
        }

        const id = uuid();
        await sql`INSERT INTO menu_items (id, name, selling_price, category_id, notes, restaurant_id) VALUES (${id}, ${name}, ${selling_price}, ${category_id}, ${notes || null}, ${restaurantId})`;

        return {
          success: true,
          data: { id, name, selling_price, category: categoryName || null },
          actionCard: {
            type: "success",
            title: "Menu Item Added",
            details: `${name} — $${selling_price.toFixed(2)}`,
            link: `/menu/${id}`,
          },
        };
      }

      case "list_menu_items": {
        const items = await sql`
          SELECT mi.id, mi.name, mi.selling_price, mc.name as category_name,
            COALESCE((SELECT SUM(r.quantity * i.cost_per_unit * (CASE
              WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN 1.0/28.3495
              WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN 1.0/453.592
              WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN 1.0/16.0
              ELSE 1.0 END))
            FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.menu_item_id = mi.id), 0) as food_cost
          FROM menu_items mi
          LEFT JOIN menu_categories mc ON mi.category_id = mc.id
          WHERE mi.is_active = true AND mi.restaurant_id = ${restaurantId}
          ORDER BY mc.sort_order, mi.name`;

        const summary = (items as Array<{ name: string; selling_price: number; food_cost: number; category_name: string | null }>).map((i) => ({
          name: i.name,
          price: `$${Number(i.selling_price).toFixed(2)}`,
          food_cost: `$${Number(i.food_cost).toFixed(2)}`,
          food_cost_pct: Number(i.selling_price) > 0 ? `${((Number(i.food_cost) / Number(i.selling_price)) * 100).toFixed(1)}%` : "N/A",
          category: i.category_name || "Uncategorized",
        }));

        return { success: true, data: { item_count: items.length, items: summary } };
      }

      case "get_menu_item_details": {
        const searchName = args.name as string;
        const allItems = await sql`SELECT id, name, selling_price FROM menu_items WHERE restaurant_id = ${restaurantId}` as Array<{ id: string; name: string; selling_price: number }>;
        const item = fuzzyFind(allItems, searchName);

        if (!item) {
          return { success: false, error: `Couldn't find a menu item matching "${searchName}". Try listing all items to see what's available.` };
        }

        const recipes = await sql`
          SELECT i.name as ingredient, r.quantity, r.quantity_unit,
            (r.quantity * i.cost_per_unit * (CASE
              WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN 1.0/28.3495
              WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN 1.0/453.592
              WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN 1.0/16.0
              ELSE 1.0 END)) as cost
          FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id
          WHERE r.menu_item_id = ${item.id}
          ORDER BY cost DESC` as Array<{ ingredient: string; quantity: number; quantity_unit: string; cost: number }>;

        const totalCost = recipes.reduce((s, r) => s + Number(r.cost), 0);
        const sp = Number(item.selling_price);
        const foodCostPct = sp > 0 ? (totalCost / sp) * 100 : 0;

        return {
          success: true,
          data: {
            name: item.name,
            selling_price: sp,
            total_food_cost: Math.round(totalCost * 100) / 100,
            food_cost_percentage: Math.round(foodCostPct * 10) / 10,
            profit_per_item: Math.round((sp - totalCost) * 100) / 100,
            status: foodCostPct <= 30 ? "healthy" : foodCostPct <= 35 ? "borderline" : "too high",
            recipe_ingredients: recipes.map((r) => ({
              ingredient: r.ingredient,
              quantity: `${r.quantity} ${r.quantity_unit}`,
              cost: `$${Number(r.cost).toFixed(2)}`,
            })),
          },
        };
      }

      case "update_menu_item": {
        const searchName = args.name as string;
        const newName = args.new_name as string | undefined;
        const newPrice = args.new_price as number | undefined;

        const allItems = await sql`SELECT id, name, selling_price FROM menu_items WHERE restaurant_id = ${restaurantId}` as Array<{ id: string; name: string; selling_price: number }>;
        const item = fuzzyFind(allItems, searchName);

        if (!item) {
          return { success: false, error: `Couldn't find a menu item matching "${searchName}".` };
        }

        if (newName) {
          await sql`UPDATE menu_items SET name = ${newName}, updated_at = NOW() WHERE id = ${item.id} AND restaurant_id = ${restaurantId}`;
        }
        if (newPrice !== undefined) {
          await sql`UPDATE menu_items SET selling_price = ${newPrice}, updated_at = NOW() WHERE id = ${item.id} AND restaurant_id = ${restaurantId}`;
        }

        const changes: string[] = [];
        if (newName) changes.push(`name → ${newName}`);
        if (newPrice !== undefined) changes.push(`price → $${newPrice.toFixed(2)}`);

        return {
          success: true,
          data: { id: item.id, old_name: item.name, old_price: item.selling_price, changes },
          actionCard: {
            type: "success",
            title: "Menu Item Updated",
            details: `${item.name}: ${changes.join(", ")}`,
            link: `/menu/${item.id}`,
          },
        };
      }

      // ── INGREDIENTS ──────────────────────────────────
      case "add_ingredient": {
        const name = args.name as string;
        const unit = args.unit as string;
        const packagePrice = args.package_price as number | undefined;
        const packageSize = args.package_size as number | undefined;
        const packageUnit = args.package_unit as string | undefined;
        const supplier = (args.supplier as string) || "Walmart";

        let costPerUnit = 0;
        if (packagePrice && packageSize) {
          costPerUnit = packagePrice / packageSize;
        }

        const id = uuid();
        await sql`INSERT INTO ingredients (id, name, unit, cost_per_unit, package_size, package_unit, package_price, supplier, restaurant_id) VALUES (${id}, ${name}, ${unit}, ${costPerUnit}, ${packageSize || null}, ${packageUnit || unit}, ${packagePrice || null}, ${supplier}, ${restaurantId})`;

        return {
          success: true,
          data: { id, name, unit, cost_per_unit: Math.round(costPerUnit * 100) / 100, supplier },
          actionCard: {
            type: "success",
            title: "Ingredient Added",
            details: `${name} — $${costPerUnit.toFixed(2)}/${unit}`,
            link: `/ingredients/${id}`,
          },
        };
      }

      case "search_ingredients": {
        const query = (args.query as string).toLowerCase();
        const results = await sql`
          SELECT id, name, unit, cost_per_unit, supplier
          FROM ingredients
          WHERE LOWER(name) LIKE ${"%" + query + "%"} AND restaurant_id = ${restaurantId}
          ORDER BY name LIMIT 20` as Array<{ id: string; name: string; unit: string; cost_per_unit: number; supplier: string }>;

        return {
          success: true,
          data: {
            count: results.length,
            ingredients: results.map((r) => ({
              name: r.name,
              cost: `$${Number(r.cost_per_unit).toFixed(2)}/${r.unit}`,
              supplier: r.supplier,
            })),
          },
        };
      }

      // ── RECIPES ──────────────────────────────────────
      case "add_recipe_ingredient": {
        const menuItemName = args.menu_item_name as string;
        const ingredientName = args.ingredient_name as string;
        const quantity = args.quantity as number;
        const quantityUnit = args.quantity_unit as string;

        const allItems = await sql`SELECT id, name FROM menu_items WHERE restaurant_id = ${restaurantId}` as Array<{ id: string; name: string }>;
        const menuItem = fuzzyFind(allItems, menuItemName);
        if (!menuItem) {
          return { success: false, error: `Couldn't find menu item "${menuItemName}". Use list_menu_items to see available items.` };
        }

        const allIngredients = await sql`SELECT id, name FROM ingredients WHERE restaurant_id = ${restaurantId}` as Array<{ id: string; name: string }>;
        const ingredient = fuzzyFind(allIngredients, ingredientName);
        if (!ingredient) {
          return { success: false, error: `Couldn't find ingredient "${ingredientName}". You may need to add it first with add_ingredient.` };
        }

        const id = uuid();
        await sql`INSERT INTO recipes (id, menu_item_id, ingredient_id, quantity, quantity_unit, restaurant_id) VALUES (${id}, ${menuItem.id}, ${ingredient.id}, ${quantity}, ${quantityUnit}, ${restaurantId})`;

        return {
          success: true,
          data: { menu_item: menuItem.name, ingredient: ingredient.name, quantity: `${quantity} ${quantityUnit}` },
          actionCard: {
            type: "success",
            title: "Recipe Updated",
            details: `Added ${quantity} ${quantityUnit} ${ingredient.name} to ${menuItem.name}`,
            link: `/menu/${menuItem.id}/recipe`,
          },
        };
      }

      case "get_recipe": {
        const menuItemName = args.menu_item_name as string;
        const allItems = await sql`SELECT id, name, selling_price FROM menu_items WHERE restaurant_id = ${restaurantId}` as Array<{ id: string; name: string; selling_price: number }>;
        const item = fuzzyFind(allItems, menuItemName);

        if (!item) {
          return { success: false, error: `Couldn't find menu item "${menuItemName}".` };
        }

        const recipes = await sql`
          SELECT i.name, r.quantity, r.quantity_unit,
            (r.quantity * i.cost_per_unit * (CASE
              WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN 1.0/28.3495
              WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN 1.0/453.592
              WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN 1.0/16.0
              ELSE 1.0 END)) as cost
          FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id
          WHERE r.menu_item_id = ${item.id}
          ORDER BY cost DESC` as Array<{ name: string; quantity: number; quantity_unit: string; cost: number }>;

        const totalCost = recipes.reduce((s, r) => s + Number(r.cost), 0);
        const sp = Number(item.selling_price);

        return {
          success: true,
          data: {
            menu_item: item.name,
            selling_price: sp,
            ingredients: recipes.map((r) => ({ name: r.name, quantity: `${r.quantity} ${r.quantity_unit}`, cost: `$${Number(r.cost).toFixed(2)}` })),
            total_food_cost: `$${totalCost.toFixed(2)}`,
            food_cost_pct: `${((totalCost / sp) * 100).toFixed(1)}%`,
            profit: `$${(sp - totalCost).toFixed(2)}`,
          },
        };
      }

      // ── EXPENSES ─────────────────────────────────────
      case "add_expense": {
        const description = args.description as string;
        const amount = args.amount as number;
        const date = (args.date as string) || today();
        const categoryName = args.category_name as string | undefined;

        let categoryId: string | null = null;
        if (categoryName) {
          const cats = await sql`SELECT id, name FROM expense_categories` as Array<{ id: string; name: string }>;
          const match = fuzzyFind(cats, categoryName);
          if (match) categoryId = match.id;
        }

        const id = uuid();
        await sql`INSERT INTO expenses (id, category_id, description, amount, date, source, restaurant_id) VALUES (${id}, ${categoryId}, ${description}, ${amount}, ${date}, 'manual', ${restaurantId})`;

        return {
          success: true,
          data: { id, description, amount, date },
          actionCard: { type: "success", title: "Expense Logged", details: `${description} — $${amount.toFixed(2)} on ${date}`, link: "/expenses" },
        };
      }

      // ── SALES ────────────────────────────────────────
      case "get_sales_summary": {
        const startDate = (args.start_date as string) || monthStart();
        const endDate = (args.end_date as string) || today();

        const [totals] = await sql`
          SELECT COALESCE(SUM(total_revenue), 0) as total_revenue,
            COALESCE(SUM(net_revenue), 0) as net_revenue,
            COALESCE(SUM(total_tips), 0) as tips,
            COALESCE(SUM(order_count), 0) as orders
          FROM daily_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}` as Array<{ total_revenue: number; net_revenue: number; tips: number; orders: number }>;

        const topItems = await sql`
          SELECT square_item_name as name, SUM(quantity_sold) as qty, SUM(total_revenue) as revenue
          FROM item_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}
          GROUP BY square_item_name ORDER BY revenue DESC LIMIT 10` as Array<{ name: string; qty: number; revenue: number }>;

        const rev = Number(totals?.total_revenue || 0);
        const orders = Number(totals?.orders || 0);
        const avgTicket = orders > 0 ? rev / orders : 0;

        return {
          success: true,
          data: {
            period: `${startDate} to ${endDate}`,
            total_revenue: `$${rev.toFixed(2)}`,
            net_revenue: `$${Number(totals?.net_revenue || 0).toFixed(2)}`,
            tips: `$${Number(totals?.tips || 0).toFixed(2)}`,
            total_orders: orders,
            avg_ticket: `$${avgTicket.toFixed(2)}`,
            top_sellers: topItems.map((i) => ({ name: i.name, quantity_sold: Number(i.qty), revenue: `$${Number(i.revenue).toFixed(2)}` })),
          },
        };
      }

      // ── FINANCIAL ANALYSIS ───────────────────────────
      case "get_profit_and_loss": {
        const startDate = (args.start_date as string) || monthStart();
        const endDate = (args.end_date as string) || today();

        const [revenue] = await sql`SELECT COALESCE(SUM(net_revenue), 0) as net FROM daily_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}` as Array<{ net: number }>;
        const [labor] = await sql`SELECT COALESCE(SUM(total_labor_cost), 0) as total FROM daily_labor WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}` as Array<{ total: number }>;
        const [foodCost] = await sql`
          SELECT COALESCE(SUM(isales.quantity_sold * COALESCE(
            (SELECT SUM(r.quantity * i.cost_per_unit)
             FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id
             WHERE r.menu_item_id = isales.menu_item_id), 0)
          ), 0) as cost
          FROM item_sales isales
          WHERE isales.date >= ${startDate} AND isales.date <= ${endDate} AND isales.menu_item_id IS NOT NULL AND isales.restaurant_id = ${restaurantId}` as Array<{ cost: number }>;

        const expenses = await sql`
          SELECT ec.type, COALESCE(SUM(e.amount), 0) as total
          FROM expenses e JOIN expense_categories ec ON e.category_id = ec.id
          WHERE e.date >= ${startDate} AND e.date <= ${endDate} AND e.restaurant_id = ${restaurantId}
          GROUP BY ec.type` as Array<{ type: string; total: number }>;

        const expenseMap = Object.fromEntries(expenses.map((e) => [e.type, Number(e.total)]));
        const totalOverhead = (expenseMap["occupancy"] || 0) + (expenseMap["utilities"] || 0) + (expenseMap["direct_ops"] || 0) + (expenseMap["marketing"] || 0) + (expenseMap["technology"] || 0) + (expenseMap["admin"] || 0) + (expenseMap["repairs"] || 0) + (expenseMap["regulatory"] || 0) + (expenseMap["financial"] || 0) + (expenseMap["other"] || 0);

        const rev = Number(revenue?.net || 0);
        const fc = Number(foodCost?.cost || 0) + (expenseMap["cogs"] || 0);
        const lc = Number(labor?.total || 0) + (expenseMap["labor"] || 0);
        const profit = rev - fc - lc - totalOverhead;
        const pct = (n: number) => (rev > 0 ? ((n / rev) * 100).toFixed(1) : "0.0");

        return {
          success: true,
          data: {
            period: `${startDate} to ${endDate}`,
            revenue: `$${rev.toFixed(2)}`,
            food_cost: `$${fc.toFixed(2)} (${pct(fc)}%)`,
            labor_cost: `$${lc.toFixed(2)} (${pct(lc)}%)`,
            prime_cost: `$${(fc + lc).toFixed(2)} (${pct(fc + lc)}%)`,
            overhead: `$${totalOverhead.toFixed(2)} (${pct(totalOverhead)}%)`,
            net_profit: `$${profit.toFixed(2)} (${pct(profit)}%)`,
            food_cost_status: parseFloat(pct(fc)) <= 30 ? "healthy" : parseFloat(pct(fc)) <= 35 ? "borderline" : "too high",
            labor_status: parseFloat(pct(lc)) <= 30 ? "healthy" : parseFloat(pct(lc)) <= 35 ? "borderline" : "too high",
            prime_cost_status: parseFloat(pct(fc + lc)) <= 60 ? "healthy" : parseFloat(pct(fc + lc)) <= 65 ? "borderline" : "too high",
          },
        };
      }

      case "get_kpis": {
        const startDate = (args.start_date as string) || monthStart();
        const endDate = (args.end_date as string) || today();

        const [rev] = await sql`SELECT COALESCE(SUM(net_revenue), 0) as net, COALESCE(SUM(order_count), 0) as orders FROM daily_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}` as Array<{ net: number; orders: number }>;
        const [labor] = await sql`SELECT COALESCE(SUM(total_labor_cost), 0) as cost, COALESCE(SUM(total_hours), 0) as hours FROM daily_labor WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}` as Array<{ cost: number; hours: number }>;
        const [foodCost] = await sql`
          SELECT COALESCE(SUM(isales.quantity_sold * COALESCE(
            (SELECT SUM(r.quantity * i.cost_per_unit)
             FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id
             WHERE r.menu_item_id = isales.menu_item_id), 0)
          ), 0) as cost
          FROM item_sales isales
          WHERE isales.date >= ${startDate} AND isales.date <= ${endDate} AND isales.menu_item_id IS NOT NULL AND isales.restaurant_id = ${restaurantId}` as Array<{ cost: number }>;

        const netRev = Number(rev?.net || 0);
        const orders = Number(rev?.orders || 0);
        const laborCost = Number(labor?.cost || 0);
        const laborHours = Number(labor?.hours || 0);
        const fc = Number(foodCost?.cost || 0);
        const rplh = laborHours > 0 ? netRev / laborHours : 0;
        const avgTicket = orders > 0 ? netRev / orders : 0;
        const pct = (n: number) => (netRev > 0 ? ((n / netRev) * 100).toFixed(1) : "0.0");

        return {
          success: true,
          data: {
            period: `${startDate} to ${endDate}`,
            revenue: `$${netRev.toFixed(2)}`,
            food_cost_pct: `${pct(fc)}%`,
            labor_cost_pct: `${pct(laborCost)}%`,
            prime_cost_pct: `${pct(fc + laborCost)}%`,
            rplh: `$${rplh.toFixed(2)}`,
            avg_ticket: `$${avgTicket.toFixed(2)}`,
            total_orders: orders,
            total_labor_hours: Math.round(laborHours * 10) / 10,
          },
        };
      }

      case "get_labor_summary": {
        const startDate = (args.start_date as string) || monthStart();
        const endDate = (args.end_date as string) || today();

        const [labor] = await sql`
          SELECT COALESCE(SUM(total_labor_cost), 0) as cost,
            COALESCE(SUM(total_hours), 0) as hours,
            COALESCE(SUM(shift_count), 0) as shifts
          FROM daily_labor WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}` as Array<{ cost: number; hours: number; shifts: number }>;

        const [rev] = await sql`SELECT COALESCE(SUM(net_revenue), 0) as net FROM daily_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}` as Array<{ net: number }>;

        const netRev = Number(rev?.net || 0);
        const laborCost = Number(labor?.cost || 0);
        const laborHours = Number(labor?.hours || 0);
        const laborPct = netRev > 0 ? (laborCost / netRev) * 100 : 0;
        const rplh = laborHours > 0 ? netRev / laborHours : 0;

        return {
          success: true,
          data: {
            period: `${startDate} to ${endDate}`,
            total_labor_cost: `$${laborCost.toFixed(2)}`,
            total_hours: Math.round(laborHours * 10) / 10,
            total_shifts: Number(labor?.shifts || 0),
            labor_as_pct_of_revenue: `${laborPct.toFixed(1)}%`,
            revenue_per_labor_hour: `$${rplh.toFixed(2)}`,
            status: laborPct <= 30 ? "healthy" : laborPct <= 35 ? "borderline" : "too high",
          },
        };
      }

      case "get_business_recommendations": {
        const startDate = monthStart();
        const endDate = today();

        const [rev] = await sql`SELECT COALESCE(SUM(net_revenue), 0) as net FROM daily_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}` as Array<{ net: number }>;

        const highCostItems = await sql`
          SELECT mi.name, mi.selling_price,
            COALESCE((SELECT SUM(r.quantity * i.cost_per_unit * (CASE
              WHEN r.quantity_unit = 'g' AND i.unit = 'oz' THEN 1.0/28.3495
              WHEN r.quantity_unit = 'g' AND i.unit = 'lb' THEN 1.0/453.592
              WHEN r.quantity_unit = 'oz' AND i.unit = 'lb' THEN 1.0/16.0
              ELSE 1.0 END))
            FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.menu_item_id = mi.id), 0) as food_cost
          FROM menu_items mi WHERE mi.is_active = true AND mi.restaurant_id = ${restaurantId}
          ORDER BY food_cost DESC
          LIMIT 20` as Array<{ name: string; selling_price: number; food_cost: number }>;

        const overBudget = highCostItems.filter((i) => {
          const sp = Number(i.selling_price);
          const fc = Number(i.food_cost);
          return fc > 0 && sp > 0 && (fc / sp) > 0.30;
        });

        const topSellers = await sql`
          SELECT square_item_name as name, SUM(quantity_sold) as qty
          FROM item_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}
          GROUP BY square_item_name ORDER BY qty DESC LIMIT 5` as Array<{ name: string; qty: number }>;

        const recommendations: string[] = [];
        overBudget.forEach((item) => {
          const sp = Number(item.selling_price);
          const fc = Number(item.food_cost);
          const pct = ((fc / sp) * 100).toFixed(1);
          const suggested = (fc / 0.3).toFixed(2);
          recommendations.push(
            `${item.name}: food cost is ${pct}% (target: 30%). Consider raising price from $${sp.toFixed(2)} to $${suggested}, or find cheaper ingredients.`
          );
        });

        return {
          success: true,
          data: {
            current_month_revenue: `$${Number(rev?.net || 0).toFixed(2)}`,
            high_food_cost_items: overBudget.length,
            top_sellers: topSellers.map((s) => `${s.name} (${Number(s.qty)} sold)`),
            recommendations: recommendations.length > 0
              ? recommendations
              : ["Your menu items are all within target food cost ranges. Keep tracking your numbers!"],
          },
        };
      }

      // ── HOURLY PROFITABILITY ─────────────────────────
      case "get_hourly_profitability": {
        const startDate = (args.start_date as string) || monthStart();
        const endDate = (args.end_date as string) || today();
        const mode = (args.mode as string) || "average";

        // Call our own API endpoint to get the full hourly analysis
        const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
        const baseUrl = process.env.NEXTAUTH_URL || vercelUrl || "http://localhost:3000";
        const url = `${baseUrl}/api/profitability/hourly?startDate=${startDate}&endDate=${endDate}&mode=${mode}`;

        try {
          const res = await fetch(url);
          if (!res.ok) {
            return { success: false, error: "Failed to fetch hourly profitability data" };
          }
          const hourlyData = await res.json();

          // Build a concise summary for the AI to interpret
          const profitable = hourlyData.hourlyBreakdown?.filter((h: any) => h.profit >= 0) || [];
          const unprofitable = hourlyData.hourlyBreakdown?.filter((h: any) => h.profit < 0) || [];

          return {
            success: true,
            data: {
              period: `${startDate} to ${endDate}`,
              mode,
              summary: hourlyData.summary,
              operating_hours: hourlyData.hourlyBreakdown?.length || 0,
              profitable_hours: profitable.length,
              unprofitable_hours: unprofitable.length,
              fixed_cost_per_hour: `$${hourlyData.fixedCostPerHour?.toFixed(2) || "0.00"}`,
              monthly_fixed_total: `$${hourlyData.monthlyFixedTotal?.toFixed(2) || "0.00"}`,
              weekly_business_hours: hourlyData.weeklyBusinessHours,
              break_even_per_hour: `$${hourlyData.summary?.breakEvenPerHour?.toFixed(2) || "0.00"}`,
              hourly_detail: hourlyData.hourlyBreakdown?.map((h: any) => ({
                hour: h.hourLabel,
                revenue: `$${h.revenue.toFixed(2)}`,
                labor: `$${h.laborCost.toFixed(2)}`,
                fixed: `$${h.fixedCost.toFixed(2)}`,
                profit: `${h.profit >= 0 ? "+" : ""}$${h.profit.toFixed(2)}`,
                orders: h.orderCount,
              })),
              needs_review: hourlyData.needsReview?.map((r: any) => r.message) || [],
              active_employees: hourlyData.activeEmployees || [],
              fixed_cost_breakdown: hourlyData.fixedCostBreakdown?.map((c: any) => ({
                name: c.name,
                per_hour: `$${c.hourlyAmount.toFixed(2)}`,
                per_month: `$${c.monthlyAmount.toFixed(2)}`,
              })),
            },
          };
        } catch (err) {
          return { success: false, error: `Could not reach hourly profitability API: ${err}` };
        }
      }

      // ── AI BRAIN — BUSINESS STATUS ────────────────────
      case "get_business_status": {
        const startDate = monthStart();
        const endDate = today();

        // 0. Check for latest morning briefing (nightly scan)
        let morningBriefing: { summary: string; todo_items: unknown; alerts: unknown; scan_date: string } | null = null;
        try {
          const briefings = await sql`
            SELECT summary, todo_items, alerts, scan_date
            FROM morning_briefings
            WHERE restaurant_id = ${restaurantId}
            ORDER BY created_at DESC LIMIT 1
          ` as Array<{ summary: string; todo_items: unknown; alerts: unknown; scan_date: string }>;
          if (briefings.length > 0) morningBriefing = briefings[0];
        } catch {
          // Table may not exist yet — that's fine
        }

        // 1. Uncategorized transactions
        const [uncategorized] = await sql`
          SELECT COUNT(*) as cnt FROM plaid_transactions
          WHERE review_status = 'pending' AND amount > 0 AND pending = false AND restaurant_id = ${restaurantId}
        ` as Array<{ cnt: number }>;

        const [needsReview] = await sql`
          SELECT COUNT(*) as cnt FROM plaid_transactions
          WHERE review_status = 'needs_review' AND restaurant_id = ${restaurantId}
        ` as Array<{ cnt: number }>;

        // 2. Statement processing status
        const stmtStatus = await sql`
          SELECT status, COUNT(*) as cnt FROM bank_statements
          WHERE restaurant_id = ${restaurantId}
          GROUP BY status
        ` as Array<{ status: string; cnt: number }>;

        // 3. Income this month
        const [income] = await sql`
          SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM plaid_transactions
          WHERE source = 'statement' AND amount < 0 AND date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}
        ` as Array<{ total: number }>;

        // 4. Expenses this month (from categorized transactions)
        const [expenses] = await sql`
          SELECT COALESCE(SUM(amount), 0) as total FROM plaid_transactions
          WHERE source = 'statement' AND amount > 0 AND date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}
        ` as Array<{ total: number }>;

        // 5. Top expense categories
        const topCategories = await sql`
          SELECT suggested_category_id as cat_id, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
          FROM plaid_transactions
          WHERE source = 'statement' AND amount > 0 AND suggested_category_id IS NOT NULL
            AND date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}
          GROUP BY suggested_category_id
          ORDER BY total DESC LIMIT 5
        ` as Array<{ cat_id: string; cnt: number; total: number }>;

        // 6. Sales this month
        const [sales] = await sql`
          SELECT COALESCE(SUM(net_revenue), 0) as revenue, COALESCE(SUM(order_count), 0) as orders
          FROM daily_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}
        ` as Array<{ revenue: number; orders: number }>;

        // 7. Top sellers this month
        const topSellers = await sql`
          SELECT square_item_name as name, SUM(quantity_sold) as qty, SUM(total_revenue) as revenue
          FROM item_sales WHERE date >= ${startDate} AND date <= ${endDate} AND restaurant_id = ${restaurantId}
          GROUP BY square_item_name ORDER BY revenue DESC LIMIT 5
        ` as Array<{ name: string; qty: number; revenue: number }>;

        // 8. Menu items without recipes
        const [noRecipe] = await sql`
          SELECT COUNT(*) as cnt FROM menu_items mi
          WHERE mi.is_active = true AND mi.restaurant_id = ${restaurantId} AND NOT EXISTS (SELECT 1 FROM recipes r WHERE r.menu_item_id = mi.id)
        ` as Array<{ cnt: number }>;

        // Build to-do list
        const todos: string[] = [];
        const uncatCount = Number(uncategorized?.cnt || 0);
        const reviewCount = Number(needsReview?.cnt || 0);
        if (uncatCount > 0) todos.push(`${uncatCount} transactions need categorization`);
        if (reviewCount > 0) todos.push(`${reviewCount} categorized transactions need your approval`);
        const noRecipeCount = Number(noRecipe?.cnt || 0);
        if (noRecipeCount > 0) todos.push(`${noRecipeCount} menu items don't have recipes yet (needed for food cost tracking)`);

        const stmtMap = Object.fromEntries(stmtStatus.map((s) => [s.status, Number(s.cnt)]));
        if (stmtMap["queued"] || stmtMap["processing"]) {
          todos.push(`${(stmtMap["queued"] || 0) + (stmtMap["processing"] || 0)} bank statements still processing`);
        }
        if (stmtMap["error"]) {
          todos.push(`${stmtMap["error"]} bank statements had errors — may need re-upload`);
        }

        const monthRevenue = Number(sales?.revenue || 0);
        const monthIncome = Number(income?.total || 0);
        const monthExpenses = Number(expenses?.total || 0);

        return {
          success: true,
          data: {
            period: `${startDate} to ${endDate}`,
            square_revenue: `$${monthRevenue.toFixed(2)}`,
            square_orders: Number(sales?.orders || 0),
            bank_income: `$${monthIncome.toFixed(2)}`,
            bank_expenses: `$${monthExpenses.toFixed(2)}`,
            top_expense_categories: topCategories.map((c) => ({
              category: c.cat_id,
              transaction_count: Number(c.cnt),
              total: `$${Number(c.total).toFixed(2)}`,
            })),
            top_sellers: topSellers.map((s) => ({
              name: s.name,
              qty: Number(s.qty),
              revenue: `$${Number(s.revenue).toFixed(2)}`,
            })),
            statements_uploaded: stmtMap,
            action_items: todos,
            menu_items_without_recipes: noRecipeCount,
            morning_briefing: morningBriefing ? {
              scan_date: morningBriefing.scan_date,
              summary: morningBriefing.summary,
              alerts: morningBriefing.alerts,
              todos: morningBriefing.todo_items,
            } : null,
          },
        };
      }

      // ── SHOPPING LIST ─────────────────────────────────
      case "generate_shopping_list": {
        const days = (args.days as number) || 7;
        const multiplier = (args.multiplier as number) || 1.0;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startStr = startDate.toISOString().split("T")[0];
        const endStr = today();

        // Get sales per menu item in the period
        const itemSales = await sql`
          SELECT menu_item_id, square_item_name as name, SUM(quantity_sold) as qty
          FROM item_sales
          WHERE date >= ${startStr} AND date <= ${endStr} AND menu_item_id IS NOT NULL AND restaurant_id = ${restaurantId}
          GROUP BY menu_item_id, square_item_name
        ` as Array<{ menu_item_id: string; name: string; qty: number }>;

        if (itemSales.length === 0) {
          return {
            success: true,
            data: {
              message: "No sales data found for this period. Make sure Square sales are synced.",
              items: [],
            },
          };
        }

        // For each sold item, calculate ingredient usage from recipes
        const ingredientNeeds = new Map<string, {
          name: string;
          unit: string;
          totalQty: number;
          supplier: string;
          costPerUnit: number;
          packageSize: number | null;
          packageUnit: string | null;
          packagePrice: number | null;
          currentStock: number;
          parLevel: number;
        }>();

        // Helper: add an ingredient need (accumulates if already seen)
        function addNeed(id: string, name: string, unit: string, qty: number, supplier: string,
          costPerUnit: number, packageSize: number | null, packageUnit: string | null,
          packagePrice: number | null, currentStock: number, parLevel: number) {
          const existing = ingredientNeeds.get(id);
          if (existing) {
            existing.totalQty += qty;
          } else {
            ingredientNeeds.set(id, {
              name, unit, totalQty: qty, supplier: supplier || "Unknown",
              costPerUnit, packageSize, packageUnit, packagePrice, currentStock, parLevel,
            });
          }
        }

        for (const sale of itemSales) {
          const recipes = await sql`
            SELECT i.id, i.name, i.unit, i.cost_per_unit, i.supplier,
              i.package_size, i.package_unit, i.package_price,
              i.current_stock, i.par_level,
              r.quantity, r.quantity_unit
            FROM recipes r
            JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.menu_item_id = ${sale.menu_item_id}
          ` as Array<{
            id: string; name: string; unit: string; cost_per_unit: number; supplier: string;
            package_size: number | null; package_unit: string | null; package_price: number | null;
            current_stock: number; par_level: number;
            quantity: number; quantity_unit: string;
          }>;

          for (const recipe of recipes) {
            const qtyNeeded = Number(recipe.quantity) * Number(sale.qty);

            // Skip "Homemade" ingredients — drill into their sub-recipe instead
            if (recipe.supplier === "Homemade") {
              const subIngredients = await sql`
                SELECT ci.id, ci.name, ci.unit, ci.cost_per_unit, ci.supplier,
                  ci.package_size, ci.package_unit, ci.package_price,
                  ci.current_stock, ci.par_level,
                  sri.quantity, sri.quantity_unit
                FROM sub_recipe_ingredients sri
                JOIN ingredients ci ON sri.child_ingredient_id = ci.id
                WHERE sri.parent_ingredient_id = ${recipe.id}
              ` as Array<{
                id: string; name: string; unit: string; cost_per_unit: number; supplier: string;
                package_size: number | null; package_unit: string | null; package_price: number | null;
                current_stock: number; par_level: number;
                quantity: number; quantity_unit: string;
              }>;

              if (subIngredients.length > 0) {
                for (const sub of subIngredients) {
                  const subQty = Number(sub.quantity) * qtyNeeded;
                  addNeed(sub.id, sub.name, sub.quantity_unit || sub.unit, subQty,
                    sub.supplier, Number(sub.cost_per_unit),
                    sub.package_size, sub.package_unit, sub.package_price,
                    Number(sub.current_stock || 0), Number(sub.par_level || 0));
                }
              }
              continue;
            }

            addNeed(recipe.id, recipe.name, recipe.quantity_unit || recipe.unit, qtyNeeded,
              recipe.supplier, Number(recipe.cost_per_unit),
              recipe.package_size, recipe.package_unit, recipe.package_price,
              Number(recipe.current_stock || 0), Number(recipe.par_level || 0));
          }
        }

        // Build shopping list grouped by supplier
        const supplierGroups = new Map<string, Array<{
          ingredient: string;
          quantityNeeded: string;
          estimatedCost: string;
          packagesToBuy: number | null;
          packageInfo: string | null;
        }>>();

        let totalEstCost = 0;

        for (const [, need] of ingredientNeeds) {
          const adjustedQty = need.totalQty * multiplier;
          const supplier = need.supplier || "Other";

          let packagesToBuy: number | null = null;
          let packageInfo: string | null = null;
          let estCost = adjustedQty * need.costPerUnit;

          if (need.packageSize && need.packagePrice) {
            packagesToBuy = Math.ceil(adjustedQty / need.packageSize);
            estCost = packagesToBuy * need.packagePrice;
            packageInfo = `${need.packageSize} ${need.packageUnit || need.unit} for $${need.packagePrice.toFixed(2)}`;
          }

          totalEstCost += estCost;

          if (!supplierGroups.has(supplier)) {
            supplierGroups.set(supplier, []);
          }
          supplierGroups.get(supplier)!.push({
            ingredient: need.name,
            quantityNeeded: `${Math.round(adjustedQty * 100) / 100} ${need.unit}`,
            estimatedCost: `$${estCost.toFixed(2)}`,
            packagesToBuy,
            packageInfo,
          });
        }

        // Save to database
        const listId = uuid();
        await sql`
          INSERT INTO shopping_lists (id, name, based_on_days, multiplier, total_estimated_cost, status, restaurant_id)
          VALUES (${listId}, ${"Shopping List — " + endStr}, ${days}, ${multiplier}, ${totalEstCost}, 'draft', ${restaurantId})
        `;

        for (const [supplier, items] of supplierGroups) {
          for (const item of items) {
            await sql`
              INSERT INTO shopping_list_items (id, shopping_list_id, ingredient_name, supplier, quantity_needed, estimated_cost, packages_to_buy, package_info, restaurant_id)
              VALUES (${uuid()}, ${listId}, ${item.ingredient}, ${supplier}, ${item.quantityNeeded}, ${item.estimatedCost}, ${item.packagesToBuy}, ${item.packageInfo}, ${restaurantId})
            `;
          }
        }

        // Format response
        const bySupplier: Record<string, unknown[]> = {};
        for (const [supplier, items] of supplierGroups) {
          bySupplier[supplier] = items.sort((a, b) =>
            parseFloat(b.estimatedCost.replace("$", "")) - parseFloat(a.estimatedCost.replace("$", ""))
          );
        }

        return {
          success: true,
          data: {
            list_id: listId,
            based_on: `${days} days of sales (${startStr} to ${endStr})`,
            multiplier: multiplier === 1.0 ? "1x (exact need)" : `${multiplier}x`,
            total_estimated_cost: `$${totalEstCost.toFixed(2)}`,
            total_ingredients: ingredientNeeds.size,
            by_supplier: bySupplier,
            top_selling_items: itemSales
              .sort((a, b) => Number(b.qty) - Number(a.qty))
              .slice(0, 5)
              .map((s) => `${s.name} (${Number(s.qty)} sold)`),
          },
          actionCard: {
            type: "success",
            title: "Shopping List Generated",
            details: `${ingredientNeeds.size} ingredients, ~$${totalEstCost.toFixed(2)} total`,
            link: `/shopping`,
          },
        };
      }

      case "get_shopping_lists": {
        const limit = (args.limit as number) || 5;
        const lists = await sql`
          SELECT id, name, based_on_days, multiplier, total_estimated_cost, status, created_at
          FROM shopping_lists
          WHERE restaurant_id = ${restaurantId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        ` as Array<{ id: string; name: string; based_on_days: number; multiplier: number; total_estimated_cost: number; status: string; created_at: string }>;

        const result = [];
        for (const list of lists) {
          const items = await sql`
            SELECT supplier, COUNT(*) as item_count, COALESCE(SUM(CAST(REPLACE(estimated_cost, '$', '') AS NUMERIC)), 0) as subtotal
            FROM shopping_list_items
            WHERE shopping_list_id = ${list.id}
            GROUP BY supplier
            ORDER BY subtotal DESC
          ` as Array<{ supplier: string; item_count: number; subtotal: number }>;

          result.push({
            id: list.id,
            name: list.name,
            date: list.created_at,
            status: list.status,
            total: `$${Number(list.total_estimated_cost).toFixed(2)}`,
            suppliers: items.map((i) => ({
              name: i.supplier,
              items: Number(i.item_count),
              subtotal: `$${Number(i.subtotal).toFixed(2)}`,
            })),
          });
        }

        return { success: true, data: { lists: result } };
      }

      // ── INVENTORY & STOCK ─────────────────────────────
      case "inventory_check": {
        const supplier = args.supplier as string | undefined;

        let items;
        if (supplier) {
          items = await sql`
            SELECT id, name, unit, supplier, current_stock, par_level, reorder_point,
              package_size, package_unit, package_price
            FROM ingredients
            WHERE LOWER(supplier) = LOWER(${supplier}) AND restaurant_id = ${restaurantId}
            ORDER BY name
          ` as Array<{
            id: string; name: string; unit: string; supplier: string;
            current_stock: number; par_level: number; reorder_point: number;
            package_size: number | null; package_unit: string | null; package_price: number | null;
          }>;
        } else {
          // Return items that have reorder tracking (reorder_point > 0) or all items with stock data
          items = await sql`
            SELECT id, name, unit, supplier, current_stock, par_level, reorder_point,
              package_size, package_unit, package_price
            FROM ingredients
            WHERE (reorder_point > 0 OR current_stock > 0) AND restaurant_id = ${restaurantId}
            ORDER BY supplier, name
          ` as Array<{
            id: string; name: string; unit: string; supplier: string;
            current_stock: number; par_level: number; reorder_point: number;
            package_size: number | null; package_unit: string | null; package_price: number | null;
          }>;
        }

        const formatted = items.map((i) => {
          const stock = Number(i.current_stock || 0);
          const reorder = Number(i.reorder_point || 0);
          const isLow = reorder > 0 && stock <= reorder;
          // Help the AI understand package sizes for unit conversion
          let packageHint = "";
          if (i.package_size && i.package_unit) {
            packageHint = `${i.package_size} ${i.unit} per ${i.package_unit}`;
          }
          return {
            name: i.name,
            unit: i.unit,
            supplier: i.supplier,
            current_stock: stock,
            reorder_point: reorder,
            status: isLow ? "LOW" : stock === 0 ? "NOT COUNTED" : "OK",
            package_info: packageHint || null,
          };
        });

        const lowCount = formatted.filter((i) => i.status === "LOW").length;
        const uncounted = formatted.filter((i) => i.status === "NOT COUNTED").length;

        return {
          success: true,
          data: {
            total_items: formatted.length,
            low_stock: lowCount,
            not_counted: uncounted,
            supplier: supplier || "all",
            items: formatted,
            unit_conversion_hints: {
              sleeve: "A sleeve of cups is typically 25-50 cups depending on the size. For standard cold cups, assume 50 per sleeve. For hot cups, assume 25 per sleeve.",
              case: "Refer to each item's package_info for how many units per case.",
              half_case: "Half the package_size value.",
              box: "Usually same as a case — check the package_info.",
            },
          },
        };
      }

      case "update_stock": {
        const ingredientName = args.ingredient_name as string;
        const quantity = args.quantity as number;
        const reorderPoint = args.reorder_point as number | undefined;
        const parLevel = args.par_level as number | undefined;

        const allIngredients = await sql`SELECT id, name FROM ingredients WHERE restaurant_id = ${restaurantId}` as Array<{ id: string; name: string }>;
        const ingredient = fuzzyFind(allIngredients, ingredientName);

        if (!ingredient) {
          return { success: false, error: `Couldn't find ingredient "${ingredientName}". Try searching first.` };
        }

        // Build update based on what's provided
        if (reorderPoint !== undefined && parLevel !== undefined) {
          await sql`UPDATE ingredients SET current_stock = ${quantity}, reorder_point = ${reorderPoint}, par_level = ${parLevel}, stock_counted_at = NOW(), updated_at = NOW() WHERE id = ${ingredient.id} AND restaurant_id = ${restaurantId}`;
        } else if (reorderPoint !== undefined) {
          await sql`UPDATE ingredients SET current_stock = ${quantity}, reorder_point = ${reorderPoint}, stock_counted_at = NOW(), updated_at = NOW() WHERE id = ${ingredient.id} AND restaurant_id = ${restaurantId}`;
        } else if (parLevel !== undefined) {
          await sql`UPDATE ingredients SET current_stock = ${quantity}, par_level = ${parLevel}, stock_counted_at = NOW(), updated_at = NOW() WHERE id = ${ingredient.id} AND restaurant_id = ${restaurantId}`;
        } else {
          await sql`UPDATE ingredients SET current_stock = ${quantity}, stock_counted_at = NOW(), updated_at = NOW() WHERE id = ${ingredient.id} AND restaurant_id = ${restaurantId}`;
        }

        // Check if this is now low stock
        const [updated] = await sql`SELECT current_stock, reorder_point, par_level FROM ingredients WHERE id = ${ingredient.id} AND restaurant_id = ${restaurantId}` as Array<{ current_stock: number; reorder_point: number; par_level: number }>;
        const isLow = Number(updated.reorder_point) > 0 && quantity <= Number(updated.reorder_point);

        return {
          success: true,
          data: {
            name: ingredient.name,
            new_stock: quantity,
            par_level: Number(updated.par_level) || null,
            reorder_point: Number(updated.reorder_point),
            status: isLow ? "LOW — needs reorder!" : "OK",
          },
          actionCard: {
            type: isLow ? "warning" : "success",
            title: isLow ? "Low Stock Alert" : "Stock Updated",
            details: `${ingredient.name}: ${quantity} on hand${Number(updated.par_level) > 0 ? ` (par: ${updated.par_level})` : ""}${isLow ? " — below reorder point!" : ""}`,
            link: "/inventory-usage",
          },
        };
      }

      case "get_low_stock_alerts": {
        const supplier = args.supplier as string | undefined;

        let lowItems;
        if (supplier) {
          lowItems = await sql`
            SELECT name, unit, supplier, current_stock, reorder_point, package_size, package_unit, package_price
            FROM ingredients
            WHERE reorder_point > 0 AND current_stock <= reorder_point AND LOWER(supplier) = LOWER(${supplier}) AND restaurant_id = ${restaurantId}
            ORDER BY (current_stock::float / NULLIF(reorder_point, 0)) ASC, name
          ` as Array<{
            name: string; unit: string; supplier: string; current_stock: number;
            reorder_point: number; package_size: number | null; package_unit: string | null; package_price: number | null;
          }>;
        } else {
          lowItems = await sql`
            SELECT name, unit, supplier, current_stock, reorder_point, package_size, package_unit, package_price
            FROM ingredients
            WHERE reorder_point > 0 AND current_stock <= reorder_point AND restaurant_id = ${restaurantId}
            ORDER BY (current_stock::float / NULLIF(reorder_point, 0)) ASC, name
          ` as Array<{
            name: string; unit: string; supplier: string; current_stock: number;
            reorder_point: number; package_size: number | null; package_unit: string | null; package_price: number | null;
          }>;
        }

        const alerts = lowItems.map((i) => {
          const stock = Number(i.current_stock);
          const reorder = Number(i.reorder_point);
          const casesToOrder = i.package_size && i.package_size > 0
            ? Math.ceil((reorder - stock) / i.package_size)
            : null;
          return {
            name: i.name,
            supplier: i.supplier,
            on_hand: `${stock} ${i.unit}`,
            reorder_point: `${reorder} ${i.unit}`,
            urgency: stock === 0 ? "OUT OF STOCK" : stock <= reorder * 0.5 ? "CRITICAL" : "LOW",
            suggested_order: casesToOrder && i.package_unit
              ? `${casesToOrder} ${i.package_unit}${casesToOrder > 1 ? "s" : ""} (~$${((casesToOrder) * Number(i.package_price || 0)).toFixed(2)})`
              : null,
          };
        });

        return {
          success: true,
          data: {
            total_alerts: alerts.length,
            alerts,
            message: alerts.length === 0
              ? "All stocked items are above their reorder points. Looking good!"
              : `${alerts.length} item${alerts.length > 1 ? "s" : ""} need${alerts.length === 1 ? "s" : ""} attention.`,
          },
        };
      }

      // ── ESCALATION ────────────────────────────────────
      case "escalate_to_owner": {
        const summary = args.summary as string;
        const priority = (args.priority as string) || "normal";

        // Flag the most recent unreviewed conversation for owner review
        const updated = await sql`
          UPDATE chat_conversations
          SET review_notes = ${`[${priority.toUpperCase()}] ${summary}`},
              reviewed = false
          WHERE id = (
            SELECT id FROM chat_conversations
            WHERE (reviewed = false OR reviewed IS NULL) AND restaurant_id = ${restaurantId}
            ORDER BY last_message_at DESC
            LIMIT 1
          )
          RETURNING id
        `;

        if (updated.length === 0) {
          return {
            success: true,
            data: { message: "Message noted! The owner will see this in their next review." },
            actionCard: {
              type: "info",
              title: "Flagged for Owner",
              details: summary,
            },
          };
        }

        return {
          success: true,
          data: { message: "Got it! I've flagged this conversation for the owner to review.", conversation_id: updated[0].id },
          actionCard: {
            type: "info",
            title: "Sent to Owner",
            details: summary,
          },
        };
      }

      // ── ISSUE REPORTING ───────────────────────────────
      case "report_issue": {
        const summary = args.summary as string;
        const pageUrl = (args.page_url as string) || "unknown";
        const expectedBehavior = (args.expected_behavior as string) || "";
        const actualBehavior = args.actual_behavior as string;
        const stepsToReproduce = (args.steps_to_reproduce as string) || "";
        const severity = (args.severity as string) || "minor";
        const deviceInfo = (args.device_info as string) || "";
        const viewport = (args.viewport as string) || "";
        const additionalContext = (args.additional_context as string) || "";

        // Build a payload matching the UX widget format for consistency
        const payload = {
          version: "ai-assistant-1.0",
          source: "ai_assistant",
          exportedAt: new Date().toISOString(),
          project: "AI Restaurant Manager",
          originUrl: pageUrl,
          totalComments: 1,
          comments: [
            {
              id: `ai-${Date.now().toString(36)}`,
              text: summary,
              severity,
              expected_behavior: expectedBehavior,
              actual_behavior: actualBehavior,
              steps_to_reproduce: stepsToReproduce,
              device_info: deviceInfo,
              viewport_info: viewport,
              additional_context: additionalContext,
              url: pageUrl,
              pageTitle: "",
              timestamp: new Date().toISOString(),
              captures: screenshot ? [{ type: "screenshot", dataUrl: screenshot }] : [],
            },
          ],
          receivedAt: new Date().toISOString(),
        };

        await sql`INSERT INTO ux_comments (payload) VALUES (${JSON.stringify(payload)}::jsonb)`;

        const severityLabels: Record<string, string> = {
          critical: "Critical Bug",
          major: "Major Issue",
          minor: "Minor Issue",
          suggestion: "Suggestion",
        };

        return {
          success: true,
          data: { summary, severity, page: pageUrl },
          actionCard: {
            type: severity === "critical" || severity === "major" ? "warning" : "info",
            title: `${severityLabels[severity] || "Issue"} Reported`,
            details: summary,
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Tool execution error (${toolName}):`, message);
    return { success: false, error: `Something went wrong: ${message}` };
  }
}

/** Shape of action cards sent to the UI */
export interface ActionCard {
  type: "success" | "info" | "warning";
  title: string;
  details: string;
  link?: string;
}
