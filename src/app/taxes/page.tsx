"use client";

import { useEffect, useState, useCallback } from "react";
import { STATE_TAX_RATES } from "@/lib/tax-rates";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TaxSettings {
  taxRate: number;
  state: string | null;
  county: string | null;
  filingFrequency: string;
}

interface PeriodData {
  label: string;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  taxCollected: number;
  netRevenue: number;
  daysWithSales: number;
  taxOwed: number;
  dueDate: string;
  status: "current" | "past_due" | "upcoming";
}

interface TaxData {
  settings: TaxSettings;
  yearToDate: {
    totalRevenue: number;
    taxCollected: number;
    taxPaid: number;
    taxOwed: number;
  };
  periods: PeriodData[];
  year: number;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pctFmt = (n: number) => `${(n * 100).toFixed(2)}%`;

// All states sorted alphabetically
const STATE_OPTIONS = Object.entries(STATE_TAX_RATES)
  .sort((a, b) => a[1].name.localeCompare(b[1].name))
  .map(([code, { name, rate }]) => ({ code, name, rate }));

export default function TaxDashboard() {
  const [data, setData] = useState<TaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<"quarterly" | "monthly">("quarterly");

  // Setup form state
  const [showSetup, setShowSetup] = useState(false);
  const [setupState, setSetupState] = useState("");
  const [setupCounty, setSetupCounty] = useState("");
  const [setupRate, setSetupRate] = useState("");
  const [setupFrequency, setSetupFrequency] = useState("quarterly");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tax?period=${viewMode}&year=${year}`
      );
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json);

      // If no tax rate configured, show setup
      if (!json.settings.taxRate && !json.settings.state) {
        setShowSetup(true);
      } else {
        setShowSetup(false);
        // Pre-fill form for editing
        setSetupState(json.settings.state || "");
        setSetupCounty(json.settings.county || "");
        setSetupRate(json.settings.taxRate ? String(json.settings.taxRate * 100) : "");
        setSetupFrequency(json.settings.filingFrequency || "quarterly");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [viewMode, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-fill rate when state is selected
  const handleStateChange = (stateCode: string) => {
    setSetupState(stateCode);
    if (stateCode && STATE_TAX_RATES[stateCode]) {
      setSetupRate(String((STATE_TAX_RATES[stateCode].rate * 100).toFixed(2)));
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _taxSettingsOnly: true,
          sales_tax_rate: setupRate ? parseFloat(setupRate) / 100 : null,
          state: setupState || null,
          county: setupCounty || null,
          tax_filing_frequency: setupFrequency,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setShowSetup(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Failed to save tax settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string, taxCollected: number) => {
    if (taxCollected === 0 && status === "upcoming") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          Upcoming
        </span>
      );
    }
    if (taxCollected === 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          No Sales
        </span>
      );
    }
    switch (status) {
      case "current":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Due Soon
          </span>
        );
      case "past_due":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Past Due
          </span>
        );
      case "upcoming":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Upcoming
          </span>
        );
      default:
        return null;
    }
  };

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  // Year options: current year and previous 2 years
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-porch-cream">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
          <h1 className="text-xl font-bold text-porch-brown mb-6">
            Sales Tax
          </h1>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl shadow-sm p-6 animate-pulse"
              >
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-6 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stateInfo = data?.settings.state
    ? STATE_TAX_RATES[data.settings.state]
    : null;

  const hasSalesData =
    data && data.yearToDate.totalRevenue > 0;

  return (
    <div className="min-h-screen bg-porch-cream">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        <h1 className="text-xl font-bold text-porch-brown mb-6">
          Sales Tax
        </h1>

        {/* Setup Banner */}
        {(showSetup || (!data?.settings.state && !data?.settings.taxRate)) && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-1">
              Set Up Sales Tax Tracking
            </h2>
            <p className="text-sm text-blue-700 mb-4">
              Tell us your state and tax rate so we can calculate what you owe.
            </p>

            <div className="space-y-4">
              {/* State dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <select
                  value={setupState}
                  onChange={(e) => handleStateChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-porch-teal focus:border-transparent"
                >
                  <option value="">Select your state...</option>
                  {STATE_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* County */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  County{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={setupCounty}
                  onChange={(e) => setSetupCounty(e.target.value)}
                  placeholder="e.g. Mecklenburg"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-porch-teal focus:border-transparent"
                />
              </div>

              {/* Combined Tax Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Combined Tax Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="20"
                  value={setupRate}
                  onChange={(e) => setSetupRate(e.target.value)}
                  placeholder="e.g. 8.25"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-porch-teal focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This is your total rate including state + county + local taxes.
                  Check your receipts &mdash; it&apos;s usually printed there.
                </p>
                {setupState && STATE_TAX_RATES[setupState] && (
                  <p className="text-xs text-blue-600 mt-1">
                    Your state base rate is{" "}
                    {(STATE_TAX_RATES[setupState].rate * 100).toFixed(2)}%. Most
                    restaurants pay a higher total with county and local taxes
                    added.
                  </p>
                )}
              </div>

              {/* Filing Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filing Frequency
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSetupFrequency("monthly")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      setupFrequency === "monthly"
                        ? "bg-porch-teal text-white border-porch-teal"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setSetupFrequency("quarterly")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      setupFrequency === "quarterly"
                        ? "bg-porch-teal text-white border-porch-teal"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Quarterly
                  </button>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving || !setupState || !setupRate}
                className="w-full bg-porch-teal text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-porch-teal-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Tax Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Edit Settings link (when already configured) */}
        {data?.settings.state && !showSetup && (
          <button
            onClick={() => setShowSetup(true)}
            className="text-sm text-porch-teal hover:underline mb-4 inline-block"
          >
            Edit tax settings
          </button>
        )}

        {/* Inline Edit Banner (when editing existing settings) */}
        {showSetup && data?.settings.state && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-blue-900">
                Edit Tax Settings
              </h2>
              <button
                onClick={() => setShowSetup(false)}
                className="text-sm text-blue-700 hover:underline"
              >
                Cancel
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <select
                  value={setupState}
                  onChange={(e) => handleStateChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-porch-teal focus:border-transparent"
                >
                  <option value="">Select your state...</option>
                  {STATE_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  County{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={setupCounty}
                  onChange={(e) => setSetupCounty(e.target.value)}
                  placeholder="e.g. Mecklenburg"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-porch-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Combined Tax Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="20"
                  value={setupRate}
                  onChange={(e) => setSetupRate(e.target.value)}
                  placeholder="e.g. 8.25"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-porch-teal focus:border-transparent"
                />
                {setupState && STATE_TAX_RATES[setupState] && (
                  <p className="text-xs text-blue-600 mt-1">
                    State base rate: {(STATE_TAX_RATES[setupState].rate * 100).toFixed(2)}%
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filing Frequency
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSetupFrequency("monthly")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      setupFrequency === "monthly"
                        ? "bg-porch-teal text-white border-porch-teal"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setSetupFrequency("quarterly")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      setupFrequency === "quarterly"
                        ? "bg-porch-teal text-white border-porch-teal"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Quarterly
                  </button>
                </div>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={saving || !setupState || !setupRate}
                className="w-full bg-porch-teal text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-porch-teal-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Tax Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Year Selector */}
        <div className="flex items-center gap-2 mb-4">
          {yearOptions.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                year === y
                  ? "bg-porch-brown text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* YTD Summary Card */}
        {data && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Sales Tax Summary &mdash; {year}
            </h2>

            {!hasSalesData ? (
              <div className="text-center py-4">
                <p className="text-gray-500 text-sm">
                  No sales data yet. Connect Square or sync your bank to start
                  tracking sales tax automatically.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Total Tax Collected
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {fmt(data.yearToDate.taxCollected)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Already Paid to State
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {fmt(data.yearToDate.taxPaid)}
                    </span>
                  </div>
                  <div className="border-t border-gray-200 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-900">
                        Still Owed
                      </span>
                      <span
                        className={`text-lg font-bold ${
                          data.yearToDate.taxOwed > 0
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                      >
                        {fmt(Math.max(0, data.yearToDate.taxOwed))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tax info line */}
                {data.settings.state && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      Tax Rate: {pctFmt(data.settings.taxRate)}
                      {stateInfo && ` (${stateInfo.name}`}
                      {data.settings.county && `, ${data.settings.county} County`}
                      {stateInfo && ")"}
                      {" "}
                      &bull; Filing:{" "}
                      {data.settings.filingFrequency === "monthly"
                        ? "Monthly"
                        : "Quarterly"}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Period Toggle */}
        {hasSalesData && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setViewMode("quarterly")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "quarterly"
                  ? "bg-porch-teal text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              Quarterly
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "monthly"
                  ? "bg-porch-teal text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              Monthly
            </button>
          </div>
        )}

        {/* Period Breakdown Cards */}
        {hasSalesData && data && (
          <div className="space-y-3">
            {data.periods.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl shadow-sm p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {p.label}
                  </h3>
                  {getStatusBadge(p.status, p.taxCollected)}
                </div>

                {p.daysWithSales > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">
                        Total Sales
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {fmt(p.totalRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">
                        Tax Collected
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {fmt(p.taxCollected)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">Due Date</span>
                      <span className="text-xs text-gray-600">
                        {formatDueDate(p.dueDate)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{p.daysWithSales} days with sales</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    No sales recorded for this period
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* No data at all */}
        {!hasSalesData && data && !showSetup && data.settings.state && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <p className="text-gray-500 text-sm">
              No sales data yet for {year}. Connect Square or sync your bank to
              start tracking sales tax automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
