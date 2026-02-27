"use client";

import { useEffect, useState, useCallback } from "react";

interface DailySale {
  date: string;
  total_revenue: number;
  total_tax: number;
  total_tips: number;
  total_discounts: number;
  net_revenue: number;
  order_count: number;
}

interface TopItem {
  name: string;
  total_quantity: number;
  total_revenue: number;
  menu_item_id: string | null;
}

interface SalesTotals {
  total_revenue: number;
  total_tax: number;
  total_tips: number;
  total_discounts: number;
  net_revenue: number;
  total_orders: number;
  avg_order_value: number;
}

interface LaborTotals {
  total_labor_cost: number;
  total_hours: number;
  total_shifts: number;
  total_revenue: number;
  labor_percentage: number;
  sales_labor_cost: number;
  sales_hours: number;
  sales_shifts: number;
  ops_labor_cost: number;
  ops_hours: number;
  ops_shifts: number;
}

interface LaborShift {
  date: string;
  team_member_name: string;
  hours_worked: number;
  hourly_rate: number;
  total_pay: number;
  shift_type: "sales" | "ops";
  job_title: string;
  is_open?: boolean;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function toLocalDateString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return {
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end),
  };
}

function getLaborColor(pct: number): string {
  if (pct === 0) return "text-status-gray";
  if (pct <= 25) return "text-status-good";
  if (pct <= 35) return "text-status-warning";
  return "text-status-danger";
}

function getLaborBgColor(pct: number): string {
  if (pct === 0) return "bg-status-gray/10";
  if (pct <= 25) return "bg-status-good/10";
  if (pct <= 35) return "bg-status-warning/10";
  return "bg-status-danger/10";
}

function getLaborLabel(pct: number): string {
  if (pct === 0) return "no data";
  if (pct <= 25) return "great";
  if (pct <= 35) return "typical";
  return "high";
}

// Employer burden: FICA (7.65%) + FUTA (~0.6%) + FL SUTA (~2.7%) + workers comp (~1%) ≈ 12%
const EMPLOYER_BURDEN_RATE = 0.12;

export default function SalesPage() {
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [totals, setTotals] = useState<SalesTotals | null>(null);
  const [laborTotals, setLaborTotals] = useState<LaborTotals | null>(null);
  const [laborShifts, setLaborShifts] = useState<LaborShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(1);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLaborDetail, setShowLaborDetail] = useState(false);

  const getActiveDateRange = useCallback(() => {
    if (showCustomRange && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    return getDateRange(rangeDays);
  }, [rangeDays, showCustomRange, customStart, customEnd]);

  const loadDisplayData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { startDate, endDate } = getActiveDateRange();

      // Fetch display data from DB
      const salesRes = await fetch(`/api/sales?startDate=${startDate}&endDate=${endDate}`);

      if (salesRes.ok) {
        const salesData = await salesRes.json();
        setDailySales(salesData.dailySales || []);
        setTopItems(salesData.topItems || []);
        setTotals(salesData.totals || null);
      } else {
        throw new Error("Failed to load sales");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [getActiveDateRange]);

  useEffect(() => {
    loadDisplayData();
  }, [loadDisplayData]);

  const maxRevenue =
    dailySales.length > 0
      ? Math.max(...dailySales.map((d) => d.total_revenue))
      : 0;

  // Group labor shifts by team member for summary
  const teamSummary = laborShifts.reduce(
    (acc, shift) => {
      if (!acc[shift.team_member_name]) {
        acc[shift.team_member_name] = { hours: 0, pay: 0, shifts: 0, type: shift.shift_type, jobTitle: shift.job_title || "", isOnClock: false };
      }
      acc[shift.team_member_name].hours += shift.hours_worked;
      acc[shift.team_member_name].pay += shift.total_pay;
      acc[shift.team_member_name].shifts++;
      if (shift.shift_type === "sales") acc[shift.team_member_name].type = "sales";
      if (shift.job_title) acc[shift.team_member_name].jobTitle = shift.job_title;
      if (shift.is_open) acc[shift.team_member_name].isOnClock = true;
      return acc;
    },
    {} as Record<string, { hours: number; pay: number; shifts: number; type: string; jobTitle: string; isOnClock: boolean }>
  );

  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
        <h1 className="text-2xl font-display font-bold">Sales</h1>
        <p className="text-porch-cream/70 text-sm mt-1">
          Live data from Square
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Date Range Selector */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          <div className="flex items-center gap-2 flex-wrap">
            {[1, 7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={() => { setRangeDays(days); setShowCustomRange(false); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  rangeDays === days && !showCustomRange
                    ? "bg-porch-teal text-white"
                    : "bg-porch-cream text-porch-brown-light"
                }`}
              >
                {days === 1 ? "Today" : `${days}d`}
              </button>
            ))}
            <button
              onClick={() => setShowCustomRange(!showCustomRange)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                showCustomRange
                  ? "bg-porch-teal text-white"
                  : "bg-porch-cream text-porch-brown-light"
              }`}
            >
              Custom
            </button>
          </div>
          {showCustomRange && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-porch-cream-dark/30">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-porch-cream-dark/50 text-xs text-porch-brown bg-porch-cream/30"
              />
              <span className="text-xs text-porch-brown-light/50">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-porch-cream-dark/50 text-xs text-porch-brown bg-porch-cream/30"
              />
              <button
                onClick={() => { if (customStart && customEnd) loadDisplayData(); }}
                disabled={!customStart || !customEnd}
                className="px-3 py-1.5 bg-porch-teal text-white rounded-full text-xs font-semibold disabled:opacity-40"
              >
                Go
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-teal" />
            <p className="text-xs text-porch-brown-light/50">Loading...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-status-danger rounded-2xl p-4 text-sm">
            {error}
          </div>
        ) : !totals || totals.total_orders === 0 ? (
          <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
            <p className="text-porch-brown-light/60 text-sm">
              No sales data for this period.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                  Total Revenue
                </p>
                <p className="text-2xl font-bold text-porch-brown mt-1">
                  ${totals.total_revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                  Orders
                </p>
                <p className="text-2xl font-bold text-porch-brown mt-1">
                  {totals.total_orders}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                  Avg Order
                </p>
                <p className="text-2xl font-bold text-porch-brown mt-1">
                  ${totals.avg_order_value.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                  Tips
                </p>
                <p className="text-2xl font-bold text-porch-teal mt-1">
                  ${totals.total_tips.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Payroll Cost Card */}
            <div
              className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden cursor-pointer"
              onClick={() => setShowLaborDetail(!showLaborDetail)}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-porch-brown">
                    Payroll Cost
                  </h2>
                  <svg
                    className={`w-4 h-4 text-porch-brown-light/40 transition-transform ${
                      showLaborDetail ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>

                {laborTotals && laborTotals.total_labor_cost > 0 ? (
                  (() => {
                    const actualTotal = Math.round(laborTotals.total_labor_cost * (1 + EMPLOYER_BURDEN_RATE) * 100) / 100;
                    const actualSales = Math.round(laborTotals.sales_labor_cost * (1 + EMPLOYER_BURDEN_RATE) * 100) / 100;
                    const actualOps = Math.round(laborTotals.ops_labor_cost * (1 + EMPLOYER_BURDEN_RATE) * 100) / 100;
                    const actualPct = laborTotals.total_revenue > 0
                      ? Math.round((actualSales / laborTotals.total_revenue) * 1000) / 10
                      : 0;
                    return (
                    <>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-2xl font-bold text-porch-brown">
                          ${actualTotal.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-[10px] text-porch-brown-light/50 mt-0.5">
                          actual cost ({laborTotals.total_hours.toFixed(1)} hrs / {laborTotals.total_shifts} shifts)
                        </p>
                        <p className="text-[10px] text-porch-brown-light/40 mt-0.5">
                          Base wages: ${laborTotals.total_labor_cost.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })} + {Math.round(EMPLOYER_BURDEN_RATE * 100)}% employer taxes
                        </p>
                      </div>
                      <div
                        className={`w-20 h-20 rounded-full flex flex-col items-center justify-center ${getLaborBgColor(
                          actualPct
                        )}`}
                      >
                        <p
                          className={`text-xl font-bold ${getLaborColor(
                            actualPct
                          )}`}
                        >
                          {actualPct}%
                        </p>
                        <p
                          className={`text-[9px] font-medium ${getLaborColor(
                            actualPct
                          )}`}
                        >
                          {getLaborLabel(actualPct)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-porch-cream-dark/30 grid grid-cols-2 gap-3">
                      <div className="bg-porch-cream/40 rounded-xl px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                          Floor Staff
                        </p>
                        <p className="text-sm font-bold text-porch-brown mt-0.5">
                          ${actualSales.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-porch-brown-light/40">
                          wages: ${laborTotals.sales_labor_cost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-porch-brown-light/50">
                          {laborTotals.sales_hours.toFixed(1)} hrs / {laborTotals.sales_shifts} shift{laborTotals.sales_shifts !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="bg-porch-cream/40 rounded-xl px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                          Other (Baking, Training, etc.)
                        </p>
                        <p className="text-sm font-bold text-porch-brown mt-0.5">
                          ${actualOps.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-porch-brown-light/40">
                          wages: ${laborTotals.ops_labor_cost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-porch-brown-light/50">
                          {laborTotals.ops_hours.toFixed(1)} hrs / {laborTotals.ops_shifts} shift{laborTotals.ops_shifts !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    {actualPct > 0 && (
                      <div className="mt-3 pt-3 border-t border-porch-cream-dark/30">
                        <p className="text-xs text-porch-brown-light/60">
                          For every <strong>$1.00</strong> in sales,{" "}
                          <strong>
                            ${(actualPct / 100).toFixed(2)}
                          </strong>{" "}
                          goes to floor staff payroll (incl. employer taxes)
                        </p>
                      </div>
                    )}
                  </>
                    );
                  })()
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm text-porch-brown-light/50">
                      No payroll data for this period
                    </p>
                  </div>
                )}
              </div>

              {/* Expanded Detail: Who worked and how much */}
              {showLaborDetail &&
                Object.keys(teamSummary).length > 0 && (
                  <div className="border-t border-porch-cream-dark/30">
                    <div className="px-4 py-2 bg-porch-cream/50">
                      <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                        Team Breakdown
                      </p>
                    </div>
                    <div className="divide-y divide-porch-cream-dark/20">
                      {Object.entries(teamSummary)
                        .sort(([, a], [, b]) => b.pay - a.pay)
                        .map(([name, data]) => (
                          <div
                            key={name}
                            className="px-4 py-2.5 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="text-xs font-medium text-porch-brown">
                                  {name}
                                  {data.isOnClock && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] text-green-600 font-medium">
                                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                      on clock
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] text-porch-brown-light/50">
                                  {data.hours.toFixed(1)} hrs — {data.shifts}{" "}
                                  shift{data.shifts !== 1 ? "s" : ""}
                              </p>
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                data.type !== "sales"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-porch-teal/10 text-porch-teal"
                              }`}>
                                {data.jobTitle || (data.type === "sales" ? "Floor" : "Other")}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-porch-brown">
                                ${(data.pay * (1 + EMPLOYER_BURDEN_RATE)).toFixed(2)}
                              </span>
                              <p className="text-[9px] text-porch-brown-light/40">
                                wages: ${data.pay.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Daily Breakdown */}
            <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                <h2 className="text-sm font-semibold text-porch-brown">
                  Daily Breakdown
                </h2>
              </div>
              <div className="divide-y divide-porch-cream-dark/20">
                {dailySales.map((day) => (
                  <div key={day.date} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-porch-brown">
                        {formatDate(day.date)}
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-porch-brown">
                          ${day.total_revenue.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-porch-brown-light/50 ml-2">
                          {day.order_count} orders
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-porch-cream rounded-full h-2">
                      <div
                        className="bg-porch-teal rounded-full h-2 transition-all"
                        style={{
                          width: `${
                            maxRevenue > 0
                              ? (day.total_revenue / maxRevenue) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Selling Items */}
            {topItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                  <h2 className="text-sm font-semibold text-porch-brown">
                    Top Sellers
                  </h2>
                </div>
                <div className="divide-y divide-porch-cream-dark/20">
                  {topItems.map((item, i) => (
                    <div
                      key={`${item.name}-${i}`}
                      className="px-4 py-2.5 flex items-center gap-3"
                    >
                      <span className="text-xs font-bold text-porch-brown-light/40 w-5 text-right">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-porch-brown truncate">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-porch-brown-light/50">
                          {item.total_quantity} sold
                        </p>
                      </div>
                      <span className="text-sm font-bold text-porch-brown">
                        ${item.total_revenue.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
