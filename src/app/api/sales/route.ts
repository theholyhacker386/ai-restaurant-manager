import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate query params are required" },
        { status: 400 }
      );
    }

    const { sql, restaurantId } = await getTenantDb();

    const dailySales = await sql`SELECT date, total_revenue, total_tax, total_tips, total_discounts, net_revenue, order_count
         FROM daily_sales
         WHERE date >= ${startDate} AND date <= ${endDate}
           AND restaurant_id = ${restaurantId}
         ORDER BY date DESC`;

    const topItems = await sql`SELECT
          square_item_name as name,
          SUM(quantity_sold) as total_quantity,
          SUM(total_revenue) as total_revenue,
          menu_item_id
         FROM item_sales
         WHERE date >= ${startDate} AND date <= ${endDate}
           AND restaurant_id = ${restaurantId}
         GROUP BY square_item_name, menu_item_id
         ORDER BY SUM(total_revenue) DESC
         LIMIT 20`;

    const totalsRows = await sql`SELECT
          COALESCE(SUM(total_revenue), 0) as total_revenue,
          COALESCE(SUM(total_tax), 0) as total_tax,
          COALESCE(SUM(total_tips), 0) as total_tips,
          COALESCE(SUM(total_discounts), 0) as total_discounts,
          COALESCE(SUM(net_revenue), 0) as net_revenue,
          COALESCE(SUM(order_count), 0) as total_orders
         FROM daily_sales
         WHERE date >= ${startDate} AND date <= ${endDate}
           AND restaurant_id = ${restaurantId}`;
    const totals: any = totalsRows[0];

    const avgOrderValue =
      totals.total_orders > 0
        ? totals.total_revenue / totals.total_orders
        : 0;

    return NextResponse.json({
      dailySales,
      topItems,
      totals: {
        ...totals,
        avg_order_value: Math.round(avgOrderValue * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error("Sales API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch sales data" },
      { status: 500 }
    );
  }
}
