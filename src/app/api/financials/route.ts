import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Smart recommendation based on where the ACTUAL problem is.
 * Instead of always saying "cut food/labor", it identifies the biggest issue.
 */
function getRecommendation(foodPct: number, laborPct: number, primePct: number, overheadPct: number, operatingProfitPct: number) {
  // Find the biggest problem area
  const issues: { area: string; severity: number; message: string; status: "good" | "warning" | "danger" }[] = [];

  // Food cost check (target: 28-32%)
  if (foodPct > 35) {
    issues.push({ area: "Food Cost", severity: foodPct - 30, status: "danger",
      message: `Food cost at ${foodPct}% is high (target: 28-32%). Review supplier pricing, portion sizes, and waste. Consider renegotiating with vendors or finding alternative suppliers.` });
  } else if (foodPct > 32) {
    issues.push({ area: "Food Cost", severity: foodPct - 30, status: "warning",
      message: `Food cost at ${foodPct}% is slightly above target (28-32%). Small tweaks to portions or supplier deals could help.` });
  } else {
    issues.push({ area: "Food Cost", severity: 0, status: "good",
      message: `Food cost at ${foodPct}% is in great shape (target: 28-32%).` });
  }

  // Labor check (target: 25-30%)
  if (laborPct > 32) {
    issues.push({ area: "Labor", severity: laborPct - 28, status: "danger",
      message: `Labor at ${laborPct}% is high (target: 25-30%). Review scheduling efficiency and staffing levels during slow hours.` });
  } else if (laborPct > 30) {
    issues.push({ area: "Labor", severity: laborPct - 28, status: "warning",
      message: `Labor at ${laborPct}% is slightly above target (25-30%). Fine-tune shift scheduling to match busy periods.` });
  } else {
    issues.push({ area: "Labor", severity: 0, status: "good",
      message: `Labor at ${laborPct}% is well-managed (target: 25-30%).` });
  }

  // Overhead check (target: 15-22% excluding taxes)
  if (overheadPct > 25) {
    issues.push({ area: "Overhead", severity: overheadPct - 20, status: "danger",
      message: `Operating overhead at ${overheadPct}% is high (target: 15-22%). Look at rent renegotiation, utility savings, and software subscriptions you may not need.` });
  } else if (overheadPct > 22) {
    issues.push({ area: "Overhead", severity: overheadPct - 20, status: "warning",
      message: `Operating overhead at ${overheadPct}% is slightly above target (15-22%). Review subscriptions and utility costs for potential savings.` });
  } else {
    issues.push({ area: "Overhead", severity: 0, status: "good",
      message: `Overhead at ${overheadPct}% is in a healthy range (target: 15-22%).` });
  }

  // Sort by severity (biggest problem first)
  issues.sort((a, b) => b.severity - a.severity);

  // Build overall recommendation
  const dangerItems = issues.filter(i => i.status === "danger");
  const warningItems = issues.filter(i => i.status === "warning");
  const goodItems = issues.filter(i => i.status === "good");

  let summary: string;
  let status: "good" | "warning" | "danger";

  if (operatingProfitPct >= 15) {
    summary = `Operating profit at ${operatingProfitPct}% is strong. Keep it up!`;
    status = "good";
  } else if (operatingProfitPct >= 8) {
    summary = `Operating profit at ${operatingProfitPct}% is decent but has room to grow.`;
    status = dangerItems.length > 0 ? "warning" : "good";
  } else if (operatingProfitPct >= 0) {
    summary = `Operating profit at ${operatingProfitPct}% is tight.`;
    status = dangerItems.length > 0 ? "danger" : "warning";
  } else {
    summary = `You're operating at a loss. Focus on the biggest cost areas below.`;
    status = "danger";
  }

  if (dangerItems.length > 0) {
    summary += ` Biggest opportunity: ${dangerItems[0].area}.`;
  } else if (warningItems.length > 0) {
    summary += ` Minor opportunity: ${warningItems[0].area}.`;
  }

  return { summary, status, areas: issues };
}

export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const dayCount = Math.max(
      1,
      Math.ceil(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1
    );

    const revenueRows = await sql`SELECT
          COALESCE(SUM(total_revenue), 0) as total_revenue,
          COALESCE(SUM(net_revenue), 0) as net_revenue,
          COALESCE(SUM(total_tax), 0) as total_tax,
          COALESCE(SUM(total_tips), 0) as total_tips,
          COALESCE(SUM(total_discounts), 0) as total_discounts,
          COALESCE(SUM(order_count), 0) as total_orders
         FROM daily_sales
         WHERE date >= ${startDate} AND date <= ${endDate}`;
    const revenueRow: any = revenueRows[0];

    const revenue = revenueRow.net_revenue;
    const grossSales = revenueRow.net_revenue + revenueRow.total_discounts;

    const theoreticalRows = await sql`SELECT COALESCE(SUM(
          isales.quantity_sold * COALESCE(
            (SELECT SUM(r.quantity * i.cost_per_unit)
             FROM recipes r
             JOIN ingredients i ON r.ingredient_id = i.id
             WHERE r.menu_item_id = isales.menu_item_id),
            0
          )
        ), 0) as theoretical_cost
        FROM item_sales isales
        WHERE isales.date >= ${startDate} AND isales.date <= ${endDate}
          AND isales.menu_item_id IS NOT NULL`;
    const theoreticalFoodCost: any = theoreticalRows[0];

    const receiptCostRows = await sql`SELECT COALESCE(SUM(r.total), 0) as receipt_total
         FROM receipts r
         WHERE r.status = 'confirmed'
           AND r.receipt_date >= ${startDate} AND r.receipt_date <= ${endDate}`;
    const receiptCostRow: any = receiptCostRows[0];

    const laborRows = await sql`SELECT
          COALESCE(SUM(total_labor_cost), 0) as total_labor,
          COALESCE(SUM(total_hours), 0) as total_hours,
          COALESCE(SUM(shift_count), 0) as total_shifts
         FROM daily_labor
         WHERE date >= ${startDate} AND date <= ${endDate}`;
    const laborRow: any = laborRows[0];

    const expensesByType = await sql`SELECT
          ec.type,
          ec.name as category_name,
          ec.id as category_id,
          COALESCE(SUM(e.amount), 0) as total
         FROM expenses e
         JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.date >= ${startDate} AND e.date <= ${endDate}
         GROUP BY ec.id, ec.type, ec.name
         ORDER BY ec.type, COALESCE(SUM(e.amount), 0) DESC` as Array<{
      type: string; category_name: string; category_id: string; total: number;
    }>;

    function sumByType(type: string) {
      return expensesByType.filter((e) => e.type === type).reduce((s, e) => s + e.total, 0);
    }
    function breakdownByType(type: string) {
      return expensesByType.filter((e) => e.type === type && e.total > 0).map((e) => ({ name: e.category_name, amount: e.total, category_id: e.category_id }));
    }

    const cogExpenses = sumByType("cogs");
    const laborExpenses = sumByType("labor");
    const occupancyExpenses = sumByType("occupancy");
    const utilitiesExpenses = sumByType("utilities");
    const directOpsExpenses = sumByType("direct_ops");
    const marketingExpenses = sumByType("marketing");
    const technologyExpenses = sumByType("technology");
    const adminExpenses = sumByType("admin");
    const repairsExpenses = sumByType("repairs");
    const financialExpenses = sumByType("financial");
    const otherExpenses = sumByType("other");

    // Split regulatory: sales tax is pass-through (NOT an expense), income tax is real
    const salesTaxAmount = expensesByType
      .filter((e) => e.category_id === "cat-sales-tax")
      .reduce((s, e) => s + e.total, 0);
    const incomeTaxAmount = expensesByType
      .filter((e) => e.category_id === "cat-federal-tax")
      .reduce((s, e) => s + e.total, 0);
    // Licenses, permits, etc. are real operating expenses
    const licensesAmount = expensesByType
      .filter((e) => e.type === "regulatory" && e.category_id !== "cat-sales-tax" && e.category_id !== "cat-federal-tax")
      .reduce((s, e) => s + e.total, 0);
    const licensesBreakdown = expensesByType
      .filter((e) => e.type === "regulatory" && e.category_id !== "cat-sales-tax" && e.category_id !== "cat-federal-tax" && e.total > 0)
      .map((e) => ({ name: e.category_name, amount: e.total, category_id: e.category_id }));

    // Use bank statement data as primary source when available (it's actual cash flow).
    // Only fall back to Square/recipe data when no bank statement data exists for the period.
    // This prevents double-counting (e.g. Square labor + bank statement payroll = same money).
    const totalFoodCost = cogExpenses > 0
      ? cogExpenses
      : Math.max(theoreticalFoodCost.theoretical_cost, 0);
    const totalLaborCost = laborExpenses > 0
      ? laborExpenses
      : laborRow.total_labor;
    const totalOccupancy = occupancyExpenses;
    const totalUtilities = utilitiesExpenses;
    const totalDirectOps = directOpsExpenses;
    const totalMarketing = marketingExpenses;
    const totalTechnology = technologyExpenses;
    const totalAdmin = adminExpenses + licensesAmount; // licenses are admin/operating
    const totalRepairs = repairsExpenses;
    const totalFinancial = financialExpenses;
    const totalOther = otherExpenses;
    // Sales tax is pass-through (collected from customers, paid to state) — NOT an expense
    // Income tax is shown below operating profit

    const controllableExpenses = totalFoodCost + totalLaborCost + totalDirectOps + totalMarketing + totalTechnology + totalRepairs;
    const nonControllableExpenses = totalOccupancy + totalUtilities + totalAdmin + totalFinancial + totalOther;
    const operatingExpenses = controllableExpenses + nonControllableExpenses;
    const operatingProfit = revenue - operatingExpenses;
    // Net profit includes income tax but NOT sales tax (sales tax is pass-through, not your money)
    const totalExpenses = operatingExpenses + incomeTaxAmount;
    const profit = revenue - totalExpenses;
    const operatingOverhead = nonControllableExpenses;

    const pct = (amount: number) => revenue > 0 ? Math.round((amount / revenue) * 1000) / 10 : 0;

    const benchmarks = {
      food: { min: 28, target: 30, max: 32 },
      labor: { min: 25, target: 28, max: 30 },
      prime: { min: 53, target: 55, max: 60 },
      occupancy: { min: 6, target: 8, max: 10 },
      utilities: { min: 3, target: 4, max: 5 },
      directOps: { min: 3, target: 4, max: 5 },
      marketing: { min: 3, target: 4, max: 6 },
      technology: { min: 1, target: 2, max: 3 },
      admin: { min: 3, target: 4, max: 6 },
      repairs: { min: 1, target: 1.5, max: 2 },
      profit: { min: 6, target: 10, max: 15 },
    };

    function getStatus(actual: number, benchmark: { target: number; max: number; min?: number }, isProfit: boolean) {
      if (isProfit) {
        if (actual >= benchmark.target) return "good";
        if (benchmark.min !== undefined && actual >= benchmark.min) return "warning";
        return "danger";
      }
      if (actual <= benchmark.target) return "good";
      if (actual <= benchmark.max) return "warning";
      return "danger";
    }

    const primeCost = totalFoodCost + totalLaborCost;
    const primeCostPct = pct(primeCost);
    const rplh = laborRow.total_hours > 0 ? Math.round((revenue / laborRow.total_hours) * 100) / 100 : 0;
    const avgTicket = revenueRow.total_orders > 0 ? Math.round((revenue / revenueRow.total_orders) * 100) / 100 : 0;
    const dailyAvgRevenue = Math.round((revenue / dayCount) * 100) / 100;

    const foodCostVariance =
      theoreticalFoodCost.theoretical_cost > 0 && receiptCostRow.receipt_total > 0
        ? pct(receiptCostRow.receipt_total) - pct(theoreticalFoodCost.theoretical_cost)
        : null;

    const fixedCosts = nonControllableExpenses;
    const variableRatio = revenue > 0 ? (totalFoodCost + totalDirectOps) / revenue : 0;
    const breakEvenRevenue = variableRatio < 1 ? Math.round((fixedCosts / (1 - variableRatio)) * 100) / 100 : 0;
    const breakEvenDaily = breakEvenRevenue > 0 ? Math.round((breakEvenRevenue / dayCount) * 100) / 100 : 0;
    const breakEvenOrders = avgTicket > 0 ? Math.ceil(breakEvenRevenue / avgTicket) : 0;

    const profitPerOrder = revenueRow.total_orders > 0 ? Math.round((profit / revenueRow.total_orders) * 100) / 100 : 0;

    const grossProfit = revenue - totalFoodCost;
    const grossProfitMargin = pct(grossProfit);

    return NextResponse.json({
      period: { startDate, endDate, days: dayCount },
      revenue: {
        gross_sales: Math.round(grossSales * 100) / 100,
        discounts: Math.round(revenueRow.total_discounts * 100) / 100,
        total: Math.round(revenue * 100) / 100,
        tax: Math.round(revenueRow.total_tax * 100) / 100,
        tips: Math.round(revenueRow.total_tips * 100) / 100,
        total_collected: Math.round(revenueRow.total_revenue * 100) / 100,
        orders: revenueRow.total_orders,
        daily_average: dailyAvgRevenue,
        avg_ticket: avgTicket,
      },
      foodCost: { total: Math.round(totalFoodCost * 100) / 100, theoretical: Math.round(theoreticalFoodCost.theoretical_cost * 100) / 100, actual_purchases: Math.round(receiptCostRow.receipt_total * 100) / 100, cog_expenses: Math.round(cogExpenses * 100) / 100, percentage: pct(totalFoodCost), benchmark: benchmarks.food, status: getStatus(pct(totalFoodCost), benchmarks.food, false), breakdown: breakdownByType("cogs") },
      labor: { total: Math.round(totalLaborCost * 100) / 100, from_square: Math.round(laborRow.total_labor * 100) / 100, manual_entries: Math.round(laborExpenses * 100) / 100, total_hours: Math.round(laborRow.total_hours * 10) / 10, total_shifts: laborRow.total_shifts, percentage: pct(totalLaborCost), benchmark: benchmarks.labor, status: getStatus(pct(totalLaborCost), benchmarks.labor, false), breakdown: breakdownByType("labor") },
      occupancy: { total: Math.round(totalOccupancy * 100) / 100, percentage: pct(totalOccupancy), benchmark: benchmarks.occupancy, status: getStatus(pct(totalOccupancy), benchmarks.occupancy, false), breakdown: breakdownByType("occupancy") },
      utilities: { total: Math.round(totalUtilities * 100) / 100, percentage: pct(totalUtilities), benchmark: benchmarks.utilities, status: getStatus(pct(totalUtilities), benchmarks.utilities, false), breakdown: breakdownByType("utilities") },
      directOps: { total: Math.round(totalDirectOps * 100) / 100, percentage: pct(totalDirectOps), benchmark: benchmarks.directOps, status: getStatus(pct(totalDirectOps), benchmarks.directOps, false), breakdown: breakdownByType("direct_ops") },
      marketing: { total: Math.round(totalMarketing * 100) / 100, percentage: pct(totalMarketing), benchmark: benchmarks.marketing, status: getStatus(pct(totalMarketing), benchmarks.marketing, false), breakdown: breakdownByType("marketing") },
      technology: { total: Math.round(totalTechnology * 100) / 100, percentage: pct(totalTechnology), benchmark: benchmarks.technology, status: getStatus(pct(totalTechnology), benchmarks.technology, false), breakdown: breakdownByType("technology") },
      admin: { total: Math.round(totalAdmin * 100) / 100, percentage: pct(totalAdmin), benchmark: benchmarks.admin, status: getStatus(pct(totalAdmin), benchmarks.admin, false), breakdown: [...breakdownByType("admin"), ...licensesBreakdown] },
      repairs: { total: Math.round(totalRepairs * 100) / 100, percentage: pct(totalRepairs), benchmark: benchmarks.repairs, status: getStatus(pct(totalRepairs), benchmarks.repairs, false), breakdown: breakdownByType("repairs") },
      salesTax: {
        collected: Math.round(revenueRow.total_tax * 100) / 100,
        paid: Math.round(salesTaxAmount * 100) / 100,
        note: "Pass-through — collected from customers and paid to the state. Not a business expense.",
      },
      incomeTax: {
        total: Math.round(incomeTaxAmount * 100) / 100,
        percentage: pct(incomeTaxAmount),
        label: "Income Tax",
      },
      financialCosts: { total: Math.round(totalFinancial * 100) / 100, percentage: pct(totalFinancial), breakdown: breakdownByType("financial") },
      otherCosts: { total: Math.round(totalOther * 100) / 100, percentage: pct(totalOther), breakdown: breakdownByType("other") },
      operatingProfit: {
        total: Math.round(operatingProfit * 100) / 100,
        percentage: pct(operatingProfit),
        label: "Operating Profit (before taxes)",
        explanation: "Your profit from running the business, before any tax payments.",
      },
      profit: { total: Math.round(profit * 100) / 100, percentage: pct(profit), benchmark: benchmarks.profit, status: getStatus(pct(profit), benchmarks.profit, true), per_order: profitPerOrder, gross_margin: grossProfitMargin },
      kpis: {
        prime_cost: { total: Math.round(primeCost * 100) / 100, percentage: primeCostPct, benchmark: benchmarks.prime, status: getStatus(primeCostPct, benchmarks.prime, false), label: "Prime Cost (Food + Labor)", explanation: "The #1 number profitable cafes track. This is your food and labor combined. Keep it under 60%." },
        rplh: { value: rplh, label: "Revenue Per Labor Hour", benchmark: { good: 45, warning: 35 }, status: rplh >= 45 ? "good" : rplh >= 35 ? "warning" : "danger", explanation: "For every hour your team works, this is how much revenue you bring in. Below $35 means you might be overstaffed." },
        avg_ticket: { value: avgTicket, label: "Average Ticket Size", explanation: "How much the average customer spends per visit." },
        break_even: { revenue_needed: breakEvenRevenue, daily_needed: breakEvenDaily, orders_needed: breakEvenOrders, label: "Break-Even Point", explanation: "How much you need to sell just to cover all your costs." },
        food_cost_variance: { value: foodCostVariance, label: "Food Cost Variance", benchmark: { good: 2, warning: 4 }, status: foodCostVariance === null ? "unknown" : Math.abs(foodCostVariance) <= 2 ? "good" : Math.abs(foodCostVariance) <= 4 ? "warning" : "danger", explanation: "The gap between what your food SHOULD cost and what you actually spent." },
        daily_avg_revenue: { value: dailyAvgRevenue, label: "Daily Average Revenue" },
        controllable_vs_fixed: { controllable: Math.round(controllableExpenses * 100) / 100, controllable_pct: pct(controllableExpenses), fixed: Math.round(operatingOverhead * 100) / 100, fixed_pct: pct(operatingOverhead), label: "Controllable vs. Fixed Costs", explanation: "Controllable costs are things you can change quickly. Fixed costs are locked in." },
        recommendation: getRecommendation(pct(totalFoodCost), pct(totalLaborCost), primeCostPct, pct(operatingOverhead), pct(operatingProfit)),
      },
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      expensesByType: expensesByType.filter((e) => e.total > 0),
    });
  } catch (error: unknown) {
    console.error("Financials API error:", error);
    return NextResponse.json(
      { error: "Failed to calculate financials" },
      { status: 500 }
    );
  }
}
