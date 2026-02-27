import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 }
    );
  }

  try {
    const { sql, restaurantId } = await getTenantDb();

    const revenueRows = await sql`
      SELECT COALESCE(SUM(net_revenue), 0) as total_revenue
      FROM daily_sales
      WHERE date >= ${startDate} AND date <= ${endDate}
        AND restaurant_id = ${restaurantId}
    `;

    const cogsRows = await sql`
      SELECT COALESCE(SUM(e.amount), 0) as total_cogs
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE ec.type = 'cogs'
      AND e.date >= ${startDate} AND e.date <= ${endDate}
      AND e.restaurant_id = ${restaurantId}
    `;

    const laborExpenseRows = await sql`
      SELECT COALESCE(SUM(e.amount), 0) as total_labor_expense
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE ec.type = 'labor'
      AND e.date >= ${startDate} AND e.date <= ${endDate}
      AND e.restaurant_id = ${restaurantId}
    `;

    const laborRows = await sql`
      SELECT
        COALESCE(SUM(total_labor_cost), 0) as total_labor,
        COALESCE(SUM(total_hours), 0) as total_hours
      FROM daily_labor
      WHERE date >= ${startDate} AND date <= ${endDate}
        AND restaurant_id = ${restaurantId}
    `;

    const overheadRows = await sql`
      SELECT COALESCE(SUM(e.amount), 0) as total_overhead
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE ec.type NOT IN ('cogs', 'labor')
      AND ec.id NOT IN ('cat-sales-tax', 'cat-federal-tax')
      AND e.date >= ${startDate} AND e.date <= ${endDate}
      AND e.restaurant_id = ${restaurantId}
    `;

    const revenue = (revenueRows[0] as any)?.total_revenue || 0;
    const cogs = (cogsRows[0] as any)?.total_cogs || 0;
    const laborFromStatements = (laborExpenseRows[0] as any)?.total_labor_expense || 0;
    const laborFromSquare = (laborRows[0] as any)?.total_labor || 0;
    const laborHours = (laborRows[0] as any)?.total_hours || 0;
    const overhead = (overheadRows[0] as any)?.total_overhead || 0;

    // Use bank statement labor when available (actual cash out), fall back to Square
    const labor = laborFromStatements > 0 ? laborFromStatements : laborFromSquare;

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - labor - overhead;
    const primeCost = cogs + labor;
    const primeCostPercent = revenue > 0 ? (primeCost / revenue) * 100 : 0;
    const foodCostPercent = revenue > 0 ? (cogs / revenue) * 100 : 0;
    const laborPercent = revenue > 0 ? (labor / revenue) * 100 : 0;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const rplh = laborHours > 0 ? revenue / laborHours : 0;

    const variableCosts = cogs;
    const fixedCosts = overhead + (labor * 0.7);
    const contributionMargin = revenue - variableCosts;
    const contributionMarginRatio = revenue > 0 ? contributionMargin / revenue : 0;
    const breakEvenRevenue = contributionMarginRatio > 0 ? fixedCosts / contributionMarginRatio : 0;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const dailyBreakEven = days > 0 ? breakEvenRevenue / days : 0;

    return NextResponse.json({
      revenue, cogs, labor, laborHours, overhead,
      grossProfit, netProfit, primeCost, primeCostPercent,
      foodCostPercent, laborPercent, profitMargin, rplh,
      breakEvenRevenue, dailyBreakEven, daysInPeriod: days,
    });
  } catch (error) {
    console.error("KPI calculation error:", error);
    return NextResponse.json({ error: "Failed to calculate KPIs" }, { status: 500 });
  }
}
