"use client";

import { useEffect, useState, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type DatePreset = "week" | "month" | "lastMonth" | "90d";

function getDateRange(preset: DatePreset) {
  const now = new Date();
  const end = new Date();
  const start = new Date();

  switch (preset) {
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
    case "90d":
      start.setDate(now.getDate() - 90);
      break;
  }

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getRPLHColor(value: number) {
  if (value >= 50) return "text-status-good";
  if (value >= 40) return "text-status-warning";
  return "text-status-danger";
}

function getRPLHBg(value: number) {
  if (value >= 50) return "bg-status-good";
  if (value >= 40) return "bg-status-warning";
  return "bg-status-danger";
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LaborPage() {
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [laborData, setLaborData] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "employees" | "schedule" | "forecast">("overview");
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({ date: "", name: "", adjustmentPct: 30 });
  const [savingEvent, setSavingEvent] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { startDate, endDate } = getDateRange(datePreset);

    try {
      const analysisRes = await fetch(`/api/labor/analysis?startDate=${startDate}&endDate=${endDate}`);

      if (analysisRes.ok) {
        const data = await analysisRes.json();
        setLaborData(data);
        setShifts(data.shifts || []);
      }
    } catch (err) {
      console.error("Failed to load labor data:", err);
    }
    setLoading(false);
  }, [datePreset]);

  const fetchForecast = useCallback(async () => {
    setForecastLoading(true);
    try {
      const res = await fetch("/api/labor/forecast");
      if (res.ok) {
        const data = await res.json();
        setForecastData(data);
      }
    } catch (err) {
      console.error("Failed to load forecast:", err);
    }
    setForecastLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load forecast on mount (for alerts on Overview) and when switching to Forecast tab
  useEffect(() => {
    if (!forecastData) {
      fetchForecast();
    }
  }, [forecastData, fetchForecast]);

  const handleAddEvent = async () => {
    if (!eventForm.date || !eventForm.name) return;
    setSavingEvent(true);
    try {
      const res = await fetch("/api/labor/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: eventForm.date,
          name: eventForm.name,
          adjustmentPct: eventForm.adjustmentPct,
        }),
      });
      if (res.ok) {
        setShowEventModal(false);
        setEventForm({ date: "", name: "", adjustmentPct: 30 });
        setForecastData(null);
        fetchForecast();
      }
    } catch (err) {
      console.error("Failed to add event:", err);
    }
    setSavingEvent(false);
  };

  const handleDeleteEvent = async (eventDate: string) => {
    // Find the event in forecast data to get its details, then refetch
    try {
      // We need to find events - fetch them and delete by matching
      const eventsRes = await fetch("/api/labor/events");
      if (eventsRes.ok) {
        const { events } = await eventsRes.json();
        const evt = events.find((e: any) => e.date === eventDate);
        if (evt) {
          await fetch(`/api/labor/events?id=${evt.id}`, { method: "DELETE" });
          setForecastData(null);
          fetchForecast();
        }
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  // Group shifts by employee
  const employeeStats = shifts.reduce((acc: Record<string, any>, shift: any) => {
    const name = shift.team_member_name || "Unknown";
    if (!acc[name]) {
      acc[name] = {
        name,
        totalHours: 0,
        totalPay: 0,
        shiftCount: 0,
        avgHourlyRate: 0,
        dates: new Set<string>(),
      };
    }
    acc[name].totalHours += shift.hours_worked || 0;
    acc[name].totalPay += shift.total_pay || 0;
    acc[name].shiftCount += 1;
    acc[name].avgHourlyRate = shift.hourly_rate || acc[name].avgHourlyRate;
    acc[name].dates.add(shift.date);
    return acc;
  }, {});

  const employeeList = Object.values(employeeStats)
    .sort((a: any, b: any) => b.totalPay - a.totalPay);

  // Calculate staffing recommendations based on day-of-week data
  const staffingRecs = laborData?.dayOfWeekAnalysis
    ?.filter((d: any) => d.occurrences > 0)
    ?.map((day: any) => {
      const targetRPLH = 50;
      const optimalHours = day.avgRevenue > 0 ? day.avgRevenue / targetRPLH : 0;
      const currentHours = day.avgLaborHours;
      const difference = currentHours - optimalHours;
      const status = difference > 2 ? "overstaffed" : difference < -2 ? "understaffed" : "good";

      return {
        ...day,
        optimalHours: Math.round(optimalHours * 10) / 10,
        difference: Math.round(difference * 10) / 10,
        status,
      };
    }) || [];

  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
        <h1 className="text-2xl font-display font-bold">Labor & Staffing</h1>
        <p className="text-porch-cream/70 text-sm mt-1">
          Employee tracking, peak times & scheduling
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Date Range (only show for non-forecast tabs) + Tabs */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          {activeTab !== "forecast" && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(["week", "month", "lastMonth", "90d"] as DatePreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setDatePreset(preset)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    datePreset === preset
                      ? "bg-porch-teal text-white"
                      : "bg-porch-cream text-porch-brown-light"
                  }`}
                >
                  {preset === "week" && "This Week"}
                  {preset === "month" && "This Month"}
                  {preset === "lastMonth" && "Last Month"}
                  {preset === "90d" && "90 Days"}
                </button>
              ))}
            </div>
          )}

          {/* Sub-tabs */}
          <div className={`flex gap-1 ${activeTab !== "forecast" ? "mt-3" : ""} bg-porch-cream rounded-lg p-1`}>
            {(["overview", "employees", "schedule", "forecast"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                  activeTab === tab
                    ? "bg-white text-porch-brown shadow-sm"
                    : "text-porch-brown-light"
                }`}
              >
                {tab === "overview" && "Overview"}
                {tab === "employees" && "Team"}
                {tab === "schedule" && "Staffing"}
                {tab === "forecast" && "Forecast"}
              </button>
            ))}
          </div>
        </div>

        {/* ============ ALERTS (show on Overview if we have forecast alerts) ============ */}
        {activeTab === "overview" && forecastData?.alerts && forecastData.alerts.length > 0 && (
          <div className="space-y-2">
            {forecastData.alerts.slice(0, 3).map((alert: any, i: number) => (
              <div
                key={i}
                className={`rounded-xl p-3 border ${
                  alert.severity === "danger"
                    ? "bg-status-danger/5 border-status-danger/20"
                    : alert.severity === "warning"
                    ? "bg-status-warning/5 border-status-warning/20"
                    : "bg-porch-teal/5 border-porch-teal/20"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">
                    {alert.type === "overstaffed" ? "📉" : alert.type === "understaffed" ? "📈" : alert.type === "trending_up" ? "🔥" : "⚠️"}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-porch-brown">
                      {formatDate(alert.date)}
                    </p>
                    <p className="text-[11px] text-porch-brown-light/70 mt-0.5">
                      {alert.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(activeTab !== "forecast") && loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-teal" />
          </div>
        ) : (activeTab !== "forecast") && !laborData ? (
          <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
            <p className="text-porch-brown-light/60 text-sm">
              No labor data yet. Go to <strong>Sales</strong> and tap <strong>Sync Now</strong> to pull Square data.
            </p>
          </div>
        ) : (
          <>
            {/* ============ OVERVIEW TAB ============ */}
            {activeTab === "overview" && laborData && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                      Total Labor Cost
                    </p>
                    <p className="text-2xl font-bold text-porch-brown mt-1">
                      ${(laborData.overall?.totalLaborCost || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                      Total Hours
                    </p>
                    <p className="text-2xl font-bold text-porch-brown mt-1">
                      {(laborData.overall?.totalLaborHours || 0).toFixed(1)}
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                      RPLH
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${getRPLHColor(laborData.overall?.overallRPLH || 0)}`}>
                      ${(laborData.overall?.overallRPLH || 0).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-porch-brown-light/50">Target: &gt;$50/hr</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                      Labor %
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${
                      (laborData.overall?.laborPercent || 0) <= 35 ? "text-status-good" : "text-status-danger"
                    }`}>
                      {(laborData.overall?.laborPercent || 0).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-porch-brown-light/50">Target: 25-35%</p>
                  </div>
                </div>

                {/* Peak Times */}
                {laborData.insights && (
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                    <h2 className="text-sm font-semibold text-porch-brown mb-3">Peak Times</h2>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-status-good/10 flex items-center justify-center">
                          <span className="text-lg">🔥</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-porch-brown">Busiest Hour</p>
                          <p className="text-sm font-bold text-status-good">{laborData.insights.peakHour}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-porch-teal/10 flex items-center justify-center">
                          <span className="text-lg">📅</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-porch-brown">Busiest Day</p>
                          <p className="text-sm font-bold text-porch-teal">{laborData.insights.peakDay}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-status-warning/10 flex items-center justify-center">
                          <span className="text-lg">😴</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-porch-brown">Slowest Day</p>
                          <p className="text-sm font-bold text-status-warning">{laborData.insights.slowestDay}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Hourly Revenue Heatmap */}
                {laborData.hourlyAnalysis && laborData.hourlyAnalysis.length > 0 && (
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                      <h2 className="text-sm font-semibold text-porch-brown">Revenue by Hour</h2>
                      <p className="text-[10px] text-porch-brown-light/50 mt-0.5">When your money comes in</p>
                    </div>
                    <div className="p-4">
                      {(() => {
                        const maxRev = Math.max(...laborData.hourlyAnalysis.map((h: any) => h.revenue));
                        return laborData.hourlyAnalysis.map((h: any) => {
                          const pct = maxRev > 0 ? (h.revenue / maxRev) * 100 : 0;
                          return (
                            <div key={h.hour} className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-medium text-porch-brown-light/60 w-10 text-right">
                                {h.hourLabel}
                              </span>
                              <div className="flex-1 bg-porch-cream rounded-full h-4 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    pct > 70 ? "bg-porch-teal" : pct > 40 ? "bg-porch-teal/60" : "bg-porch-teal/30"
                                  }`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-porch-brown w-14 text-right">
                                ${h.revenue.toFixed(0)}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* Day of Week Breakdown */}
                {laborData.dayOfWeekAnalysis && (
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                      <h2 className="text-sm font-semibold text-porch-brown">Revenue by Day</h2>
                    </div>
                    <div className="p-4">
                      {(() => {
                        const maxAvg = Math.max(...laborData.dayOfWeekAnalysis.map((d: any) => d.avgRevenue));
                        return laborData.dayOfWeekAnalysis
                          .filter((d: any) => d.occurrences > 0)
                          .map((d: any) => {
                            const pct = maxAvg > 0 ? (d.avgRevenue / maxAvg) * 100 : 0;
                            return (
                              <div key={d.day} className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-semibold text-porch-brown w-8">
                                  {DAY_NAMES[d.day]}
                                </span>
                                <div className="flex-1 bg-porch-cream rounded-full h-5 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-porch-brown transition-all"
                                    style={{ width: `${Math.max(pct, 3)}%` }}
                                  />
                                </div>
                                <div className="text-right w-20">
                                  <span className="text-xs font-bold text-porch-brown">
                                    ${d.avgRevenue.toFixed(0)}
                                  </span>
                                  <span className="text-[9px] text-porch-brown-light/50 ml-1">
                                    avg
                                  </span>
                                </div>
                              </div>
                            );
                          });
                      })()}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ============ EMPLOYEES TAB ============ */}
            {activeTab === "employees" && laborData && (
              <>
                {employeeList.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
                    <p className="text-porch-brown-light/60 text-sm">
                      No employee shift data for this period.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                      <h2 className="text-sm font-semibold text-porch-brown">Employee Productivity</h2>
                      <p className="text-[10px] text-porch-brown-light/50 mt-0.5">
                        {employeeList.length} team members this period
                      </p>
                    </div>
                    <div className="divide-y divide-porch-cream-dark/20">
                      {employeeList.map((emp: any, i: number) => {
                        const revenuePerHour = laborData?.overall?.totalRevenue && emp.totalHours > 0
                          ? (laborData.overall.totalRevenue / (laborData.overall.totalLaborHours || 1)) * (emp.totalHours / (laborData.overall.totalLaborHours || 1)) * (laborData.overall.totalLaborHours || 1) / emp.totalHours
                          : 0;

                        return (
                          <div key={emp.name} className="px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-porch-cream flex items-center justify-center">
                                  <span className="text-xs font-bold text-porch-brown">
                                    {i + 1}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-porch-brown">{emp.name}</p>
                                  <p className="text-[10px] text-porch-brown-light/50">
                                    {emp.shiftCount} shifts · {emp.dates.size} days
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-porch-brown">
                                  ${emp.totalPay.toFixed(2)}
                                </p>
                                <p className="text-[10px] text-porch-brown-light/50">
                                  ${emp.avgHourlyRate.toFixed(2)}/hr
                                </p>
                              </div>
                            </div>
                            {/* Hours bar */}
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-porch-cream rounded-full h-2">
                                <div
                                  className="bg-porch-teal rounded-full h-2"
                                  style={{
                                    width: `${Math.min(
                                      (emp.totalHours / Math.max(...employeeList.map((e: any) => e.totalHours))) * 100,
                                      100
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-semibold text-porch-brown w-14 text-right">
                                {emp.totalHours.toFixed(1)} hrs
                              </span>
                            </div>
                            {revenuePerHour > 0 && (
                              <div className="mt-1.5 flex items-center gap-1">
                                <span className="text-[10px] text-porch-brown-light/50">RPLH:</span>
                                <span className={`text-[10px] font-bold ${getRPLHColor(revenuePerHour)}`}>
                                  ${revenuePerHour.toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Totals footer */}
                    <div className="px-4 py-3 bg-porch-cream/50 border-t border-porch-cream-dark/30">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-porch-brown">Total Payroll</span>
                        <span className="text-sm font-bold text-porch-brown">
                          ${employeeList.reduce((sum: number, e: any) => sum + e.totalPay, 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs font-semibold text-porch-brown">Total Hours</span>
                        <span className="text-sm font-bold text-porch-brown">
                          {employeeList.reduce((sum: number, e: any) => sum + e.totalHours, 0).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ============ STAFFING TAB ============ */}
            {activeTab === "schedule" && laborData && (
              <>
                {/* Staffing Recommendations */}
                <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                    <h2 className="text-sm font-semibold text-porch-brown">Staffing Recommendations</h2>
                    <p className="text-[10px] text-porch-brown-light/50 mt-0.5">
                      Based on $50/hr RPLH target
                    </p>
                  </div>
                  <div className="divide-y divide-porch-cream-dark/20">
                    {staffingRecs.map((day: any) => (
                      <div key={day.day} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-porch-brown">
                            {DAY_NAMES_FULL[day.day]}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            day.status === "good"
                              ? "bg-status-good/10 text-status-good"
                              : day.status === "overstaffed"
                              ? "bg-status-danger/10 text-status-danger"
                              : "bg-status-warning/10 text-status-warning"
                          }`}>
                            {day.status === "good" ? "On Target" : day.status === "overstaffed" ? "Overstaffed" : "Understaffed"}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-porch-brown-light/50">Avg Revenue</p>
                            <p className="text-xs font-bold text-porch-brown">${day.avgRevenue.toFixed(0)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-porch-brown-light/50">Current Hrs</p>
                            <p className="text-xs font-bold text-porch-brown">{day.avgLaborHours.toFixed(1)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-porch-brown-light/50">Optimal Hrs</p>
                            <p className={`text-xs font-bold ${getRPLHColor(day.rplh)}`}>
                              {day.optimalHours}
                            </p>
                          </div>
                        </div>

                        {/* Visual comparison bar */}
                        <div className="mt-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-porch-brown-light/50 w-14">Current</span>
                            <div className="flex-1 bg-porch-cream rounded-full h-2">
                              <div
                                className="bg-porch-brown/60 rounded-full h-2"
                                style={{
                                  width: `${Math.min(
                                    (day.avgLaborHours / Math.max(day.avgLaborHours, day.optimalHours, 1)) * 100,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] text-porch-brown-light/50 w-14">Optimal</span>
                            <div className="flex-1 bg-porch-cream rounded-full h-2">
                              <div
                                className={`rounded-full h-2 ${getRPLHBg(50)}`}
                                style={{
                                  width: `${Math.min(
                                    (day.optimalHours / Math.max(day.avgLaborHours, day.optimalHours, 1)) * 100,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {day.difference !== 0 && (
                          <p className="text-[10px] mt-1.5 text-porch-brown-light/60">
                            {day.difference > 0
                              ? `Could reduce by ${day.difference} hrs/day (save ~$${(day.difference * 15).toFixed(0)}/day)`
                              : `May need ${Math.abs(day.difference)} more hrs/day`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Weekly Savings Potential */}
                {(() => {
                  const overstaffedDays = staffingRecs.filter((d: any) => d.difference > 0);
                  const totalExcessHours = overstaffedDays.reduce((sum: number, d: any) => sum + d.difference, 0);
                  const weeklySavings = totalExcessHours * 15;

                  if (totalExcessHours <= 0) return null;

                  return (
                    <div className="bg-status-good/5 rounded-2xl border border-status-good/20 p-4">
                      <h3 className="text-sm font-semibold text-status-good mb-1">
                        Potential Weekly Savings
                      </h3>
                      <p className="text-2xl font-bold text-status-good">
                        ${weeklySavings.toFixed(0)}/week
                      </p>
                      <p className="text-xs text-porch-brown-light/60 mt-1">
                        By reducing {totalExcessHours.toFixed(1)} excess hours across {overstaffedDays.length} day{overstaffedDays.length !== 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-porch-brown-light/60 mt-0.5">
                        That&apos;s ~${(weeklySavings * 4.3).toFixed(0)}/month in labor savings
                      </p>
                    </div>
                  );
                })()}
              </>
            )}

            {/* ============ FORECAST TAB ============ */}
            {activeTab === "forecast" && (
              <>
                {forecastLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-teal" />
                  </div>
                ) : !forecastData?.hasEnoughData ? (
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
                    <div className="text-3xl mb-3">🔮</div>
                    <p className="text-sm font-medium text-porch-brown">Need More Data</p>
                    <p className="text-xs text-porch-brown-light/60 mt-2">
                      Sync at least 7 days of sales data from Square to unlock demand forecasting.
                      Currently have {forecastData?.daysOfData || 0} day{(forecastData?.daysOfData || 0) !== 1 ? "s" : ""}.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Trend Indicator */}
                    {forecastData.trend && (
                      <div className={`rounded-xl p-3 border ${
                        forecastData.trend.direction === "up"
                          ? "bg-status-good/5 border-status-good/20"
                          : forecastData.trend.direction === "down"
                          ? "bg-status-warning/5 border-status-warning/20"
                          : "bg-porch-cream border-porch-cream-dark/30"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {forecastData.trend.direction === "up" ? "📈" : forecastData.trend.direction === "down" ? "📉" : "➡️"}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-porch-brown">
                                Revenue {forecastData.trend.direction === "up" ? "Trending Up" : forecastData.trend.direction === "down" ? "Trending Down" : "Stable"}
                              </p>
                              <p className="text-[10px] text-porch-brown-light/60">
                                Recent 2 weeks vs prior 2 weeks
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-porch-brown">
                              ${forecastData.trend.recentAvg}/day
                            </p>
                            <p className="text-[10px] text-porch-brown-light/50">
                              vs ${forecastData.trend.olderAvg}/day prior
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Alerts */}
                    {forecastData.alerts && forecastData.alerts.length > 0 && (
                      <div className="space-y-2">
                        {forecastData.alerts.map((alert: any, i: number) => (
                          <div
                            key={i}
                            className={`rounded-xl p-3 border ${
                              alert.severity === "danger"
                                ? "bg-status-danger/5 border-status-danger/20"
                                : alert.severity === "warning"
                                ? "bg-status-warning/5 border-status-warning/20"
                                : "bg-porch-teal/5 border-porch-teal/20"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-sm mt-0.5">
                                {alert.type === "overstaffed" ? "📉" : alert.type === "understaffed" ? "📈" : alert.type === "trending_up" ? "🔥" : "⚠️"}
                              </span>
                              <div>
                                <p className="text-xs font-medium text-porch-brown">
                                  {formatDate(alert.date)}
                                </p>
                                <p className="text-[11px] text-porch-brown-light/70 mt-0.5">
                                  {alert.message}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 7-Day Forecast */}
                    <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-porch-cream-dark/30 flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-semibold text-porch-brown">7-Day Forecast</h2>
                          <p className="text-[10px] text-porch-brown-light/50 mt-0.5">
                            Predicted revenue & recommended staffing
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            setEventForm({
                              date: tomorrow.toISOString().split("T")[0],
                              name: "",
                              adjustmentPct: 30,
                            });
                            setShowEventModal(true);
                          }}
                          className="text-[10px] font-semibold bg-porch-teal text-white px-3 py-1 rounded-full"
                        >
                          + Event
                        </button>
                      </div>

                      <div className="divide-y divide-porch-cream-dark/20">
                        {forecastData.forecast?.map((day: any) => {
                          const maxRev = Math.max(...(forecastData.forecast || []).map((d: any) => d.predictedRevenue || 0));
                          const pct = maxRev > 0 ? (day.predictedRevenue / maxRev) * 100 : 0;

                          return (
                            <div key={day.date} className={`px-4 py-3 ${day.isToday ? "bg-porch-teal/5" : ""}`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-porch-brown w-8">
                                    {day.dayNameShort}
                                  </span>
                                  <span className="text-[10px] text-porch-brown-light/50">
                                    {formatDate(day.date)}
                                  </span>
                                  {day.isToday && (
                                    <span className="text-[9px] font-semibold bg-porch-teal text-white px-1.5 py-0.5 rounded-full">
                                      TODAY
                                    </span>
                                  )}
                                  {day.event && (
                                    <button
                                      onClick={() => handleDeleteEvent(day.date)}
                                      className="text-[9px] font-semibold bg-porch-brown/10 text-porch-brown px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                                    >
                                      🎉 {day.event.name} (+{day.event.adjustmentPct}%)
                                      <span className="text-porch-brown-light/40 ml-0.5">x</span>
                                    </button>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="text-sm font-bold text-porch-brown">
                                    ${day.predictedRevenue.toLocaleString()}
                                  </span>
                                  <span className="text-[9px] text-porch-brown-light/40 ml-1">
                                    &plusmn;${day.confidenceRange}
                                  </span>
                                </div>
                              </div>

                              {/* Revenue bar */}
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="flex-1 bg-porch-cream rounded-full h-3 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      pct > 70 ? "bg-porch-teal" : pct > 40 ? "bg-porch-teal/60" : "bg-porch-teal/30"
                                    }`}
                                    style={{ width: `${Math.max(pct, 3)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Staffing recommendation */}
                              <div className="flex items-center gap-3 text-[10px]">
                                <span className="text-porch-brown-light/50">
                                  Staff: <strong className="text-porch-brown">{day.recommendedHours} hrs</strong>
                                </span>
                                {day.currentAvgHours > 0 && (
                                  <>
                                    <span className="text-porch-brown-light/30">|</span>
                                    <span className="text-porch-brown-light/50">
                                      Currently avg: {day.currentAvgHours} hrs
                                    </span>
                                    {day.hoursDifference > 2 && (
                                      <span className="text-status-danger font-semibold">
                                        -{day.hoursDifference} hrs
                                      </span>
                                    )}
                                    {day.hoursDifference < -2 && (
                                      <span className="text-status-warning font-semibold">
                                        +{Math.abs(day.hoursDifference)} hrs needed
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Weekly Summary Footer */}
                      {forecastData.forecast && forecastData.forecast.length > 0 && (
                        <div className="px-4 py-3 bg-porch-cream/50 border-t border-porch-cream-dark/30">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-porch-brown">Week Total (Predicted)</span>
                            <span className="text-sm font-bold text-porch-brown">
                              ${forecastData.forecast.reduce((s: number, d: any) => s + (d.predictedRevenue || 0), 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs font-semibold text-porch-brown">Total Staff Hours Needed</span>
                            <span className="text-sm font-bold text-porch-brown">
                              {forecastData.forecast.reduce((s: number, d: any) => s + (d.recommendedHours || 0), 0).toFixed(1)} hrs
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="text-[9px] text-porch-brown-light/30 text-center px-4">
                      Based on {forecastData.daysOfData}-day history with day-of-week patterns and recent trends.
                    </p>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ============ EVENT MODAL ============ */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-8 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-porch-brown">Add Special Event</h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-porch-brown-light/40 text-lg"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-porch-brown-light/60 mb-4">
              Mark special days (festivals, holidays, promos) that affect how busy you&apos;ll be.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-porch-brown mb-1 block">Date</label>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                  className="w-full border border-porch-cream-dark/50 rounded-lg px-3 py-2 text-sm text-porch-brown"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-porch-brown mb-1 block">Event Name</label>
                <input
                  type="text"
                  placeholder="e.g., Local Festival, Holiday, Big Promo"
                  value={eventForm.name}
                  onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                  className="w-full border border-porch-cream-dark/50 rounded-lg px-3 py-2 text-sm text-porch-brown placeholder:text-porch-brown-light/30"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-porch-brown mb-1 block">
                  Revenue Adjustment: {eventForm.adjustmentPct > 0 ? "+" : ""}{eventForm.adjustmentPct}%
                </label>
                <input
                  type="range"
                  min="-50"
                  max="100"
                  step="5"
                  value={eventForm.adjustmentPct}
                  onChange={(e) => setEventForm({ ...eventForm, adjustmentPct: parseInt(e.target.value) })}
                  className="w-full accent-porch-teal"
                />
                <div className="flex justify-between text-[9px] text-porch-brown-light/40">
                  <span>-50% (Slow day)</span>
                  <span>0% (Normal)</span>
                  <span>+100% (2x busy)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowEventModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-porch-cream-dark/50 text-sm font-medium text-porch-brown-light"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEvent}
                disabled={!eventForm.date || !eventForm.name || savingEvent}
                className="flex-1 px-4 py-2.5 rounded-xl bg-porch-teal text-white text-sm font-semibold disabled:opacity-50"
              >
                {savingEvent ? "Saving..." : "Add Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
