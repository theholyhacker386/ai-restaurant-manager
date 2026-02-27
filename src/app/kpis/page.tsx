"use client";

import { useEffect, useState, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type DatePreset = "today" | "week" | "month" | "lastMonth" | "ytd" | "last12" | "custom";

function getDateRange(preset: DatePreset) {
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
    case "ytd":
      start.setMonth(0, 1);
      break;
    case "last12":
      start.setFullYear(now.getFullYear() - 1);
      start.setDate(start.getDate() + 1);
      break;
  }

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

export default function KPIsPage() {
  const [datePreset, setDatePreset] = useState<DatePreset>("last12");
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchKPIs = useCallback(() => {
    setLoading(true);
    const { startDate, endDate } = getDateRange(datePreset);
    fetch(`/api/kpis?startDate=${startDate}&endDate=${endDate}`)
      .then((res) => res.json())
      .then((data) => {
        setKpis(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load KPIs:", err);
        setLoading(false);
      });
  }, [datePreset]);

  useEffect(() => {
    fetchKPIs();
  }, [fetchKPIs]);

  if (loading || !kpis) {
    return (
      <div className="min-h-screen bg-white p-6">
        <p className="text-gray-500">
          Loading KPIs...
        </p>
      </div>
    );
  }

  const getPrimeCostColor = (percent: number) => {
    if (percent < 60) return "text-green-600";
    if (percent < 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getFoodCostColor = (percent: number) => {
    if (percent >= 28 && percent <= 35) return "text-green-600";
    if (percent < 28 || (percent > 35 && percent <= 40)) return "text-yellow-600";
    return "text-red-600";
  };

  const getLaborColor = (percent: number) => {
    if (percent >= 25 && percent <= 35) return "text-green-600";
    if (percent < 25 || (percent > 35 && percent <= 40)) return "text-yellow-600";
    return "text-red-600";
  };

  const getRPLHColor = (value: number) => {
    if (value >= 50) return "text-green-600";
    if (value >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-black text-white p-6">
        <h1 className="text-2xl font-bold">Key Performance Indicators</h1>
        <p className="text-gray-400 text-sm mt-1">Business health metrics</p>
      </div>

      {/* Date Range Selector */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(["today", "week", "month", "lastMonth", "ytd", "last12"] as DatePreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => setDatePreset(preset)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                datePreset === preset
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {preset === "today" && "Today"}
              {preset === "week" && "This Week"}
              {preset === "month" && "This Month"}
              {preset === "lastMonth" && "Last Month"}
              {preset === "ytd" && "Year to Date"}
              {preset === "last12" && "Last 12 Mo"}
            </button>
          ))}
        </div>
      </div>

      {/* Prime Cost - Featured Metric */}
      <div className="p-6 border-b border-gray-200 bg-gray-50">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold mb-4">Prime Cost</h2>
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-baseline justify-between">
              <div>
                <div className={`text-5xl font-bold ${getPrimeCostColor(kpis.primeCostPercent)}`}>
                  {kpis.primeCostPercent.toFixed(1)}%
                </div>
                <div className="text-gray-600 mt-2">
                  ${kpis.primeCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Target: &lt;65%</div>
                <div className="text-sm text-gray-500">Warning: 65-70%</div>
                <div className="text-sm text-gray-500">Danger: &gt;70%</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Food Cost: ${kpis.cogs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-gray-600">Labor: ${kpis.labor.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue Per Labor Hour */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Revenue Per Labor Hour (RPLH)</h3>
          <div className={`text-4xl font-bold ${getRPLHColor(kpis.rplh)}`}>
            ${kpis.rplh.toFixed(2)}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Target: &gt;$50/hour
          </div>
          <div className="text-sm text-gray-600 mt-2">
            {kpis.laborHours.toFixed(1)} total labor hours
          </div>
        </div>

        {/* Food Cost % */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Food Cost %</h3>
          <div className={`text-4xl font-bold ${getFoodCostColor(kpis.foodCostPercent)}`}>
            {kpis.foodCostPercent.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Target: 28-35%
          </div>
          <div className="text-sm text-gray-600 mt-2">
            ${kpis.cogs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COGS
          </div>
        </div>

        {/* Labor % */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Labor %</h3>
          <div className={`text-4xl font-bold ${getLaborColor(kpis.laborPercent)}`}>
            {kpis.laborPercent.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Target: 25-35%
          </div>
          <div className="text-sm text-gray-600 mt-2">
            ${kpis.labor.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total labor
          </div>
        </div>

        {/* Profit Margin */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Profit Margin</h3>
          <div className={`text-4xl font-bold ${kpis.profitMargin > 10 ? 'text-green-600' : kpis.profitMargin > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
            {kpis.profitMargin.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Target: &gt;10%
          </div>
          <div className="text-sm text-gray-600 mt-2">
            ${kpis.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} net profit
          </div>
        </div>

        {/* Break-Even Point */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 md:col-span-2">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Break-Even Analysis</h3>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <div className="text-sm text-gray-600">Daily Break-Even</div>
              <div className="text-2xl font-bold">
                ${kpis.dailyBreakEven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Period Break-Even</div>
              <div className="text-2xl font-bold">
                ${kpis.breakEvenRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Based on {kpis.daysInPeriod} days in selected period
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <div className="flex justify-around max-w-md mx-auto">
          <a href="/" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">🏠</span>
            <span className="text-xs mt-1">Home</span>
          </a>
          <a href="/expenses" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">💰</span>
            <span className="text-xs mt-1">P&L</span>
          </a>
          <a href="/kpis" className="flex flex-col items-center text-black">
            <span className="text-2xl">📊</span>
            <span className="text-xs mt-1">KPIs</span>
          </a>
          <a href="/projections" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">🔮</span>
            <span className="text-xs mt-1">Forecast</span>
          </a>
          <a href="/recipes" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">📖</span>
            <span className="text-xs mt-1">Recipes</span>
          </a>
        </div>
      </div>
    </div>
  );
}
