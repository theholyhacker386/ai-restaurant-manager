import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { squareApiCall, getSquareToken, linkSquareToken } from "@/lib/square";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/square/sync
 * Syncs orders, sales, and labor data from Square for a restaurant.
 * Can be called manually or by a cron job.
 *
 * Body: { restaurantId?: string, days?: number }
 * - days: how many days back to sync (default 7)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const days = body.days || 7;
    let restaurantId = body.restaurantId;

    const sql = neon(process.env.NEON_DATABASE_URL!);

    // If no restaurantId provided, find restaurants with Square tokens
    if (!restaurantId) {
      // Try linked tokens first
      const linked = await sql`SELECT DISTINCT restaurant_id FROM square_tokens LIMIT 1`;
      if (linked.length > 0) {
        restaurantId = linked[0].restaurant_id;
      } else {
        // Try to auto-link pending tokens to the first restaurant
        const pending = await sql`SELECT id FROM pending_square_tokens LIMIT 1`;
        if (pending.length > 0) {
          const restaurants = await sql`SELECT id FROM restaurants LIMIT 1`;
          if (restaurants.length > 0) {
            await linkSquareToken(restaurants[0].id);
            restaurantId = restaurants[0].id;
          }
        }
      }
    }

    if (!restaurantId) {
      return NextResponse.json({ error: "No restaurant with Square connected" }, { status: 404 });
    }

    // Verify we have a token
    const token = await getSquareToken(restaurantId);
    if (!token) {
      return NextResponse.json({ error: "No Square token found" }, { status: 404 });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startStr = startDate.toISOString();
    const endStr = endDate.toISOString();

    // Ensure tables exist
    await ensureSquareTables(sql, restaurantId);

    // 1. Sync orders and daily sales
    const orderResults = await syncOrders(sql, restaurantId, startStr, endStr);

    // 2. Sync location info (business hours, address)
    const locationInfo = await syncLocation(sql, restaurantId);

    // 3. Sync labor/timecards
    const laborResults = await syncLabor(sql, restaurantId, startStr, endStr);

    return NextResponse.json({
      success: true,
      restaurant_id: restaurantId,
      synced: {
        orders: orderResults.orderCount,
        dailySales: orderResults.daysProcessed,
        itemSales: orderResults.itemCount,
        labor: laborResults.timecardCount,
        location: locationInfo ? "synced" : "skipped",
      },
    });
  } catch (error: any) {
    console.error("Square sync error:", error);
    return NextResponse.json(
      { error: error.message || "Square sync failed" },
      { status: 500 }
    );
  }
}

/**
 * Create the tables we need for Square data if they don't exist
 */
async function ensureSquareTables(sql: any, restaurantId: string) {
  await sql`
    CREATE TABLE IF NOT EXISTS square_tokens (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      merchant_id TEXT,
      expires_at TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_sales (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      date DATE NOT NULL,
      total_revenue NUMERIC DEFAULT 0,
      total_tax NUMERIC DEFAULT 0,
      total_tips NUMERIC DEFAULT 0,
      total_discounts NUMERIC DEFAULT 0,
      net_revenue NUMERIC DEFAULT 0,
      order_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(restaurant_id, date)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS item_sales (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      date DATE NOT NULL,
      square_item_name TEXT,
      menu_item_id TEXT,
      quantity_sold NUMERIC DEFAULT 0,
      total_revenue NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_labor (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      date DATE NOT NULL,
      total_labor_cost NUMERIC DEFAULT 0,
      total_hours NUMERIC DEFAULT 0,
      employee_count INTEGER DEFAULT 0,
      from_square BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(restaurant_id, date)
    )
  `;
}

/**
 * Sync orders from Square and calculate daily sales + item sales
 */
async function syncOrders(sql: any, restaurantId: string, startAt: string, endAt: string) {
  let orderCount = 0;
  let itemCount = 0;
  const dailyTotals: Record<string, {
    revenue: number;
    tax: number;
    tips: number;
    discounts: number;
    orders: number;
  }> = {};
  const itemTotals: Record<string, Record<string, { qty: number; revenue: number }>> = {};

  let cursor: string | null = null;

  // Paginate through all orders
  do {
    const body: any = {
      location_ids: await getLocationIds(restaurantId),
      query: {
        filter: {
          date_time_filter: {
            created_at: {
              start_at: startAt,
              end_at: endAt,
            },
          },
          state_filter: { states: ["COMPLETED"] },
        },
        sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
      },
      limit: 100,
    };

    if (cursor) body.cursor = cursor;

    let data: any;
    try {
      data = await squareApiCall(restaurantId, "/orders/search", { method: "POST", body });
    } catch (err: any) {
      console.error("Square orders search error:", err.message);
      break;
    }

    const orders = data.orders || [];
    cursor = data.cursor || null;

    for (const order of orders) {
      orderCount++;
      const dateStr = (order.created_at || "").split("T")[0];
      if (!dateStr) continue;

      // Calculate order totals (Square amounts are in cents)
      const totalMoney = Number(order.total_money?.amount || 0) / 100;
      const taxMoney = Number(order.total_tax_money?.amount || 0) / 100;
      const tipMoney = Number(order.total_tip_money?.amount || 0) / 100;
      const discountMoney = Number(order.total_discount_money?.amount || 0) / 100;

      if (!dailyTotals[dateStr]) {
        dailyTotals[dateStr] = { revenue: 0, tax: 0, tips: 0, discounts: 0, orders: 0 };
      }
      dailyTotals[dateStr].revenue += totalMoney;
      dailyTotals[dateStr].tax += taxMoney;
      dailyTotals[dateStr].tips += tipMoney;
      dailyTotals[dateStr].discounts += discountMoney;
      dailyTotals[dateStr].orders += 1;

      // Item-level sales
      if (!itemTotals[dateStr]) itemTotals[dateStr] = {};
      for (const item of order.line_items || []) {
        const itemName = item.name || "Unknown Item";
        const qty = Number(item.quantity || 1);
        const itemRevenue = Number(item.total_money?.amount || 0) / 100;

        if (!itemTotals[dateStr][itemName]) {
          itemTotals[dateStr][itemName] = { qty: 0, revenue: 0 };
        }
        itemTotals[dateStr][itemName].qty += qty;
        itemTotals[dateStr][itemName].revenue += itemRevenue;
      }
    }
  } while (cursor);

  // Upsert daily sales
  for (const [date, totals] of Object.entries(dailyTotals)) {
    const netRevenue = totals.revenue - totals.tax - totals.discounts;
    await sql`
      INSERT INTO daily_sales (id, restaurant_id, date, total_revenue, total_tax, total_tips, total_discounts, net_revenue, order_count)
      VALUES (
        ${"ds_" + date + "_" + restaurantId.slice(-6)},
        ${restaurantId}, ${date},
        ${totals.revenue}, ${totals.tax}, ${totals.tips}, ${totals.discounts},
        ${netRevenue}, ${totals.orders}
      )
      ON CONFLICT (restaurant_id, date) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_tax = EXCLUDED.total_tax,
        total_tips = EXCLUDED.total_tips,
        total_discounts = EXCLUDED.total_discounts,
        net_revenue = EXCLUDED.net_revenue,
        order_count = EXCLUDED.order_count
    `;
  }

  // Insert item sales (delete old ones for the date range first)
  for (const [date, items] of Object.entries(itemTotals)) {
    await sql`DELETE FROM item_sales WHERE restaurant_id = ${restaurantId} AND date = ${date}`;

    for (const [itemName, data] of Object.entries(items)) {
      itemCount++;
      await sql`
        INSERT INTO item_sales (id, restaurant_id, date, square_item_name, quantity_sold, total_revenue)
        VALUES (
          ${"is_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6)},
          ${restaurantId}, ${date}, ${itemName}, ${data.qty}, ${data.revenue}
        )
      `;
    }
  }

  return { orderCount, daysProcessed: Object.keys(dailyTotals).length, itemCount };
}

/**
 * Get Square location IDs for a restaurant
 */
async function getLocationIds(restaurantId: string): Promise<string[]> {
  try {
    const data = await squareApiCall(restaurantId, "/locations");
    return (data.locations || []).map((l: any) => l.id);
  } catch {
    return [];
  }
}

/**
 * Sync location info (business hours, address, timezone)
 */
async function syncLocation(sql: any, restaurantId: string) {
  try {
    const data = await squareApiCall(restaurantId, "/locations");
    const locations = data.locations || [];
    if (locations.length === 0) return null;

    const loc = locations[0];

    // Add Square columns to restaurants if they don't exist
    try {
      await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS square_location_id TEXT`;
      await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS address TEXT`;
      await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS timezone TEXT`;
      await sql`
        UPDATE restaurants SET
          square_location_id = ${loc.id},
          address = ${formatAddress(loc.address)},
          timezone = ${loc.timezone || null}
        WHERE id = ${restaurantId}
      `;
    } catch (err: any) {
      console.error("Update restaurant location error:", err.message);
    }

    // Convert Square business hours to our format and save
    if (loc.business_hours?.periods?.length > 0) {
      const hours = convertSquareHours(loc.business_hours.periods);
      await sql`
        UPDATE business_settings SET
          business_hours = ${JSON.stringify(hours)}
        WHERE restaurant_id = ${restaurantId}
      `;
    }

    return loc;
  } catch (err: any) {
    console.error("Sync location error:", err.message);
    return null;
  }
}

/**
 * Convert Square business hours to our app's format
 * Square: [{ day_of_week: "MON", start_local_time: "08:00:00", end_local_time: "18:00:00" }]
 * Our format: { "0": { open: "08:00", close: "18:00" }, "1": null, ... }
 * Day numbers: 0=Sunday, 1=Monday, ...
 */
function convertSquareHours(periods: any[]): Record<string, { open: string; close: string } | null> {
  const dayMap: Record<string, string> = {
    SUN: "0", MON: "1", TUE: "2", WED: "3", THU: "4", FRI: "5", SAT: "6",
  };

  const hours: Record<string, { open: string; close: string } | null> = {
    "0": null, "1": null, "2": null, "3": null, "4": null, "5": null, "6": null,
  };

  for (const period of periods) {
    const dayNum = dayMap[period.day_of_week];
    if (dayNum !== undefined) {
      hours[dayNum] = {
        open: (period.start_local_time || "").slice(0, 5),
        close: (period.end_local_time || "").slice(0, 5),
      };
    }
  }

  return hours;
}

function formatAddress(addr: any): string | null {
  if (!addr) return null;
  const parts = [addr.address_line_1, addr.locality, addr.administrative_district_level_1, addr.postal_code];
  return parts.filter(Boolean).join(", ");
}

/**
 * Sync labor/timecards from Square Team API
 */
async function syncLabor(sql: any, restaurantId: string, startAt: string, endAt: string) {
  let timecardCount = 0;
  const dailyLabor: Record<string, { cost: number; hours: number; employees: Set<string> }> = {};

  try {
    // Search for team member wages to calculate labor cost
    let cursor: string | null = null;

    do {
      const body: any = {
        query: {
          filter: {
            status: { state: "CLOCKEDOUT" },
            start: { start_at: startAt, end_at: endAt },
          },
        },
        limit: 100,
      };

      if (cursor) body.cursor = cursor;

      let data: any;
      try {
        data = await squareApiCall(restaurantId, "/labor/shifts/search", { method: "POST", body });
      } catch {
        // Labor API might not be available for all Square plans
        break;
      }

      const shifts = data.shifts || [];
      cursor = data.cursor || null;

      for (const shift of shifts) {
        timecardCount++;
        const dateStr = (shift.start_at || "").split("T")[0];
        if (!dateStr) continue;

        // Calculate hours from start/end
        const startTime = new Date(shift.start_at);
        const endTime = new Date(shift.end_at);
        const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

        // Calculate cost (wage is in cents per hour)
        const hourlyRate = Number(shift.wage?.hourly_rate?.amount || 0) / 100;
        const cost = hours * hourlyRate;

        if (!dailyLabor[dateStr]) {
          dailyLabor[dateStr] = { cost: 0, hours: 0, employees: new Set() };
        }
        dailyLabor[dateStr].cost += cost;
        dailyLabor[dateStr].hours += hours;
        dailyLabor[dateStr].employees.add(shift.employee_id || shift.team_member_id || "unknown");
      }
    } while (cursor);

    // Upsert daily labor
    for (const [date, data] of Object.entries(dailyLabor)) {
      await sql`
        INSERT INTO daily_labor (id, restaurant_id, date, total_labor_cost, total_hours, employee_count, from_square)
        VALUES (
          ${"dl_" + date + "_" + restaurantId.slice(-6)},
          ${restaurantId}, ${date},
          ${Math.round(data.cost * 100) / 100},
          ${Math.round(data.hours * 100) / 100},
          ${data.employees.size},
          true
        )
        ON CONFLICT (restaurant_id, date) DO UPDATE SET
          total_labor_cost = EXCLUDED.total_labor_cost,
          total_hours = EXCLUDED.total_hours,
          employee_count = EXCLUDED.employee_count,
          from_square = true
      `;
    }
  } catch (err: any) {
    console.error("Sync labor error:", err.message);
  }

  return { timecardCount };
}
