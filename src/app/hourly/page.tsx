"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";
import { useSquareSync } from "@/hooks/useSquareSync";

/* eslint-disable @typescript-eslint/no-explicit-any */

type DatePreset = "today" | "week" | "month" | "lastMonth" | "last3" | "lastYear" | "custom";

function getDateRange(preset: DatePreset, customStart?: string, customEnd?: string) {
  if (preset === "custom" && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }

  const now = new Date();
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case "today":
      break;
    case "week": {
      const dayOfWeek = now.getDay();
      start.setDate(now.getDate() - dayOfWeek);
      break;
    }
    case "month":
      start.setDate(1);
      break;
    case "lastMonth":
      start.setMonth(now.getMonth() - 1, 1);
      end.setDate(0);
      break;
    case "last3":
      start.setMonth(now.getMonth() - 3);
      break;
    case "lastYear":
      start.setFullYear(now.getFullYear() - 1);
      start.setDate(start.getDate() + 1);
      break;
    case "custom":
      // Fallback if no custom dates provided
      start.setDate(1);
      break;
  }

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

export default function HourlyPage() {
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"chart" | "costs" | "review">("chart");
  const [chartMode, setChartMode] = useState<"profit" | "stacked">("profit");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { startDate, endDate } = getDateRange(datePreset, customStart, customEnd);
    const mode = datePreset === "today" ? "today" : "average";

    try {
      const res = await fetch(
        `/api/profitability/hourly?startDate=${startDate}&endDate=${endDate}&mode=${mode}`
      );
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error("Failed to load hourly data:", err);
    }
    setLoading(false);
  }, [datePreset, customStart, customEnd]);

  // Auto-sync Square data on page load if stale
  const { syncing } = useSquareSync({ onSyncComplete: fetchData });

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 2 minutes when viewing "Today"
  useEffect(() => {
    if (datePreset !== "today") return;
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [datePreset, fetchData]);

  const profitColor = (val: number) =>
    val >= 0 ? "text-status-good" : "text-status-danger";

  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
        <h1 className="text-2xl font-display font-bold">Hourly Profitability</h1>
        <p className="text-porch-cream/70 text-sm mt-1">
          Revenue vs. costs for every hour you&apos;re open
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Sync indicator */}
        {syncing && (
          <div className="bg-porch-teal/10 border border-porch-teal/20 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-porch-teal" />
            <p className="text-xs text-porch-teal font-medium">Syncing with Square...</p>
          </div>
        )}

        {/* Date Range + Tabs */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(["today", "week", "month", "lastMonth", "last3", "lastYear", "custom"] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => setDatePreset(preset)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  datePreset === preset
                    ? "bg-porch-teal text-white"
                    : "bg-porch-cream text-porch-brown-light"
                }`}
              >
                {preset === "today" && "Today"}
                {preset === "week" && "This Week"}
                {preset === "month" && "This Month"}
                {preset === "lastMonth" && "Last Month"}
                {preset === "last3" && "Last 3 Mo"}
                {preset === "lastYear" && "Last Year"}
                {preset === "custom" && "Custom"}
              </button>
            ))}
          </div>

          {/* Custom date picker */}
          {datePreset === "custom" && (
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
                onClick={() => { if (customStart && customEnd) fetchData(); }}
                disabled={!customStart || !customEnd}
                className="px-3 py-1.5 bg-porch-teal text-white rounded-full text-xs font-semibold disabled:opacity-40"
              >
                Go
              </button>
            </div>
          )}

          <div className="flex gap-1 mt-3 bg-porch-cream rounded-lg p-1">
            {(["chart", "costs", "review"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                  activeTab === tab
                    ? "bg-white text-porch-brown shadow-sm"
                    : "text-porch-brown-light"
                }`}
              >
                {tab === "chart" && "By Hour"}
                {tab === "costs" && "Cost Breakdown"}
                {tab === "review" && "Needs Review"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-teal" />
          </div>
        ) : !data ? (
          <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
            <p className="text-porch-brown-light/60 text-sm">
              No data available. Make sure you&apos;ve synced Square sales data.
            </p>
          </div>
        ) : (
          <>
            {/* Date range context for longer periods */}
            {data.daysInRange > 1 && (
              <div className="text-center">
                <p className="text-[10px] text-porch-brown-light/40">
                  Showing averages across {data.daysInRange} open days ({data.startDate} to {data.endDate})
                </p>
              </div>
            )}

            {/* ─── SUMMARY CARDS ─── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                  Avg Profit / Hour
                </p>
                <p className={`text-2xl font-bold mt-1 ${profitColor(data.summary.avgProfitPerHour)}`}>
                  ${data.summary.avgProfitPerHour.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                  Break-Even / Hour
                </p>
                <p className="text-2xl font-bold mt-1 text-porch-brown">
                  ${data.summary.breakEvenPerHour.toFixed(2)}
                </p>
                <p className="text-[10px] text-porch-brown-light/50">min revenue needed</p>
              </div>
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                  Best Hour
                </p>
                {data.summary.bestHour ? (
                  <>
                    <p className="text-xl font-bold mt-1 text-status-good">
                      {data.summary.bestHour.hour}
                    </p>
                    <p className="text-[10px] text-status-good font-semibold">
                      +${data.summary.bestHour.profit.toFixed(2)} profit
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-porch-brown-light/50 mt-1">No data</p>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                  Worst Hour
                </p>
                {data.summary.worstHour ? (
                  <>
                    <p className="text-xl font-bold mt-1 text-status-danger">
                      {data.summary.worstHour.hour}
                    </p>
                    <p className="text-[10px] text-status-danger font-semibold">
                      ${data.summary.worstHour.profit.toFixed(2)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-porch-brown-light/50 mt-1">No data</p>
                )}
              </div>
            </div>

            {/* ─── TODAY: Active employees ─── */}
            {datePreset === "today" && data.activeEmployees && data.activeEmployees.length > 0 && (
              <div className="bg-porch-teal/5 rounded-2xl border border-porch-teal/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-status-good animate-pulse" />
                  <h2 className="text-sm font-semibold text-porch-brown">Currently Clocked In</h2>
                </div>
                <div className="space-y-2">
                  {data.activeEmployees.map((emp: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold text-porch-brown">{emp.name}</p>
                        <p className="text-[10px] text-porch-brown-light/50">
                          {emp.hoursWorked}h @ ${emp.hourlyRate}/hr
                        </p>
                      </div>
                      <p className="text-sm font-bold text-porch-brown">
                        ${emp.runningCost.toFixed(2)}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t border-porch-teal/10">
                    <span className="text-[10px] font-semibold text-porch-brown-light/60">
                      Total running labor cost
                    </span>
                    <span className="text-sm font-bold text-porch-brown">
                      ${data.activeEmployees.reduce((s: number, e: any) => s + e.runningCost, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ─── CHART TAB ─── */}
            {activeTab === "chart" && (
              <>
                {/* Chart mode toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setChartMode("profit")}
                    className={`px-3 py-1 rounded-full text-[10px] font-semibold ${
                      chartMode === "profit"
                        ? "bg-porch-brown text-white"
                        : "bg-white text-porch-brown-light border border-porch-cream-dark/50"
                    }`}
                  >
                    Profit / Loss
                  </button>
                  <button
                    onClick={() => setChartMode("stacked")}
                    className={`px-3 py-1 rounded-full text-[10px] font-semibold ${
                      chartMode === "stacked"
                        ? "bg-porch-brown text-white"
                        : "bg-white text-porch-brown-light border border-porch-cream-dark/50"
                    }`}
                  >
                    Revenue vs Costs
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                  <h2 className="text-sm font-semibold text-porch-brown mb-4">
                    {chartMode === "profit" ? "Profit by Hour" : "Revenue vs Costs by Hour"}
                  </h2>

                  <div className="w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartMode === "profit" ? (
                        <BarChart data={data.hourlyBreakdown} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                          <XAxis
                            dataKey="hourLabel"
                            tick={{ fontSize: 10 }}
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={40}
                          />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Profit"]}
                            labelStyle={{ fontSize: 12, fontWeight: "bold" }}
                            contentStyle={{ fontSize: 11 }}
                          />
                          <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
                          <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                            {data.hourlyBreakdown.map((entry: any, index: number) => (
                              <Cell
                                key={index}
                                fill={entry.profit >= 0 ? "#2A9D8F" : "#E76F51"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      ) : (
                        <BarChart data={data.hourlyBreakdown} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                          <XAxis
                            dataKey="hourLabel"
                            tick={{ fontSize: 10 }}
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={40}
                          />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            formatter={(value: any, name: any) => [
                              `$${Number(value).toFixed(2)}`,
                              name === "revenue" ? "Revenue" : name === "laborCost" ? "Labor" : "Fixed Costs",
                            ]}
                            labelStyle={{ fontSize: 12, fontWeight: "bold" }}
                            contentStyle={{ fontSize: 11 }}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: 10 }}
                            formatter={(value: string) =>
                              value === "revenue" ? "Revenue" : value === "laborCost" ? "Labor" : "Fixed Costs"
                            }
                          />
                          <Bar dataKey="revenue" stackId="a" fill="#2A9D8F" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="laborCost" stackId="b" fill="#E76F51" />
                          <Bar dataKey="fixedCost" stackId="b" fill="#E9C46A" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Hourly detail list */}
                <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                    <h2 className="text-sm font-semibold text-porch-brown">Hour-by-Hour Detail</h2>
                  </div>
                  <div className="divide-y divide-porch-cream-dark/20">
                    {data.hourlyBreakdown.map((h: any) => (
                      <div key={h.hour} className="px-4 py-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-porch-brown w-12">{h.hourLabel}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-porch-brown-light/50">
                                {h.orderCount} {datePreset === "today" ? "orders" : "avg orders"}
                              </span>
                            </div>
                          </div>
                          <span className={`text-sm font-bold ${profitColor(h.profit)}`}>
                            {h.profit >= 0 ? "+" : ""}${h.profit.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 text-[10px] text-porch-brown-light/50">
                          <span>Rev: ${h.revenue.toFixed(2)}</span>
                          <span>Labor: ${h.laborCost.toFixed(2)}{h.avgEmployees > 0 ? ` (${h.avgEmployees} staff)` : ""}</span>
                          <span>Fixed: ${h.fixedCost.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ─── COST BREAKDOWN TAB ─── */}
            {activeTab === "costs" && (
              <>
                {/* Fixed overhead per hour */}
                <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                    <h2 className="text-sm font-semibold text-porch-brown">Fixed Cost Per Hour</h2>
                    <p className="text-[10px] text-porch-brown-light/50 mt-0.5">
                      Monthly expenses spread across {data.weeklyBusinessHours} business hours/week
                    </p>
                  </div>
                  <div className="divide-y divide-porch-cream-dark/20">
                    {data.fixedCostBreakdown.map((cat: any, i: number) => (
                      <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-porch-brown">{cat.name}</p>
                          <p className="text-[10px] text-porch-brown-light/50">
                            ${cat.monthlyAmount.toFixed(2)}/month
                          </p>
                        </div>
                        <p className="text-sm font-bold text-porch-brown">
                          ${cat.hourlyAmount.toFixed(2)}/hr
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="px-4 py-3 bg-porch-cream/50 border-t border-porch-cream-dark/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-porch-brown">Total Fixed Overhead</span>
                      <span className="text-sm font-bold text-porch-brown">
                        ${data.fixedCostPerHour.toFixed(2)}/hr
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-porch-brown-light/50">Monthly total</span>
                      <span className="text-[10px] font-semibold text-porch-brown-light">
                        ${data.monthlyFixedTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Break-even insight */}
                <div className="bg-status-warning/5 rounded-2xl border border-status-warning/20 p-4">
                  <h3 className="text-sm font-semibold text-porch-brown mb-1">
                    Break-Even Threshold
                  </h3>
                  <p className="text-2xl font-bold text-status-warning">
                    ${data.summary.breakEvenPerHour.toFixed(2)}/hr
                  </p>
                  <p className="text-xs text-porch-brown-light/60 mt-2">
                    You need to make at least this much in revenue every hour just to cover labor + fixed costs.
                    Anything below this means that hour is losing money.
                  </p>
                </div>

                {/* Daily totals summary */}
                <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                  <h2 className="text-sm font-semibold text-porch-brown mb-3">
                    {datePreset === "today" ? "Today So Far" : "Period Totals"}
                  </h2>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-porch-brown-light/60">Total Revenue</span>
                      <span className="font-bold text-porch-brown">${data.summary.totalRevenue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-porch-brown-light/60">Total Labor Cost</span>
                      <span className="font-bold text-status-danger">-${data.summary.totalLabor.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-porch-brown-light/60">Total Fixed Costs</span>
                      <span className="font-bold text-status-danger">-${data.summary.totalFixed.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-2 border-t border-porch-cream-dark/30">
                      <span className="font-semibold text-porch-brown">Net Profit</span>
                      <span className={`font-bold ${profitColor(data.summary.totalProfit)}`}>
                        {data.summary.totalProfit >= 0 ? "+" : ""}${data.summary.totalProfit.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── NEEDS REVIEW TAB ─── */}
            {activeTab === "review" && (
              <>
                {data.needsReview.length === 0 ? (
                  <div className="bg-status-good/5 rounded-2xl border border-status-good/20 p-8 text-center">
                    <div className="text-3xl mb-3">&#x2705;</div>
                    <p className="text-sm font-medium text-porch-brown">Looking Good!</p>
                    <p className="text-xs text-porch-brown-light/60 mt-2">
                      No hours are consistently losing money. Keep it up!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-status-danger/5 rounded-2xl border border-status-danger/20 p-4">
                      <h2 className="text-sm font-semibold text-status-danger mb-1">
                        Hours That Need Attention
                      </h2>
                      <p className="text-xs text-porch-brown-light/60">
                        These hours have lost money more often than not over the tracked period.
                        Consider adjusting staffing, hours, or finding ways to bring in more customers during these times.
                      </p>
                    </div>

                    {data.needsReview.map((item: any, i: number) => {
                      const pctBad = Math.round((item.unprofitableCount / item.totalCount) * 100);
                      return (
                        <div key={i} className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-lg font-bold text-porch-brown">{item.hourLabel}</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-status-danger/10 text-status-danger">
                              Losing {pctBad}% of the time
                            </span>
                          </div>
                          <p className="text-xs text-porch-brown-light/60">{item.message}</p>

                          {/* Visual: how often this hour loses money */}
                          <div className="mt-3 flex gap-0.5">
                            {Array.from({ length: item.totalCount }).map((_, j) => (
                              <div
                                key={j}
                                className={`flex-1 h-2 rounded-full ${
                                  j < item.unprofitableCount ? "bg-status-danger/60" : "bg-status-good/60"
                                }`}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between mt-1 text-[9px] text-porch-brown-light/40">
                            <span>{item.unprofitableCount} unprofitable</span>
                            <span>{item.totalCount - item.unprofitableCount} profitable</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
