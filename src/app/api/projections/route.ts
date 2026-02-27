import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    // Calculate the date range for all 24 months at once
    const startMonth = new Date(currentYear, currentMonth - 23, 1);
    const rangeStart = `${startMonth.getFullYear()}-${String(startMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const rangeEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Batch query: revenue and orders by month
    // Note: date columns are TEXT ('YYYY-MM-DD'), so use SUBSTRING instead of TO_CHAR
    const revenueByMonth = await sql`
      SELECT SUBSTRING(date, 1, 7) as month,
        COALESCE(SUM(net_revenue), 0) as revenue,
        COALESCE(SUM(order_count), 0) as orders
      FROM daily_sales
      WHERE date >= ${rangeStart} AND date <= ${rangeEnd}
      GROUP BY SUBSTRING(date, 1, 7)` as Array<{ month: string; revenue: number; orders: number }>;

    // Batch query: labor by month
    const laborByMonth = await sql`
      SELECT SUBSTRING(date, 1, 7) as month,
        COALESCE(SUM(total_labor_cost), 0) as labor,
        COALESCE(SUM(total_hours), 0) as hours
      FROM daily_labor
      WHERE date >= ${rangeStart} AND date <= ${rangeEnd}
      GROUP BY SUBSTRING(date, 1, 7)` as Array<{ month: string; labor: number; hours: number }>;

    // Batch query: theoretical food cost by month
    const theoreticalByMonth = await sql`
      SELECT SUBSTRING(isales.date, 1, 7) as month,
        COALESCE(SUM(
          isales.quantity_sold * COALESCE(
            (SELECT SUM(r.quantity * i.cost_per_unit)
             FROM recipes r
             JOIN ingredients i ON r.ingredient_id = i.id
             WHERE r.menu_item_id = isales.menu_item_id), 0)
        ), 0) as cost
      FROM item_sales isales
      WHERE isales.date >= ${rangeStart} AND isales.date <= ${rangeEnd}
        AND isales.menu_item_id IS NOT NULL
      GROUP BY SUBSTRING(isales.date, 1, 7)` as Array<{ month: string; cost: number }>;

    // Batch query: expenses by month and type
    const expensesByMonth = await sql`
      SELECT SUBSTRING(e.date, 1, 7) as month, ec.type,
        COALESCE(SUM(e.amount), 0) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.date >= ${rangeStart} AND e.date <= ${rangeEnd}
        AND ec.id NOT IN ('cat-sales-tax', 'cat-federal-tax')
      GROUP BY SUBSTRING(e.date, 1, 7), ec.type` as Array<{ month: string; type: string; total: number }>;

    // Index all batch results by month key
    const revMap = new Map(revenueByMonth.map((r) => [r.month, r]));
    const labMap = new Map(laborByMonth.map((r) => [r.month, r]));
    const theoMap = new Map(theoreticalByMonth.map((r) => [r.month, r]));
    const expMap = new Map<string, Record<string, number>>();
    for (const e of expensesByMonth) {
      if (!expMap.has(e.month)) expMap.set(e.month, {});
      expMap.get(e.month)![e.type] = Number(e.total);
    }

    // Build monthly data from the indexed results
    const monthlyData: Array<{
      year: number; month: number; label: string; revenue: number;
      foodCost: number; laborCost: number; overheadCost: number;
      totalExpenses: number; profit: number; orders: number; laborHours: number;
    }> = [];

    for (let i = 23; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short" }) +
        (y !== currentYear ? ` '${String(y).slice(-2)}` : "");

      const rev = revMap.get(monthKey);
      const lab = labMap.get(monthKey);
      const theo = theoMap.get(monthKey);
      const exp = expMap.get(monthKey) || {};

      const revenue = Number(rev?.revenue || 0);
      const orders = Number(rev?.orders || 0);
      const laborFromSquare = Number(lab?.labor || 0);
      const laborHours = Number(lab?.hours || 0);
      const theoreticalCost = Math.max(Number(theo?.cost || 0), 0);

      const cogsExpenses = exp["cogs"] || 0;
      const laborExpenses = exp["labor"] || 0;
      const overheadTotal = Object.entries(exp)
        .filter(([type]) => type !== "cogs" && type !== "labor")
        .reduce((sum, [, val]) => sum + val, 0);

      // Use bank statement data when available (actual cash), fall back to Square/recipes
      const foodCost = cogsExpenses > 0 ? cogsExpenses : theoreticalCost;
      const laborCost = laborExpenses > 0 ? laborExpenses : laborFromSquare;
      const totalExpenses = foodCost + laborCost + overheadTotal;

      monthlyData.push({
        year: y, month: m, label,
        revenue: Math.round(revenue * 100) / 100,
        foodCost: Math.round(foodCost * 100) / 100,
        laborCost: Math.round(laborCost * 100) / 100,
        overheadCost: Math.round(overheadTotal * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        profit: Math.round((revenue - totalExpenses) * 100) / 100,
        orders,
        laborHours: Math.round(laborHours * 10) / 10,
      });
    }

    // Pro-rate current month
    const lastEntry = monthlyData[monthlyData.length - 1];
    if (lastEntry.year === currentYear && lastEntry.month === currentMonth && lastEntry.revenue > 0) {
      const daysSoFar = today.getDate();
      const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      if (daysSoFar < totalDaysInMonth && daysSoFar >= 7) {
        const scale = totalDaysInMonth / daysSoFar;
        lastEntry.revenue = Math.round(lastEntry.revenue * scale * 100) / 100;
        lastEntry.foodCost = Math.round(lastEntry.foodCost * scale * 100) / 100;
        lastEntry.laborCost = Math.round(lastEntry.laborCost * scale * 100) / 100;
        lastEntry.overheadCost = Math.round(lastEntry.overheadCost * scale * 100) / 100;
        lastEntry.totalExpenses = lastEntry.foodCost + lastEntry.laborCost + lastEntry.overheadCost;
        lastEntry.profit = Math.round((lastEntry.revenue - lastEntry.totalExpenses) * 100) / 100;
        lastEntry.orders = Math.round(lastEntry.orders * scale);
        lastEntry.laborHours = Math.round(lastEntry.laborHours * scale * 10) / 10;
      }
    }

    const recentMonths = monthlyData.filter((m) => m.revenue > 0);
    const last3 = recentMonths.slice(-3);

    let forecastRevenue = 0, forecastFoodCost = 0, forecastLabor = 0, forecastOverhead = 0;
    let confidenceRange = 0, growthRate = 0, hasEnoughData = last3.length >= 2;

    if (last3.length >= 2) {
      const avgRevenue = last3.reduce((s, m) => s + m.revenue, 0) / last3.length;
      if (last3.length >= 2) {
        const latest = last3[last3.length - 1].revenue;
        const previous = last3[last3.length - 2].revenue;
        growthRate = previous > 0 ? (latest - previous) / previous : 0;
      }

      const nextMonth = new Date(currentYear, currentMonth + 1, 1);
      const forecastMonth = nextMonth.getMonth();
      const forecastYear = nextMonth.getFullYear();
      const lastYearData = monthlyData.find((m) => m.month === forecastMonth && m.year === forecastYear - 1);

      let seasonalFactor = 1;
      if (lastYearData && lastYearData.revenue > 0 && avgRevenue > 0) {
        seasonalFactor = lastYearData.revenue / avgRevenue;
        seasonalFactor = Math.max(0.7, Math.min(1.3, seasonalFactor));
      }

      const dampenedGrowth = Math.max(-0.15, Math.min(0.15, growthRate));
      forecastRevenue = avgRevenue * seasonalFactor * (1 + dampenedGrowth);

      const revenues = last3.map((m) => m.revenue);
      const mean = revenues.reduce((s, v) => s + v, 0) / revenues.length;
      const variance = revenues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / revenues.length;
      confidenceRange = Math.round(Math.sqrt(variance) * 1.5);

      const avgFoodPct = last3.reduce((s, m) => s + (m.revenue > 0 ? m.foodCost / m.revenue : 0), 0) / last3.length;
      forecastFoodCost = forecastRevenue * avgFoodPct;
      forecastLabor = last3.reduce((s, m) => s + m.laborCost, 0) / last3.length;
      forecastOverhead = last3.reduce((s, m) => s + m.overheadCost, 0) / last3.length;
    } else if (last3.length === 1) {
      hasEnoughData = true;
      forecastRevenue = last3[0].revenue;
      forecastFoodCost = last3[0].foodCost;
      forecastLabor = last3[0].laborCost;
      forecastOverhead = last3[0].overheadCost;
      confidenceRange = Math.round(forecastRevenue * 0.2);
    }

    const forecastExpenses = forecastFoodCost + forecastLabor + forecastOverhead;
    const forecastProfit = forecastRevenue - forecastExpenses;
    const forecastProfitMargin = forecastRevenue > 0 ? (forecastProfit / forecastRevenue) * 100 : 0;

    const cumulativeProfit = last3.reduce((s, m) => s + m.profit, 0);
    const monthlyBurn = forecastExpenses > 0 ? forecastExpenses : 1;
    const estimatedRunway = cumulativeProfit > 0 ? cumulativeProfit / monthlyBurn : 0;

    let cashScore = 0;
    if (estimatedRunway > 3) cashScore = 30;
    else if (estimatedRunway >= 1) cashScore = Math.round(15 + (estimatedRunway - 1) * 7.5);
    else if (estimatedRunway > 0) cashScore = Math.round(estimatedRunway * 15);

    let profitScore = 0;
    const last30Revenue = last3.length > 0 ? last3[last3.length - 1] : null;
    const prev30Revenue = last3.length > 1 ? last3[last3.length - 2] : null;
    if (last30Revenue && prev30Revenue) {
      if (last30Revenue.profit > prev30Revenue.profit) profitScore = 30;
      else if (last30Revenue.profit >= prev30Revenue.profit * 0.9) profitScore = 15;
    } else if (last30Revenue && last30Revenue.profit > 0) {
      profitScore = 15;
    }

    const recentRevenue = last3.reduce((s, m) => s + m.revenue, 0);
    const recentFood = last3.reduce((s, m) => s + m.foodCost, 0);
    const recentLabor = last3.reduce((s, m) => s + m.laborCost, 0);
    const primeCostPct = recentRevenue > 0 ? ((recentFood + recentLabor) / recentRevenue) * 100 : 100;

    let primeScore = 0;
    if (primeCostPct < 60) primeScore = 20;
    else if (primeCostPct <= 70) primeScore = 10;

    let growthScore = 0;
    if (last3.length >= 2) {
      const thisMonth = last3[last3.length - 1].revenue;
      const lastMonth = last3[last3.length - 2].revenue;
      const revenueGrowth = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
      if (revenueGrowth > 10) growthScore = 20;
      else if (revenueGrowth >= 0) growthScore = 10;
    }

    const survivalScore = cashScore + profitScore + primeScore + growthScore;
    let survivalStatus: string;
    if (survivalScore >= 70) survivalStatus = "Solid ground";
    else if (survivalScore >= 40) survivalStatus = "Caution";
    else survivalStatus = "Critical";

    const insights: Array<{ icon: string; text: string; type: "good" | "warning" | "danger" }> = [];

    if (last3.length >= 2) {
      const revenueGrowthPct = growthRate * 100;
      if (revenueGrowthPct > 10) {
        insights.push({ icon: "trending_up", text: `Revenue trending up ${revenueGrowthPct.toFixed(1)}%`, type: "good" });
      } else if (revenueGrowthPct > 0) {
        insights.push({ icon: "trending_up", text: `Revenue growing ${revenueGrowthPct.toFixed(1)}%`, type: "good" });
      } else if (revenueGrowthPct < -5) {
        insights.push({ icon: "trending_down", text: `Revenue declined ${Math.abs(revenueGrowthPct).toFixed(1)}%`, type: "danger" });
      }
    }

    if (primeCostPct > 65 && recentRevenue > 0) {
      insights.push({ icon: "warning", text: `Prime cost at ${primeCostPct.toFixed(1)}%`, type: "warning" });
    } else if (primeCostPct < 55 && recentRevenue > 0) {
      insights.push({ icon: "check", text: `Prime cost at ${primeCostPct.toFixed(1)}% — excellent`, type: "good" });
    }

    if (forecastProfit > 1000) {
      insights.push({ icon: "savings", text: `Projected profit $${forecastProfit.toFixed(0)}`, type: "good" });
    } else if (forecastProfit < 0) {
      insights.push({ icon: "alert", text: `Projected loss of $${Math.abs(forecastProfit).toFixed(0)}`, type: "danger" });
    }

    if (insights.length === 0 && hasEnoughData) {
      insights.push({ icon: "info", text: "Keep tracking — more data means better projections", type: "good" });
    }

    const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
    const forecastLabel = nextMonthDate.toLocaleString("en-US", { month: "long", year: "numeric" });

    const primeCostTrend = monthlyData.map((m) => ({
      label: m.label,
      value: m.revenue > 0 ? Math.round(((m.foodCost + m.laborCost) / m.revenue) * 1000) / 10 : 0,
    }));

    return NextResponse.json({
      hasEnoughData,
      monthsOfData: recentMonths.length,
      monthly: monthlyData.map((m) => ({
        label: m.label, revenue: m.revenue, expenses: m.totalExpenses,
        profit: m.profit, foodCost: m.foodCost, laborCost: m.laborCost,
        overheadCost: m.overheadCost, orders: m.orders,
      })),
      forecast: {
        label: forecastLabel,
        shortLabel: nextMonthDate.toLocaleString("en-US", { month: "short" }),
        revenue: Math.round(forecastRevenue),
        confidenceRange,
        expenses: Math.round(forecastExpenses),
        foodCost: Math.round(forecastFoodCost),
        laborCost: Math.round(forecastLabor),
        overheadCost: Math.round(forecastOverhead),
        profit: Math.round(forecastProfit),
        profitMargin: Math.round(forecastProfitMargin * 10) / 10,
        growthRate: Math.round(growthRate * 1000) / 10,
      },
      survival: {
        score: survivalScore, status: survivalStatus,
        components: {
          cash: { score: cashScore, max: 30, runway: Math.round(estimatedRunway * 10) / 10 },
          profit: { score: profitScore, max: 30 },
          primeCost: { score: primeScore, max: 20, percentage: Math.round(primeCostPct * 10) / 10 },
          growth: { score: growthScore, max: 20 },
        },
      },
      primeCostTrend,
      insights,
      runway: {
        months: Math.round(estimatedRunway * 10) / 10,
        monthlyBurn: Math.round(monthlyBurn),
      },
    });
  } catch (error: unknown) {
    console.error("Projections API error:", error);
    return NextResponse.json(
      { error: "Failed to calculate projections" },
      { status: 500 }
    );
  }
}
