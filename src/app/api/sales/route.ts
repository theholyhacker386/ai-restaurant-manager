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

    const dailySales = await sql`SELECT date, total_revenue, total_tax, total_tips, total_discounts, net_revenue, order_count,
         COALESCE(cash_total, 0) as cash_total, COALESCE(card_total, 0) as card_total
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
          COALESCE(SUM(order_count), 0) as total_orders,
          COALESCE(SUM(cash_total), 0) as total_cash,
          COALESCE(SUM(card_total), 0) as total_card
         FROM daily_sales
         WHERE date >= ${startDate} AND date <= ${endDate}
           AND restaurant_id = ${restaurantId}`;
    const totals: any = totalsRows[0];

    // Bank deposits (cash deposited at bank)
    const bankDeposits = await sql`SELECT pt.date, ABS(pt.amount) as deposit_amount, pt.name as description
      FROM plaid_transactions pt
      JOIN plaid_accounts pa ON pt.plaid_account_id = pa.account_id
        AND pa.restaurant_id = ${restaurantId}
      WHERE pt.date >= ${startDate} AND pt.date <= ${endDate}
        AND pt.restaurant_id = ${restaurantId}
        AND pt.category_detailed = 'TRANSFER_IN_DEPOSIT'
        AND pt.amount < 0
        AND pt.pending = false
      ORDER BY pt.date DESC`;

    const avgOrderValue =
      totals.total_orders > 0
        ? totals.total_revenue / totals.total_orders
        : 0;

    const totalBankDeposits = bankDeposits.reduce((sum: number, d: any) => sum + Number(d.deposit_amount), 0);

    return NextResponse.json({
      dailySales,
      topItems,
      totals: {
        ...totals,
        avg_order_value: Math.round(avgOrderValue * 100) / 100,
        total_cash: Number(totals.total_cash) || 0,
        total_card: Number(totals.total_card) || 0,
      },
      cashTracker: {
        cashSalesFromSquare: Number(totals.total_cash) || 0,
        totalBankDeposits,
        bankDeposits,
        variance: (Number(totals.total_cash) || 0) - totalBankDeposits,
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
