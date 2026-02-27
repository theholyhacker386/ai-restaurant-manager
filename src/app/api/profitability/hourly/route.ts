import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
// Default business hours — will be overridden by restaurant settings
const BUSINESS_HOURS: Record<string, { open: string; close: string } | null> = {
  "0": { open: "08:00", close: "18:00" },
  "1": null,
  "2": { open: "08:00", close: "18:00" },
  "3": { open: "08:00", close: "18:00" },
  "4": { open: "08:00", close: "18:00" },
  "5": { open: "08:00", close: "18:00" },
  "6": { open: "08:00", close: "18:00" },
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Florida employer burden rate: the TRUE cost of an employee is their wage PLUS
 * employer-side taxes (FICA 7.65%, FUTA ~0.6%, FL SUTA ~2.7%, workers comp ~1.5%).
 * Total: approximately 12% on top of the base hourly rate.
 */
const LABOR_BURDEN_MULTIPLIER = 1.12;

/**
 * GET /api/profitability/hourly
 *
 * Returns hourly profit/loss analysis for a date range.
 * Combines: hourly sales revenue + labor shifts + allocated fixed costs.
 *
 * Query params:
 *   startDate, endDate  (YYYY-MM-DD)
 *   mode = "average" (default) | "today"
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "average";
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  let startDate = searchParams.get("startDate") || todayStr;
  let endDate = searchParams.get("endDate") || todayStr;

  if (mode === "today") {
    startDate = todayStr;
    endDate = todayStr;
  }

  try {
    const { sql, restaurantId } = await getTenantDb();

    // ─── 1. Hourly sales revenue ───
    const hourlySales = await sql`
      SELECT hour,
        SUM(net_revenue) as total_net_revenue,
        SUM(total_revenue) as total_gross_revenue,
        SUM(total_tips) as total_tips,
        SUM(order_count) as total_orders,
        COUNT(DISTINCT date) as days_with_sales
      FROM hourly_sales
      WHERE date >= ${startDate} AND date <= ${endDate}
        AND restaurant_id = ${restaurantId}
      GROUP BY hour
      ORDER BY hour
    ` as any[];

    // ─── 2. Labor cost per hour ───
    // Pull individual shifts and distribute their cost across the hours they span
    const laborShifts = await sql`
      SELECT start_at, end_at,
        CASE WHEN hourly_rate = 0 THEN 12 ELSE hourly_rate END as hourly_rate,
        total_pay, team_member_name, shift_type, date
      FROM labor_shifts
      WHERE date >= ${startDate} AND date <= ${endDate}
        AND start_at IS NOT NULL
        AND restaurant_id = ${restaurantId}
    ` as any[];

    // For "today" mode, also get employees currently clocked in (no end_at)
    let activeShifts: any[] = [];
    if (mode === "today") {
      activeShifts = await sql`
        SELECT start_at, end_at,
          CASE WHEN hourly_rate = 0 THEN 12 ELSE hourly_rate END as hourly_rate,
          team_member_name, team_member_id, shift_type
        FROM labor_shifts
        WHERE date = ${todayStr} AND end_at IS NULL AND start_at IS NOT NULL
          AND restaurant_id = ${restaurantId}
      ` as any[];
    }

    // Distribute labor cost across hours, tracking employee headcount per hour-day
    const laborByHour: Record<number, number> = {};
    // Track unique date-hour combos that had employees to compute average headcount
    const employeeHourDays: Record<number, Set<string>> = {};
    for (let h = 0; h < 24; h++) {
      laborByHour[h] = 0;
      employeeHourDays[h] = new Set();
    }

    // Count actual OPEN days (days with any shifts) — not all calendar days
    const openDaysResult = await sql`
      SELECT COUNT(DISTINCT date) as open_days
      FROM labor_shifts
      WHERE date >= ${startDate} AND date <= ${endDate}
        AND start_at IS NOT NULL
        AND restaurant_id = ${restaurantId}
    ` as any[];
    const openDays = Math.max(1, Number(openDaysResult[0]?.open_days || 1));

    for (const shift of laborShifts) {
      distributeShiftCost(shift, laborByHour, employeeHourDays);
    }

    // Add active (still clocked in) shifts for "today" mode
    const activeEmployees: any[] = [];
    for (const shift of activeShifts) {
      const nowET = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const fakeEnd = nowET.toISOString();
      const startTime = new Date(shift.start_at);
      const hoursWorkedSoFar = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      const costSoFar = hoursWorkedSoFar * (shift.hourly_rate || 0);

      distributeShiftCost({ ...shift, end_at: fakeEnd, date: todayStr }, laborByHour, employeeHourDays);

      activeEmployees.push({
        name: shift.team_member_name || "Team Member",
        clockedInAt: shift.start_at,
        hoursWorked: Math.round(hoursWorkedSoFar * 100) / 100,
        hourlyRate: shift.hourly_rate || 0,
        runningCost: Math.round(costSoFar * 100) / 100,
      });
    }

    // ─── 3. Fixed cost allocation ───
    // Get monthly recurring overhead expenses (rent, utilities, insurance, etc.)
    // We look at expenses in the "occupancy", "utilities", "overhead", "admin",
    // "technology", "regulatory" categories from the last 3 months to get a monthly average
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;

    const fixedExpenses = await sql`
      SELECT ec.name as category_name, ec.type as category_type, SUM(e.amount) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE ec.type IN ('occupancy', 'utilities', 'overhead', 'admin', 'technology', 'regulatory')
        AND ec.id NOT IN ('cat-sales-tax', 'cat-federal-tax')
        AND e.date >= ${threeMonthStr}
        AND e.restaurant_id = ${restaurantId}
      GROUP BY ec.name, ec.type
      ORDER BY total DESC
    ` as any[];

    // Calculate months in range for averaging
    const monthsOfExpenseData = Math.max(1, Math.round(
      (now.getTime() - new Date(threeMonthStr).getTime()) / (1000 * 60 * 60 * 24 * 30)
    ));

    // Total monthly fixed costs
    const monthlyFixedByCategory: { name: string; type: string; monthly: number }[] = [];
    let totalMonthlyFixed = 0;
    for (const exp of fixedExpenses) {
      const monthly = Math.round((exp.total / monthsOfExpenseData) * 100) / 100;
      monthlyFixedByCategory.push({
        name: exp.category_name,
        type: exp.category_type,
        monthly,
      });
      totalMonthlyFixed += monthly;
    }

    // Calculate total business hours in a month
    // Tue-Sat = 10hrs each (8am-6pm), Sun = 5hrs (12pm-5pm) = 55 hrs/week
    // ~4.33 weeks/month = ~238 hours/month
    const weeklyHours = getWeeklyBusinessHours();
    const monthlyBusinessHours = weeklyHours * 4.33;
    const fixedCostPerHour = monthlyBusinessHours > 0 ? totalMonthlyFixed / monthlyBusinessHours : 0;

    // Per-category hourly cost
    const fixedCostBreakdown = monthlyFixedByCategory.map((cat) => ({
      name: cat.name,
      type: cat.type,
      monthlyAmount: cat.monthly,
      hourlyAmount: Math.round((cat.monthly / monthlyBusinessHours) * 100) / 100,
    }));

    // ─── 4. Build hourly P&L ───
    const salesByHour: Record<number, any> = {};
    for (const row of hourlySales) {
      salesByHour[row.hour] = row;
    }

    // Determine which hours to show based on business hours
    const hoursToShow = getOperatingHoursRange();

    const hourlyBreakdown: any[] = [];
    let totalRevenue = 0;
    let totalLabor = 0;
    let totalFixed = 0;
    let totalProfit = 0;
    let bestHour: any = null;
    let worstHour: any = null;

    for (const h of hoursToShow) {
      const sales = salesByHour[h];

      // For "today" mode, show actual totals not averages
      // For average mode, divide by actual open days (not calendar days)
      const revenue = mode === "today"
        ? Number(sales?.total_net_revenue || 0)
        : Number(sales?.total_net_revenue || 0) / openDays;

      const avgOrders = mode === "today"
        ? Number(sales?.total_orders || 0)
        : Number(sales?.total_orders || 0) / openDays;

      // Labor cost with employer burden (taxes, FICA, etc.)
      let rawLabor = mode === "today"
        ? laborByHour[h] || 0
        : (laborByHour[h] || 0) / openDays;

      // If there are sales but no one is clocked in, the owner must be working.
      // Fill in at $12/hr so every working hour is properly costed.
      const OWNER_IMPUTED_RATE = 12;
      const hasRevenue = revenue > 0;
      const hasLabor = rawLabor > 0;
      let ownerImputed = false;
      if (hasRevenue && !hasLabor) {
        rawLabor = OWNER_IMPUTED_RATE;
        ownerImputed = true;
      }

      const labor = rawLabor * LABOR_BURDEN_MULTIPLIER;

      // Average number of employees working this hour
      let totalEmployeeAppearances = employeeHourDays[h]?.size || 0;
      if (ownerImputed && mode === "today") totalEmployeeAppearances += 1;
      const avgEmployees = mode === "today"
        ? totalEmployeeAppearances
        : Math.max(totalEmployeeAppearances / openDays, hasRevenue && !hasLabor ? 1 : 0);

      const fixed = fixedCostPerHour;
      const profit = revenue - labor - fixed;

      const entry = {
        hour: h,
        hourLabel: formatHour(h),
        revenue: Math.round(revenue * 100) / 100,
        laborCost: Math.round(labor * 100) / 100,
        fixedCost: Math.round(fixed * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        orderCount: Math.round(avgOrders * 10) / 10,
        avgEmployees: Math.round(avgEmployees * 10) / 10,
        isProfitable: profit >= 0,
      };

      hourlyBreakdown.push(entry);

      totalRevenue += entry.revenue;
      totalLabor += entry.laborCost;
      totalFixed += entry.fixedCost;
      totalProfit += entry.profit;

      if (!bestHour || entry.profit > bestHour.profit) bestHour = entry;
      if (!worstHour || entry.profit < worstHour.profit) worstHour = entry;
    }

    // ─── 5. "Needs Review" — find consistently unprofitable hours ───
    // Look at the last 10 weeks of data for each hour
    const tenWeeksAgo = new Date();
    tenWeeksAgo.setDate(tenWeeksAgo.getDate() - 70);
    const tenWeeksStr = `${tenWeeksAgo.getFullYear()}-${String(tenWeeksAgo.getMonth() + 1).padStart(2, "0")}-${String(tenWeeksAgo.getDate()).padStart(2, "0")}`;

    const weeklyHourlySales = await sql`
      SELECT hour, date, net_revenue
      FROM hourly_sales
      WHERE date >= ${tenWeeksStr}
        AND restaurant_id = ${restaurantId}
      ORDER BY hour, date
    ` as any[];

    // Group weekly hourly data and check against costs
    const hourlyWeeklyData: Record<number, { profitable: number; unprofitable: number; total: number }> = {};
    for (const row of weeklyHourlySales) {
      const h = row.hour;
      if (!hourlyWeeklyData[h]) hourlyWeeklyData[h] = { profitable: 0, unprofitable: 0, total: 0 };
      hourlyWeeklyData[h].total++;
      // Compare against average labor + fixed cost for that hour
      const avgLaborForHour = (laborByHour[h] || 0) / openDays;
      if (row.net_revenue >= avgLaborForHour + fixedCostPerHour) {
        hourlyWeeklyData[h].profitable++;
      } else {
        hourlyWeeklyData[h].unprofitable++;
      }
    }

    const needsReview = Object.entries(hourlyWeeklyData)
      .filter(([, data]) => data.total >= 4 && data.unprofitable / data.total > 0.6)
      .map(([hour, data]) => ({
        hour: Number(hour),
        hourLabel: formatHour(Number(hour)),
        unprofitableCount: data.unprofitable,
        totalCount: data.total,
        message: `${formatHour(Number(hour))} has lost money ${data.unprofitable} out of the last ${data.total} days tracked`,
      }))
      .sort((a, b) => b.unprofitableCount / b.totalCount - a.unprofitableCount / a.totalCount);

    // ─── 6. Summary ───
    const operatingHours = hoursToShow.length;
    const avgProfitPerHour = operatingHours > 0 ? totalProfit / operatingHours : 0;

    // Break-even per hour is a FIXED number based on monthly costs / monthly hours open.
    // It does NOT change based on the date range selected — it represents "how much revenue
    // you need each hour just to cover your costs."
    // Get average monthly labor — prefer bank statement payroll over Square data
    const bankLaborResult = await sql`
      SELECT COALESCE(SUM(e.amount), 0) as total_labor
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE ec.type = 'labor' AND e.date >= ${threeMonthStr}
        AND e.restaurant_id = ${restaurantId}
    ` as any[];
    const squareLaborResult = await sql`
      SELECT COALESCE(SUM(total_labor_cost), 0) as total_labor
      FROM daily_labor
      WHERE date >= ${threeMonthStr}
        AND restaurant_id = ${restaurantId}
    ` as any[];
    const bankLabor = Number(bankLaborResult[0]?.total_labor || 0);
    const squareLabor = Number(squareLaborResult[0]?.total_labor || 0);
    const totalLaborLast3Mo = bankLabor > 0 ? bankLabor : squareLabor;
    const avgMonthlyLabor = totalLaborLast3Mo / Math.max(monthsOfExpenseData, 1);
    const monthlyBreakEvenTotal = totalMonthlyFixed + avgMonthlyLabor;
    const breakEvenPerHour = Math.round((monthlyBreakEvenTotal / monthlyBusinessHours) * 100) / 100;

    return NextResponse.json({
      mode,
      startDate,
      endDate,
      daysInRange: openDays,
      summary: {
        avgProfitPerHour: Math.round(avgProfitPerHour * 100) / 100,
        bestHour: bestHour ? { hour: bestHour.hourLabel, profit: bestHour.profit } : null,
        worstHour: worstHour ? { hour: worstHour.hourLabel, profit: worstHour.profit } : null,
        totalOperatingHours: operatingHours,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalLabor: Math.round(totalLabor * 100) / 100,
        totalFixed: Math.round(totalFixed * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        breakEvenPerHour,
      },
      hourlyBreakdown,
      fixedCostBreakdown,
      fixedCostPerHour: Math.round(fixedCostPerHour * 100) / 100,
      monthlyFixedTotal: Math.round(totalMonthlyFixed * 100) / 100,
      monthlyBusinessHours: Math.round(monthlyBusinessHours * 10) / 10,
      weeklyBusinessHours: weeklyHours,
      needsReview,
      activeEmployees: mode === "today" ? activeEmployees : undefined,
    });
  } catch (error: any) {
    console.error("Hourly profitability error:", error);
    return NextResponse.json({ error: error.message || "Failed to calculate hourly profitability" }, { status: 500 });
  }
}

/**
 * Distribute a shift's labor cost across the hours it spans.
 * e.g. a shift from 7:30am to 3:15pm puts partial cost into 7am, full cost into 8-2pm, partial into 3pm.
 * Also tracks employee-hour-day entries for headcount calculation.
 */
function distributeShiftCost(
  shift: { start_at: string; end_at: string; hourly_rate: number; date?: string; team_member_name?: string },
  laborByHour: Record<number, number>,
  employeeHourDays?: Record<number, Set<string>>
) {
  if (!shift.start_at || !shift.end_at) return;

  const start = new Date(new Date(shift.start_at).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const end = new Date(new Date(shift.end_at).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const rate = shift.hourly_rate || 0;
  // Use date + team member name as a unique key to count employees per hour
  const empKey = `${shift.date || start.toISOString().slice(0, 10)}-${shift.team_member_name || "unknown"}`;

  if (end <= start) return;

  // Helper to mark an employee working in an hour
  function markEmployee(h: number) {
    if (employeeHourDays && employeeHourDays[h]) {
      employeeHourDays[h].add(empKey);
    }
  }

  // Walk through each hour the shift overlaps
  const startHour = start.getHours();
  const endHour = end.getHours();
  const startMinFraction = start.getMinutes() / 60;

  // If shift is within one hour
  if (startHour === endHour && start.getDate() === end.getDate()) {
    const fraction = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    laborByHour[startHour] = (laborByHour[startHour] || 0) + fraction * rate;
    markEmployee(startHour);
    return;
  }

  // First partial hour
  const firstHourFraction = 1 - startMinFraction;
  laborByHour[startHour] = (laborByHour[startHour] || 0) + firstHourFraction * rate;
  markEmployee(startHour);

  // Full hours in between (same day only for simplicity)
  for (let h = startHour + 1; h < (start.getDate() === end.getDate() ? endHour : 24); h++) {
    laborByHour[h] = (laborByHour[h] || 0) + rate;
    markEmployee(h);
  }

  // Last partial hour
  if (start.getDate() === end.getDate()) {
    const endMinFraction = end.getMinutes() / 60;
    if (endMinFraction > 0) {
      laborByHour[endHour] = (laborByHour[endHour] || 0) + endMinFraction * rate;
      markEmployee(endHour);
    }
  }
}

/** Calculate total business hours per week from BUSINESS_HOURS config */
function getWeeklyBusinessHours(): number {
  let total = 0;
  for (let day = 0; day < 7; day++) {
    const hours = BUSINESS_HOURS[day];
    if (!hours) continue;
    const [openH, openM] = hours.open.split(":").map(Number);
    const [closeH, closeM] = hours.close.split(":").map(Number);
    total += (closeH + closeM / 60) - (openH + openM / 60);
  }
  return total;
}

/** Get the range of hours to display (union of all operating hours) */
function getOperatingHoursRange(): number[] {
  let minHour = 23;
  let maxHour = 0;
  for (let day = 0; day < 7; day++) {
    const hours = BUSINESS_HOURS[day];
    if (!hours) continue;
    const openH = parseInt(hours.open.split(":")[0]);
    const closeH = parseInt(hours.close.split(":")[0]);
    if (openH < minHour) minHour = openH;
    if (closeH > maxHour) maxHour = closeH;
  }
  const range: number[] = [];
  for (let h = minHour; h <= maxHour; h++) range.push(h);
  return range;
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}
