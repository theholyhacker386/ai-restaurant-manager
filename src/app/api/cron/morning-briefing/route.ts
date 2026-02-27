import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { EXPENSE_CATEGORIES } from "@/lib/categorize-transactions";
import webpush from "web-push";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Nightly scan — runs after closing every day.
 * Analyzes: sales, labor, expenses, payroll, ingredient burn rate.
 * Generates a morning briefing with a prioritized to-do list.
 *
 * Triggered by Vercel Cron at 11pm ET (after 6pm close + buffer for
 * late data syncs), or can be called manually via POST.
 */

// Verify this is coming from Vercel Cron (production) or allow in dev
function verifyCron(req: Request): boolean {
  // In development, always allow
  if (process.env.NODE_ENV !== "production") return true;
  // Vercel sets this header for cron invocations
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Map category IDs to readable names
function catName(catId: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === catId)?.name || catId;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runNightlyScan();
}

export async function POST(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runNightlyScan();
}

async function runNightlyScan() {
  try {
    const sql = getDb();
    const todayStr = today();
    const yesterdayStr = daysAgo(1);
    const weekAgoStr = daysAgo(7);
    const monthStartStr = monthStart();

    // Ensure briefings table exists (with restaurant_id column)
    await sql`
      CREATE TABLE IF NOT EXISTS morning_briefings (
        id TEXT PRIMARY KEY,
        scan_date TEXT NOT NULL,
        restaurant_id TEXT,
        briefing_data JSONB NOT NULL,
        summary TEXT,
        todo_items JSONB,
        alerts JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Get all active restaurants and process each one
    const restaurants = await sql`SELECT id FROM restaurants WHERE status = 'active'`;

    if (restaurants.length === 0) {
      console.log("[morning-briefing] No active restaurants found");
      return NextResponse.json({ success: true, message: "No active restaurants" });
    }

    const results: Array<{ restaurantId: string; briefing_id: string; alerts_count: number; todos_count: number }> = [];
    let totalPushSent = 0;

    for (const restaurant of restaurants) {
      const restaurantId = restaurant.id;
      console.log(`[morning-briefing] Processing restaurant ${restaurantId}...`);

    // ── 1. YESTERDAY'S SALES ──
    const [yesterdaySales] = (await sql`
      SELECT COALESCE(SUM(net_revenue), 0) as revenue, COALESCE(SUM(order_count), 0) as orders
      FROM daily_sales WHERE date = ${yesterdayStr} AND restaurant_id = ${restaurantId}
    `) as Array<{ revenue: number; orders: number }>;

    // ── 2. THIS WEEK'S SALES (for trend) ──
    const [weekSales] = (await sql`
      SELECT COALESCE(SUM(net_revenue), 0) as revenue, COALESCE(SUM(order_count), 0) as orders,
        COUNT(DISTINCT date) as days_with_sales
      FROM daily_sales WHERE date >= ${weekAgoStr} AND date <= ${todayStr} AND restaurant_id = ${restaurantId}
    `) as Array<{ revenue: number; orders: number; days_with_sales: number }>;

    // ── 3. THIS MONTH'S TOTALS ──
    const [monthSales] = (await sql`
      SELECT COALESCE(SUM(net_revenue), 0) as revenue, COALESCE(SUM(order_count), 0) as orders
      FROM daily_sales WHERE date >= ${monthStartStr} AND date <= ${todayStr} AND restaurant_id = ${restaurantId}
    `) as Array<{ revenue: number; orders: number }>;

    // ── 4. LABOR ANALYSIS (yesterday + this week) ──
    const [yesterdayLabor] = (await sql`
      SELECT COALESCE(SUM(total_pay), 0) as labor_cost, COALESCE(SUM(hours_worked), 0) as hours
      FROM labor_shifts WHERE date = ${yesterdayStr} AND restaurant_id = ${restaurantId}
    `) as Array<{ labor_cost: number; hours: number }>;

    const [weekLabor] = (await sql`
      SELECT COALESCE(SUM(total_pay), 0) as labor_cost, COALESCE(SUM(hours_worked), 0) as hours
      FROM labor_shifts WHERE date >= ${weekAgoStr} AND date <= ${todayStr} AND restaurant_id = ${restaurantId}
    `) as Array<{ labor_cost: number; hours: number }>;

    // ── 5. EXPENSES THIS MONTH ──
    const [monthExpenses] = (await sql`
      SELECT COALESCE(SUM(amount), 0) as total FROM plaid_transactions
      WHERE source = 'statement' AND amount > 0 AND date >= ${monthStartStr} AND date <= ${todayStr}
        AND restaurant_id = ${restaurantId}
    `) as Array<{ total: number }>;

    // ── 6. TOP EXPENSE CATEGORIES THIS MONTH ──
    const topCategories = (await sql`
      SELECT suggested_category_id as cat_id, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
      FROM plaid_transactions
      WHERE source = 'statement' AND amount > 0 AND suggested_category_id IS NOT NULL
        AND date >= ${monthStartStr} AND date <= ${todayStr}
        AND restaurant_id = ${restaurantId}
      GROUP BY suggested_category_id ORDER BY total DESC LIMIT 5
    `) as Array<{ cat_id: string; cnt: number; total: number }>;

    // ── 7. UNCATEGORIZED / NEEDS REVIEW ──
    const [uncategorized] = (await sql`
      SELECT COUNT(*) as cnt FROM plaid_transactions
      WHERE review_status = 'pending' AND amount > 0 AND pending = false
        AND restaurant_id = ${restaurantId}
    `) as Array<{ cnt: number }>;

    const [needsReview] = (await sql`
      SELECT COUNT(*) as cnt FROM plaid_transactions WHERE review_status = 'needs_review'
        AND restaurant_id = ${restaurantId}
    `) as Array<{ cnt: number }>;

    // ── 8. TOP SELLERS THIS WEEK ──
    const topSellers = (await sql`
      SELECT square_item_name as name, SUM(quantity_sold) as qty, SUM(total_revenue) as revenue
      FROM item_sales WHERE date >= ${weekAgoStr} AND date <= ${todayStr}
        AND restaurant_id = ${restaurantId}
      GROUP BY square_item_name ORDER BY revenue DESC LIMIT 5
    `) as Array<{ name: string; qty: number; revenue: number }>;

    // ── 9. MENU ITEMS WITHOUT RECIPES ──
    const [noRecipe] = (await sql`
      SELECT COUNT(*) as cnt FROM menu_items mi
      WHERE mi.is_active = true AND mi.restaurant_id = ${restaurantId}
        AND NOT EXISTS (SELECT 1 FROM recipes r WHERE r.menu_item_id = mi.id)
    `) as Array<{ cnt: number }>;

    // ── 10. INGREDIENT BURN RATE (what's running low based on sales pace) ──
    const ingredientUsage = (await sql`
      SELECT i.name as ingredient, i.supplier,
        SUM(r.quantity * isales.quantity_sold) as weekly_usage,
        i.unit, i.current_stock, i.par_level
      FROM item_sales isales
      JOIN recipes r ON r.menu_item_id = isales.menu_item_id
      JOIN ingredients i ON i.id = r.ingredient_id
      WHERE isales.date >= ${weekAgoStr} AND isales.date <= ${todayStr}
        AND isales.restaurant_id = ${restaurantId}
      GROUP BY i.id, i.name, i.supplier, i.unit, i.current_stock, i.par_level
      ORDER BY weekly_usage DESC
    `) as Array<{
      ingredient: string; supplier: string; weekly_usage: number;
      unit: string; current_stock: number; par_level: number;
    }>;

    // ═══════════════════════════════════════════════════
    // BUILD THE BRIEFING
    // ═══════════════════════════════════════════════════

    const yRevenue = Number(yesterdaySales?.revenue || 0);
    const yOrders = Number(yesterdaySales?.orders || 0);
    const yLaborCost = Number(yesterdayLabor?.labor_cost || 0);
    const yLaborHours = Number(yesterdayLabor?.hours || 0);

    const wRevenue = Number(weekSales?.revenue || 0);
    const wOrders = Number(weekSales?.orders || 0);
    const wDays = Number(weekSales?.days_with_sales || 1);
    const wLaborCost = Number(weekLabor?.labor_cost || 0);

    const mRevenue = Number(monthSales?.revenue || 0);
    const mExpenses = Number(monthExpenses?.total || 0);

    // Calculate key metrics
    const yLaborPct = yRevenue > 0 ? (yLaborCost / yRevenue) * 100 : 0;
    const wLaborPct = wRevenue > 0 ? (wLaborCost / wRevenue) * 100 : 0;
    const dailyAvg = wDays > 0 ? wRevenue / wDays : 0;
    const yRPLH = yLaborHours > 0 ? yRevenue / yLaborHours : 0; // Revenue per labor hour

    // ── ALERTS (things that need attention NOW) ──
    const alerts: Array<{ level: "critical" | "warning" | "info"; message: string }> = [];

    // Labor cost alert
    if (yLaborPct > 35 && yRevenue > 0) {
      alerts.push({
        level: yLaborPct > 40 ? "critical" : "warning",
        message: `Yesterday's labor cost was ${yLaborPct.toFixed(0)}% of revenue ($${yLaborCost.toFixed(0)} labor on $${yRevenue.toFixed(0)} in sales). Target is under 30%.`,
      });
    }

    // Low revenue day
    if (yRevenue > 0 && yRevenue < dailyAvg * 0.7 && dailyAvg > 0) {
      alerts.push({
        level: "warning",
        message: `Yesterday's sales ($${yRevenue.toFixed(0)}) were ${Math.round((1 - yRevenue / dailyAvg) * 100)}% below your daily average ($${dailyAvg.toFixed(0)}).`,
      });
    }

    // Revenue per labor hour too low
    if (yRPLH > 0 && yRPLH < 35) {
      alerts.push({
        level: "warning",
        message: `Revenue per labor hour was $${yRPLH.toFixed(0)} yesterday. Target is $35+. Consider adjusting staffing.`,
      });
    }

    // Month expenses vs revenue
    if (mRevenue > 0 && mExpenses > mRevenue * 0.9) {
      alerts.push({
        level: "critical",
        message: `Monthly expenses ($${mExpenses.toFixed(0)}) are ${Math.round((mExpenses / mRevenue) * 100)}% of revenue ($${mRevenue.toFixed(0)}). Profit margin is dangerously thin.`,
      });
    }

    // Low-stock ingredients (burn rate vs current stock)
    const lowStockItems: string[] = [];
    for (const ing of ingredientUsage) {
      const weeklyUse = Number(ing.weekly_usage);
      const stock = Number(ing.current_stock || 0);
      const parLevel = Number(ing.par_level || 0);

      // If we know current stock and it's below what we use in a week
      if (stock > 0 && weeklyUse > 0 && stock < weeklyUse) {
        const daysLeft = Math.round((stock / weeklyUse) * 7);
        lowStockItems.push(`${ing.ingredient} (~${daysLeft} days left, need to order from ${ing.supplier})`);
        if (daysLeft <= 2) {
          alerts.push({
            level: "critical",
            message: `Running low on ${ing.ingredient} — estimated ${daysLeft} day(s) left based on sales pace. Order from ${ing.supplier} ASAP.`,
          });
        }
      }

      // If below par level
      if (parLevel > 0 && stock > 0 && stock < parLevel) {
        if (!lowStockItems.includes(ing.ingredient)) {
          lowStockItems.push(`${ing.ingredient} (below par level)`);
        }
      }
    }

    // ── TO-DO LIST ──
    const todos: Array<{ priority: "high" | "medium" | "low"; task: string }> = [];

    // Critical alerts become high-priority todos
    for (const alert of alerts.filter((a) => a.level === "critical")) {
      todos.push({ priority: "high", task: alert.message });
    }

    const uncatCount = Number(uncategorized?.cnt || 0);
    const reviewCount = Number(needsReview?.cnt || 0);

    if (reviewCount > 0) {
      todos.push({ priority: "medium", task: `Review and approve ${reviewCount} categorized transactions` });
    }
    if (uncatCount > 0) {
      todos.push({ priority: "medium", task: `${uncatCount} transactions still need categorization` });
    }

    const noRecipeCount = Number(noRecipe?.cnt || 0);
    if (noRecipeCount > 0) {
      todos.push({ priority: "low", task: `${noRecipeCount} menu items need recipes for food cost tracking` });
    }

    if (lowStockItems.length > 0) {
      todos.push({ priority: "high", task: `Order ingredients running low: ${lowStockItems.slice(0, 3).join(", ")}` });
    }

    // Weekly labor check (if it's Sunday or Monday)
    const dayOfWeek = new Date().getDay();
    if ((dayOfWeek === 0 || dayOfWeek === 1) && wLaborPct > 30) {
      todos.push({ priority: "medium", task: `Last week's labor cost was ${wLaborPct.toFixed(0)}% — review schedule for this week` });
    }

    // ── BUILD SUMMARY TEXT ──
    let summary = "";
    if (yRevenue > 0) {
      summary += `Yesterday: $${yRevenue.toFixed(0)} in sales (${yOrders} orders)`;
      if (yLaborCost > 0) summary += `, $${yLaborCost.toFixed(0)} labor (${yLaborPct.toFixed(0)}%)`;
      summary += ". ";
    }
    if (wRevenue > 0) {
      summary += `This week: $${wRevenue.toFixed(0)} total ($${dailyAvg.toFixed(0)}/day avg). `;
    }
    if (alerts.length > 0) {
      summary += `${alerts.length} item${alerts.length > 1 ? "s" : ""} need${alerts.length === 1 ? "s" : ""} attention. `;
    }
    if (todos.length > 0) {
      summary += `${todos.length} to-do${todos.length > 1 ? "s" : ""} for today.`;
    }

    // ── FULL BRIEFING DATA ──
    const briefingData = {
      scan_date: todayStr,
      restaurant_id: restaurantId,
      yesterday: {
        revenue: yRevenue,
        orders: yOrders,
        labor_cost: yLaborCost,
        labor_hours: yLaborHours,
        labor_pct: Math.round(yLaborPct),
        revenue_per_labor_hour: Math.round(yRPLH),
      },
      this_week: {
        revenue: wRevenue,
        orders: wOrders,
        daily_average: Math.round(dailyAvg),
        labor_cost: wLaborCost,
        labor_pct: Math.round(wLaborPct),
      },
      this_month: {
        revenue: mRevenue,
        expenses: mExpenses,
        net: mRevenue - mExpenses,
      },
      top_expense_categories: topCategories.map((c) => ({
        name: catName(c.cat_id),
        count: Number(c.cnt),
        total: Number(c.total),
      })),
      top_sellers: topSellers.map((s) => ({
        name: s.name,
        qty: Number(s.qty),
        revenue: Number(s.revenue),
      })),
      low_stock_ingredients: lowStockItems,
    };

    // ── SAVE TO DATABASE ──
    const briefingId = uuid();
    await sql`
      INSERT INTO morning_briefings (id, scan_date, restaurant_id, briefing_data, summary, todo_items, alerts)
      VALUES (
        ${briefingId},
        ${todayStr},
        ${restaurantId},
        ${JSON.stringify(briefingData)},
        ${summary},
        ${JSON.stringify(todos)},
        ${JSON.stringify(alerts)}
      )
      ON CONFLICT (scan_date) DO UPDATE SET
        briefing_data = EXCLUDED.briefing_data,
        summary = EXCLUDED.summary,
        todo_items = EXCLUDED.todo_items,
        alerts = EXCLUDED.alerts,
        created_at = NOW()
    `;

    console.log(`[morning-briefing] Restaurant ${restaurantId}: ${alerts.length} alerts, ${todos.length} todos`);

    // ── SEND PUSH NOTIFICATIONS ──
    let pushSent = 0;
    try {
      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

      if (vapidPublic && vapidPrivate) {
        webpush.setVapidDetails(`mailto:${process.env.CONTACT_EMAIL || "shopcolby@gmail.com"}`, vapidPublic, vapidPrivate);

        const subscriptions = (await sql`
          SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions
          WHERE restaurant_id = ${restaurantId}
        `) as Array<{ id: string; endpoint: string; keys_p256dh: string; keys_auth: string }>;

        // Build notification message
        const criticalCount = alerts.filter((a: { level: string }) => a.level === "critical").length;
        const notifTitle = criticalCount > 0
          ? `Morning Briefing — ${criticalCount} urgent item${criticalCount > 1 ? "s" : ""}`
          : "Morning Briefing Ready";
        const notifBody = summary || `${todos.length} items on your to-do list for today.`;

        const payload = JSON.stringify({
          title: notifTitle,
          body: notifBody,
          url: "/",
          tag: "morning-briefing",
        });

        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
              payload
            );
            pushSent++;
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`;
            }
          }
        }
        console.log(`[morning-briefing] Restaurant ${restaurantId}: push sent to ${pushSent}/${subscriptions.length} devices`);
      }
    } catch (pushErr) {
      console.error(`[morning-briefing] Restaurant ${restaurantId}: push notification error:`, pushErr);
    }

    results.push({
      restaurantId,
      briefing_id: briefingId,
      alerts_count: alerts.length,
      todos_count: todos.length,
    });
    totalPushSent += pushSent;

    } // end for-each restaurant

    console.log(`[morning-briefing] All done: ${results.length} restaurant(s) processed, ${totalPushSent} push notifications sent`);

    return NextResponse.json({
      success: true,
      restaurants_processed: results.length,
      push_sent: totalPushSent,
      results,
    });
  } catch (error: any) {
    console.error("[morning-briefing] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
