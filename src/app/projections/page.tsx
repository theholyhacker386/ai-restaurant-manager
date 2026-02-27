"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine,
} from "recharts";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ProjectionData {
  hasEnoughData: boolean;
  monthsOfData: number;
  monthly: Array<{
    label: string;
    revenue: number;
    expenses: number;
    profit: number;
    foodCost: number;
    laborCost: number;
    overheadCost: number;
    orders: number;
  }>;
  forecast: {
    label: string;
    shortLabel: string;
    revenue: number;
    confidenceRange: number;
    expenses: number;
    foodCost: number;
    laborCost: number;
    overheadCost: number;
    profit: number;
    profitMargin: number;
    growthRate: number;
  };
  survival: {
    score: number;
    status: string;
    components: {
      cash: { score: number; max: number; runway: number };
      profit: { score: number; max: number };
      primeCost: { score: number; max: number; percentage: number };
      growth: { score: number; max: number };
    };
  };
  primeCostTrend: Array<{ label: string; value: number }>;
  insights: Array<{ icon: string; text: string; type: "good" | "warning" | "danger" }>;
  runway: { months: number; monthlyBurn: number };
}

export default function ProjectionsPage() {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/projections");
        if (!res.ok) throw new Error("Failed to load projections");
        setData(await res.json());
      } catch {
        setError("Could not load projections");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-porch-cream pb-24">
        <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
          <h1 className="text-2xl font-display font-bold">Projections</h1>
          <p className="text-porch-cream/70 text-sm mt-1">Loading your financial forecast...</p>
        </div>
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-teal" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-porch-cream pb-24">
        <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
          <h1 className="text-2xl font-display font-bold">Projections</h1>
        </div>
        <div className="px-4 pt-6">
          <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
            <div className="text-4xl mb-3">&#x26A0;&#xFE0F;</div>
            <p className="text-porch-brown font-medium">
              {error || "Something went wrong"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data.hasEnoughData) {
    return (
      <div className="min-h-screen bg-porch-cream pb-24">
        <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
          <h1 className="text-2xl font-display font-bold">Projections</h1>
          <p className="text-porch-cream/70 text-sm mt-1">See what next month looks like</p>
        </div>
        <div className="px-4 pt-6">
          <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
            <div className="text-4xl mb-3">&#x1F52E;</div>
            <p className="text-porch-brown font-medium">Need more data for projections</p>
            <p className="text-porch-brown-light/60 text-sm mt-2">
              Sync at least 2 months of sales data from Square to unlock financial forecasting.
              Currently have {data.monthsOfData} month{data.monthsOfData !== 1 ? "s" : ""} of data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
        <h1 className="text-2xl font-display font-bold">Projections</h1>
        <p className="text-porch-cream/70 text-sm mt-1">
          What will {data.forecast.label} look like?
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* ═══ HERO: Survival Score + Next Month ═══ */}
        <div className="grid grid-cols-2 gap-3">
          {/* Survival Score Gauge */}
          <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4 flex flex-col items-center">
            <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold mb-2">
              Survival Score
            </p>
            <SurvivalGauge
              score={data.survival.score}
              status={data.survival.status}
            />
            <p
              className={`text-[10px] font-semibold mt-2 ${
                data.survival.score >= 70
                  ? "text-status-good"
                  : data.survival.score >= 40
                  ? "text-status-warning"
                  : "text-status-danger"
              }`}
            >
              {data.survival.status}
            </p>
          </div>

          {/* Next Month Projection */}
          <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
            <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold mb-1">
              {data.forecast.shortLabel} Forecast
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-porch-brown-light/50">Revenue</p>
                <p className="text-lg font-bold text-porch-brown">
                  ${data.forecast.revenue.toLocaleString()}
                </p>
                {data.forecast.confidenceRange > 0 && (
                  <p className="text-[9px] text-porch-brown-light/40">
                    &plusmn;${data.forecast.confidenceRange.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="border-t border-porch-cream-dark/30 pt-2">
                <p className="text-[10px] text-porch-brown-light/50">Projected Profit</p>
                <p
                  className={`text-base font-bold ${
                    data.forecast.profit >= 0 ? "text-status-good" : "text-status-danger"
                  }`}
                >
                  {data.forecast.profit >= 0 ? "" : "-"}$
                  {Math.abs(data.forecast.profit).toLocaleString()}
                </p>
                <p
                  className={`text-[9px] font-medium ${
                    data.forecast.profitMargin >= 10
                      ? "text-status-good"
                      : data.forecast.profitMargin >= 0
                      ? "text-status-warning"
                      : "text-status-danger"
                  }`}
                >
                  {data.forecast.profitMargin}% margin
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SCORE BREAKDOWN ═══ */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          <h2 className="text-xs font-semibold text-porch-brown mb-3">
            Score Breakdown
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <ScoreComponent
              label="Cash Reserves"
              score={data.survival.components.cash.score}
              max={data.survival.components.cash.max}
              detail={`${data.survival.components.cash.runway} mo runway`}
            />
            <ScoreComponent
              label="Profit Trend"
              score={data.survival.components.profit.score}
              max={data.survival.components.profit.max}
              detail={data.survival.components.profit.score >= 30 ? "Improving" : data.survival.components.profit.score >= 15 ? "Stable" : "Declining"}
            />
            <ScoreComponent
              label="Prime Cost"
              score={data.survival.components.primeCost.score}
              max={data.survival.components.primeCost.max}
              detail={`${data.survival.components.primeCost.percentage}% of revenue`}
            />
            <ScoreComponent
              label="Revenue Growth"
              score={data.survival.components.growth.score}
              max={data.survival.components.growth.max}
              detail={`${data.forecast.growthRate >= 0 ? "+" : ""}${data.forecast.growthRate}%`}
            />
          </div>
        </div>

        {/* ═══ EXPENSE BREAKDOWN ═══ */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          <h2 className="text-xs font-semibold text-porch-brown mb-3">
            Projected Expenses — {data.forecast.shortLabel}
          </h2>
          <div className="space-y-2">
            <ExpenseRow
              label="Food & Supplies"
              amount={data.forecast.foodCost}
              total={data.forecast.expenses}
              color="bg-amber-400"
            />
            <ExpenseRow
              label="Labor & Payroll"
              amount={data.forecast.laborCost}
              total={data.forecast.expenses}
              color="bg-blue-400"
            />
            <ExpenseRow
              label="Overhead"
              amount={data.forecast.overheadCost}
              total={data.forecast.expenses}
              color="bg-purple-400"
            />
            <div className="border-t border-porch-cream-dark/30 pt-2 flex items-center justify-between">
              <span className="text-xs font-bold text-porch-brown">Total</span>
              <span className="text-xs font-bold text-porch-brown">
                ${data.forecast.expenses.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ CASH FLOW RUNWAY ═══ */}
        <div
          className={`rounded-2xl border p-4 ${
            data.runway.months >= 3
              ? "bg-status-good/5 border-status-good/20"
              : data.runway.months >= 1
              ? "bg-status-warning/5 border-status-warning/20"
              : "bg-status-danger/5 border-status-danger/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-porch-brown">Cash Flow Runway</p>
              <p className="text-[10px] text-porch-brown-light/50 mt-0.5">
                Based on recent profit vs. monthly expenses
              </p>
            </div>
            <div className="text-right">
              <p
                className={`text-lg font-bold ${
                  data.runway.months >= 3
                    ? "text-status-good"
                    : data.runway.months >= 1
                    ? "text-status-warning"
                    : "text-status-danger"
                }`}
              >
                {data.runway.months > 0 ? `${data.runway.months} mo` : "< 1 mo"}
              </p>
              <p className="text-[9px] text-porch-brown-light/40">
                ${data.runway.monthlyBurn.toLocaleString()}/mo burn
              </p>
            </div>
          </div>
        </div>

        {/* ═══ REVENUE TREND CHART ═══ */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          <h2 className="text-xs font-semibold text-porch-brown mb-1">
            Revenue Trend
          </h2>
          <p className="text-[10px] text-porch-brown-light/40 mb-3">
            Last {data.monthly.filter((m: any) => m.revenue > 0).length} months + forecast
          </p>
          <RevenueChart
            monthly={data.monthly}
            forecast={{
              label: data.forecast.shortLabel,
              revenue: data.forecast.revenue,
              high: data.forecast.revenue + data.forecast.confidenceRange,
              low: data.forecast.revenue - data.forecast.confidenceRange,
            }}
          />
        </div>

        {/* ═══ PROFIT TREND CHART ═══ */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          <h2 className="text-xs font-semibold text-porch-brown mb-1">
            Profit Trend
          </h2>
          <p className="text-[10px] text-porch-brown-light/40 mb-3">
            Net profit by month + forecast
          </p>
          <ProfitChart
            monthly={data.monthly}
            forecast={{
              label: data.forecast.shortLabel,
              profit: data.forecast.profit,
            }}
          />
        </div>

        {/* ═══ PRIME COST % CHART ═══ */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          <h2 className="text-xs font-semibold text-porch-brown mb-1">
            Prime Cost %
          </h2>
          <p className="text-[10px] text-porch-brown-light/40 mb-3">
            Food + Labor as % of revenue (target: under 60%)
          </p>
          <PrimeCostChart data={data.primeCostTrend} />
        </div>

        {/* ═══ INSIGHTS ═══ */}
        {data.insights.length > 0 && (
          <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
            <h2 className="text-xs font-semibold text-porch-brown mb-3">
              Key Insights
            </h2>
            <div className="space-y-2">
              {data.insights.map((insight, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-3 ${
                    insight.type === "good"
                      ? "bg-status-good/5"
                      : insight.type === "warning"
                      ? "bg-status-warning/5"
                      : "bg-status-danger/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                        insight.type === "good"
                          ? "bg-status-good"
                          : insight.type === "warning"
                          ? "bg-status-warning"
                          : "bg-status-danger"
                      }`}
                    />
                    <p className="text-xs text-porch-brown leading-relaxed">
                      {insight.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ DISCLAIMER ═══ */}
        <p className="text-[9px] text-porch-brown-light/30 text-center px-4 pb-4">
          Projections based on {data.monthsOfData}-month moving average. Actual results may vary.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SURVIVAL SCORE GAUGE — SVG Circular Gauge
   ═══════════════════════════════════════════ */

function SurvivalGauge({ score, status }: { score: number; status: string }) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const color =
    score >= 70
      ? "var(--status-good)"
      : score >= 40
      ? "var(--status-warning)"
      : "var(--status-danger)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e5e5"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      {/* Score text in center */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-porch-brown">{score}</span>
        <span className="text-[8px] text-porch-brown-light/40 -mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SCORE COMPONENT CARD
   ═══════════════════════════════════════════ */

function ScoreComponent({
  label,
  score,
  max,
  detail,
}: {
  label: string;
  score: number;
  max: number;
  detail: string;
}) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color =
    pct >= 80
      ? "bg-status-good"
      : pct >= 50
      ? "bg-status-warning"
      : "bg-status-danger";
  const colorText =
    pct >= 80
      ? "text-status-good"
      : pct >= 50
      ? "text-status-warning"
      : "text-status-danger";

  return (
    <div className="bg-porch-cream/50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-porch-brown-light/60">{label}</span>
        <span className={`text-xs font-bold ${colorText}`}>
          {score}/{max}
        </span>
      </div>
      <div className="h-1.5 bg-porch-cream-dark/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[9px] text-porch-brown-light/40 mt-1">{detail}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EXPENSE ROW
   ═══════════════════════════════════════════ */

function ExpenseRow({
  label,
  amount,
  total,
  color,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-xs text-porch-brown-light/70">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-porch-brown">
            ${amount.toLocaleString()}
          </span>
          <span className="text-[10px] text-porch-brown-light/40 w-10 text-right">
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-1 bg-porch-cream-dark/20 rounded-full overflow-hidden ml-4">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   REVENUE TREND CHART
   ═══════════════════════════════════════════ */

function RevenueChart({
  monthly,
  forecast,
}: {
  monthly: Array<{ label: string; revenue: number }>;
  forecast: { label: string; revenue: number; high: number; low: number };
}) {
  // Combine historical + forecast
  const chartData = [
    ...monthly
      .filter((m) => m.revenue > 0)
      .map((m) => ({
        name: m.label,
        revenue: m.revenue,
        forecast: null as number | null,
        high: null as number | null,
        low: null as number | null,
      })),
    {
      name: forecast.label,
      revenue: null as number | null,
      forecast: forecast.revenue,
      high: forecast.high,
      low: forecast.low,
    },
  ];

  // Bridge line: add forecast value to last historical point
  const lastHistorical = monthly.filter((m) => m.revenue > 0).slice(-1)[0];
  if (lastHistorical && chartData.length > 1) {
    chartData[chartData.length - 2].forecast = lastHistorical.revenue;
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: "#999" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e5e5" }}
            interval="preserveStartEnd"
            angle={-45}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#999" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            formatter={(value: any) => [`$${Number(value).toLocaleString()}`, ""]}
          />
          {/* Historical line */}
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#111"
            strokeWidth={2}
            dot={{ r: 3, fill: "#111" }}
            connectNulls={false}
            name="Revenue"
          />
          {/* Forecast line (dashed) */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#111"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: "#fff", stroke: "#111", strokeWidth: 2 }}
            connectNulls={false}
            name="Forecast"
          />
          {/* Confidence band */}
          <Area
            type="monotone"
            dataKey="high"
            stroke="none"
            fill="#111"
            fillOpacity={0.05}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PROFIT TREND CHART
   ═══════════════════════════════════════════ */

function ProfitChart({
  monthly,
  forecast,
}: {
  monthly: Array<{ label: string; profit: number; revenue: number }>;
  forecast: { label: string; profit: number };
}) {
  const chartData = [
    ...monthly
      .filter((m) => m.revenue > 0 || m.profit !== 0)
      .map((m) => ({
        name: m.label,
        profit: m.profit,
        forecast: null as number | null,
      })),
    {
      name: forecast.label,
      profit: null as number | null,
      forecast: forecast.profit,
    },
  ];

  // Bridge: connect last historical to forecast
  const hasHistorical = monthly.filter((m) => m.revenue > 0 || m.profit !== 0);
  if (hasHistorical.length > 0 && chartData.length > 1) {
    chartData[chartData.length - 2].forecast =
      hasHistorical[hasHistorical.length - 1].profit;
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: "#999" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e5e5" }}
            interval="preserveStartEnd"
            angle={-45}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#999" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              v >= 0 ? `$${(v / 1000).toFixed(0)}k` : `-$${(Math.abs(v) / 1000).toFixed(0)}k`
            }
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            formatter={(value: any) => {
              const v = Number(value);
              return [`${v >= 0 ? "" : "-"}$${Math.abs(v).toLocaleString()}`, ""];
            }}
          />
          <ReferenceLine y={0} stroke="#ccc" strokeDasharray="3 3" />
          {/* Historical line */}
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#22c55e"
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              const isNeg = payload.profit < 0;
              return (
                <circle
                  key={`profit-dot-${props.index}`}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={isNeg ? "#ef4444" : "#22c55e"}
                />
              );
            }}
            connectNulls={false}
            name="Profit"
          />
          {/* Forecast (dashed) */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke={forecast.profit >= 0 ? "#22c55e" : "#ef4444"}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: "#fff", stroke: forecast.profit >= 0 ? "#22c55e" : "#ef4444", strokeWidth: 2 }}
            connectNulls={false}
            name="Forecast"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PRIME COST % CHART
   ═══════════════════════════════════════════ */

function PrimeCostChart({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const filtered = data.filter((d) => d.value > 0);
  const chartData = filtered.map((d) => ({ name: d.label, pct: d.value }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: "#999" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e5e5" }}
            interval="preserveStartEnd"
            angle={-45}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#999" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            formatter={(value: any) => [`${value}%`, "Prime Cost"]}
          />
          {/* Target line at 60% */}
          <ReferenceLine
            y={60}
            stroke="#22c55e"
            strokeDasharray="6 3"
            label={{ value: "Target 60%", position: "right", fontSize: 9, fill: "#22c55e" }}
          />
          {/* Danger line at 70% */}
          <ReferenceLine
            y={70}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{ value: "Danger 70%", position: "right", fontSize: 9, fill: "#ef4444" }}
          />
          <Line
            type="monotone"
            dataKey="pct"
            stroke="#111"
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              const c =
                payload.pct < 60
                  ? "#22c55e"
                  : payload.pct <= 70
                  ? "#f59e0b"
                  : "#ef4444";
              return (
                <circle
                  key={`prime-dot-${props.index}`}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={c}
                />
              );
            }}
            name="Prime Cost %"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
