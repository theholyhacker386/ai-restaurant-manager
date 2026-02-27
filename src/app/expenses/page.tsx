"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Category {
  id: string;
  name: string;
  type: string;
}

interface Expense {
  id: string;
  category_name: string;
  category_type: string;
  description: string;
  amount: number;
  date: string;
  is_recurring: number;
}

interface MonthOption {
  month_key: string;
  label: string;
  start_date: string;
  end_date: string;
}

function marginColor(pct: number) {
  if (pct >= 15) return "text-status-good";
  if (pct >= 5) return "text-status-warning";
  return "text-status-danger";
}

function marginBg(pct: number) {
  if (pct >= 15) return "bg-emerald-50";
  if (pct >= 5) return "bg-amber-50";
  return "bg-red-50";
}

function statusColor(s: string) {
  return s === "good"
    ? "text-status-good"
    : s === "warning"
    ? "text-status-warning"
    : "text-status-danger";
}
function statusBg(s: string) {
  return s === "good"
    ? "bg-status-good"
    : s === "warning"
    ? "bg-status-warning"
    : "bg-status-danger";
}
function statusBgLight(s: string) {
  return s === "good"
    ? "bg-status-good/10"
    : s === "warning"
    ? "bg-status-warning/10"
    : "bg-status-danger/10";
}

/** Calculate % change between two numbers. Positive = increase. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Format a dollar amount compactly */
function fmtDollar(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export default function ExpensesPage() {
  const [fin, setFin] = useState<any>(null);
  const [compareFin, setCompareFin] = useState<any>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "kpis" | "expenses">("overview");

  // Month picker state
  const [availableMonths, setAvailableMonths] = useState<MonthOption[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<MonthOption | null>(null);
  const [compareMonth, setCompareMonth] = useState<MonthOption | null>(null);
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  // Category drill-down state
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillCategoryName, setDrillCategoryName] = useState("");
  const [drillExpenses, setDrillExpenses] = useState<Expense[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  async function openDrillDown(categoryId: string, categoryName: string) {
    if (!selectedMonth) return;
    setDrillOpen(true);
    setDrillCategoryName(categoryName);
    setDrillLoading(true);
    try {
      const res = await fetch(`/api/expenses?categoryId=${categoryId}&startDate=${selectedMonth.start_date}&endDate=${selectedMonth.end_date}`);
      if (res.ok) {
        const data = await res.json();
        setDrillExpenses(data.expenses || []);
      }
    } catch { /* silent */ } finally {
      setDrillLoading(false);
    }
  }

  async function openDrillDownByType(categoryType: string, label: string) {
    if (!selectedMonth) return;
    setDrillOpen(true);
    setDrillCategoryName(label);
    setDrillLoading(true);
    try {
      const res = await fetch(`/api/expenses?categoryType=${categoryType}&startDate=${selectedMonth.start_date}&endDate=${selectedMonth.end_date}`);
      if (res.ok) {
        const data = await res.json();
        setDrillExpenses(data.expenses || []);
      }
    } catch { /* silent */ } finally {
      setDrillLoading(false);
    }
  }

  // Add expense form
  const [showAddForm, setShowAddForm] = useState(false);
  const [formCat, setFormCat] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formAmt, setFormAmt] = useState("");
  const [formDate, setFormDate] = useState(
    new Date().toISOString().substring(0, 10)
  );
  const [formRecurring, setFormRecurring] = useState(false);
  const [formFreq, setFormFreq] = useState("monthly");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Load available months on mount
  useEffect(() => {
    async function loadMonths() {
      try {
        const res = await fetch("/api/statements/months");
        if (res.ok) {
          const data = await res.json();
          const months: MonthOption[] = data.months || [];
          setAvailableMonths(months);
          if (months.length > 0) {
            setSelectedMonth(months[0]); // most recent completed month
            if (months.length > 1) {
              setCompareMonth(months[1]); // previous month for comparison
            }
          }
        }
      } catch { /* silent */ }
    }
    loadMonths();
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedMonth) return;
    setLoading(true);
    const { start_date: startDate, end_date: endDate } = selectedMonth;
    try {
      // Fetch selected month data + comparison month data in parallel
      const fetches: Promise<Response>[] = [
        fetch(`/api/financials?startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/expenses?startDate=${startDate}&endDate=${endDate}`),
      ];
      if (compareMonth) {
        fetches.push(
          fetch(`/api/financials?startDate=${compareMonth.start_date}&endDate=${compareMonth.end_date}`)
        );
      }

      const results = await Promise.all(fetches);

      if (results[0].ok) setFin(await results[0].json());
      if (results[1].ok) {
        const eData = await results[1].json();
        setExpenses(eData.expenses || []);
        setCategories(eData.categories || []);
        if (!formCat && eData.categories?.length > 0)
          setFormCat(eData.categories[0].id);
      }
      if (compareMonth && results[2]?.ok) {
        setCompareFin(await results[2].json());
      } else {
        setCompareFin(null);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, compareMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close compare dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (compareRef.current && !compareRef.current.contains(e.target as Node)) {
        setShowCompareDropdown(false);
      }
    }
    if (showCompareDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showCompareDropdown]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!formDesc.trim() || !formAmt || !formDate) {
      setFormError("Please fill in all the fields");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: formCat || null,
          description: formDesc.trim(),
          amount: parseFloat(formAmt),
          date: formDate,
          is_recurring: formRecurring,
          recurring_frequency: formRecurring ? formFreq : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setFormDesc("");
      setFormAmt("");
      setShowAddForm(false);
      await fetchData();
    } catch (err: any) {
      setFormError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    await fetchData();
  }

  // Group categories by type for the form dropdown
  const catGroups: Record<string, Category[]> = {};
  categories.forEach((c) => {
    if (!catGroups[c.type]) catGroups[c.type] = [];
    catGroups[c.type].push(c);
  });
  const typeLabels: Record<string, string> = {
    cogs: "Food & Supplies",
    labor: "Labor & Payroll",
    occupancy: "Rent & Property",
    utilities: "Utilities",
    direct_ops: "Cleaning & Maintenance",
    marketing: "Marketing",
    technology: "Technology",
    admin: "Admin & Insurance",
    repairs: "Maintenance & Repairs",
    regulatory: "Licenses & Permits",
    financial: "Loans & Depreciation",
    other: "Other",
    overhead: "Overhead",
  };

  function handleMonthSelect(month: MonthOption) {
    setSelectedMonth(month);
    // Auto-set comparison to the next month in the list (previous chronological month)
    const idx = availableMonths.findIndex((m) => m.month_key === month.month_key);
    if (idx < availableMonths.length - 1) {
      setCompareMonth(availableMonths[idx + 1]);
    } else {
      setCompareMonth(null);
    }
  }

  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
        <h1 className="text-2xl font-display font-bold">Profit & Loss</h1>
        <p className="text-porch-cream/70 text-sm mt-1">
          {selectedMonth
            ? `${selectedMonth.label} P&L Statement`
            : "Track every dollar like a franchise"}
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Controls */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
          {/* Month pills — horizontal scrollable row */}
          {availableMonths.length > 0 ? (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold text-porch-brown-light/50 uppercase tracking-wider">Month</span>
                {/* Compare picker */}
                {availableMonths.length > 1 && (
                  <div className="relative ml-auto" ref={compareRef}>
                    <button
                      onClick={() => setShowCompareDropdown(!showCompareDropdown)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-porch-cream text-porch-brown-light hover:bg-porch-cream-dark/30 transition-colors"
                    >
                      <span>vs.</span>
                      <span className="font-semibold text-porch-brown">
                        {compareMonth ? compareMonth.label : "None"}
                      </span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showCompareDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl border border-porch-cream-dark/50 shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
                        <button
                          onClick={() => { setCompareMonth(null); setShowCompareDropdown(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-porch-cream transition-colors ${
                            !compareMonth ? "font-bold text-porch-teal" : "text-porch-brown-light"
                          }`}
                        >
                          No comparison
                        </button>
                        {availableMonths
                          .filter((m) => m.month_key !== selectedMonth?.month_key)
                          .map((m) => (
                            <button
                              key={m.month_key}
                              onClick={() => { setCompareMonth(m); setShowCompareDropdown(false); }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-porch-cream transition-colors ${
                                compareMonth?.month_key === m.month_key ? "font-bold text-porch-teal" : "text-porch-brown-light"
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                {availableMonths.map((m) => (
                  <button
                    key={m.month_key}
                    onClick={() => handleMonthSelect(m)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      selectedMonth?.month_key === m.month_key
                        ? "bg-porch-teal text-white"
                        : "bg-porch-cream text-porch-brown-light"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-3 text-center py-2">
              <p className="text-xs text-porch-brown-light/50">Loading months...</p>
            </div>
          )}

          {/* Period header with comparison label */}
          {selectedMonth && compareMonth && compareFin && (
            <div className="mb-3 px-1">
              <p className="text-[10px] text-porch-brown-light/50">
                Comparing to <span className="font-semibold text-porch-brown-light/70">{compareMonth.label}</span>
              </p>
            </div>
          )}

          {/* Tab selector */}
          <div className="flex gap-1 bg-porch-cream rounded-xl p-1">
            {(["overview", "kpis", "expenses"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t
                    ? "bg-white text-porch-brown shadow-sm"
                    : "text-porch-brown-light/60"
                }`}
              >
                {t === "overview"
                  ? "P&L"
                  : t === "kpis"
                  ? "KPIs"
                  : "Add Costs"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-teal" />
          </div>
        ) : tab === "overview" ? (
          <>
            {/* Comparison summary card — shows 4 key metrics side-by-side */}
            {compareFin && fin && <ComparisonSummary fin={fin} compareFin={compareFin} compareLabel={compareMonth?.label || ""} />}
            <PLTab fin={fin} compareFin={compareFin} onDrillDown={openDrillDown} onDrillDownByType={openDrillDownByType} />
          </>
        ) : tab === "kpis" ? (
          <KPITab fin={fin} compareFin={compareFin} compareLabel={compareMonth?.label || ""} />
        ) : (
          /* Add Costs tab */
          <div className="space-y-4">
            {/* Quick links */}
            <Link
              href="/expenses/utilities"
              className="flex items-center justify-between bg-white rounded-2xl border border-porch-cream-dark/50 p-4 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">⚡</span>
                <div>
                  <p className="text-sm font-semibold text-porch-brown">Utility Bill Tracker</p>
                  <p className="text-[10px] text-porch-brown-light/50">Track electric, gas, water &amp; project costs</p>
                </div>
              </div>
              <span className="text-porch-brown-light/30 text-lg">&rsaquo;</span>
            </Link>

            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full py-3 rounded-xl bg-porch-teal text-white font-semibold text-sm active:scale-[0.98] transition-transform"
              >
                + Add an Expense
              </button>
            ) : (
              <form
                onSubmit={handleAdd}
                className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4 space-y-4"
              >
                <h3 className="text-sm font-semibold text-porch-brown">
                  Add Expense
                </h3>
                <div>
                  <label className="block text-xs font-medium text-porch-brown-light/70 mb-1">
                    Category
                  </label>
                  <select
                    value={formCat}
                    onChange={(e) => setFormCat(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-porch-cream-dark text-sm bg-white focus:outline-none focus:ring-2 focus:ring-porch-teal/50"
                  >
                    {Object.entries(catGroups).map(([type, cats]) => (
                      <optgroup key={type} label={typeLabels[type] || type}>
                        {cats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-porch-brown-light/70 mb-1">
                    What is this for?
                  </label>
                  <input
                    type="text"
                    placeholder='e.g., "February rent" or "Electric bill"'
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-porch-cream-dark text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-porch-brown-light/70 mb-1">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-porch-brown-light/40 text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={formAmt}
                        onChange={(e) => setFormAmt(e.target.value)}
                        min="0"
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-porch-cream-dark text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-porch-brown-light/70 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-porch-cream-dark text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/50"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFormRecurring(!formRecurring)}
                    className={`w-10 h-6 rounded-full transition-colors ${
                      formRecurring ? "bg-porch-teal" : "bg-porch-cream-dark"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform mx-1 ${
                        formRecurring ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="text-xs text-porch-brown-light/70">
                    Repeats
                  </span>
                  {formRecurring && (
                    <select
                      value={formFreq}
                      onChange={(e) => setFormFreq(e.target.value)}
                      className="ml-auto px-2 py-1 rounded-lg border border-porch-cream-dark text-xs bg-white"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                    </select>
                  )}
                </div>
                {formError && (
                  <p className="text-xs text-status-danger">{formError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 py-2.5 rounded-xl border border-porch-cream-dark text-porch-brown-light text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-porch-teal text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            )}

            {expenses.length === 0 ? (
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
                <div className="text-4xl mb-3">💸</div>
                <p className="text-porch-brown font-medium">
                  No expenses entered yet
                </p>
                <p className="text-porch-brown-light/60 text-sm mt-1">
                  Add rent, utilities, insurance, and other costs to see the
                  full picture
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-porch-brown-light/40 px-1">
                  {expenses.length} expense
                  {expenses.length !== 1 ? "s" : ""}
                </p>
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="bg-white rounded-xl border border-porch-cream-dark/50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-porch-brown truncate">
                          {exp.description}
                        </p>
                        <p className="text-xs text-porch-brown-light/50">
                          {exp.category_name} —{" "}
                          {new Date(
                            exp.date + "T12:00:00"
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          {exp.is_recurring ? " (repeating)" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <p className="text-sm font-bold text-porch-brown">
                          ${exp.amount.toFixed(2)}
                        </p>
                        <button
                          onClick={() => handleDelete(exp.id)}
                          className="text-porch-brown-light/30 hover:text-status-danger transition-colors"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category Drill-Down Modal */}
      {drillOpen && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrillOpen(false)} />
          <div className="relative mt-auto max-h-[80vh] bg-white rounded-t-2xl overflow-hidden flex flex-col animate-slide-up">
            {/* Header */}
            <div className="px-4 py-3 border-b border-porch-cream-dark/30 flex items-center justify-between shrink-0">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-porch-brown truncate">{drillCategoryName}</h3>
                <p className="text-[10px] text-porch-brown-light/50">
                  {drillExpenses.length} transaction{drillExpenses.length !== 1 ? "s" : ""} — ${drillExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} total
                </p>
              </div>
              <button
                onClick={() => setDrillOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-porch-cream transition-colors"
              >
                <svg className="w-5 h-5 text-porch-brown-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Transaction list */}
            <div className="overflow-y-auto flex-1 px-4 py-2">
              {drillLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-porch-teal" />
                </div>
              ) : drillExpenses.length === 0 ? (
                <p className="text-center text-sm text-porch-brown-light/50 py-8">No transactions found for this period</p>
              ) : (
                <div className="space-y-1">
                  {drillExpenses.map((exp) => (
                    <div key={exp.id} className="flex items-start justify-between py-2.5 border-b border-porch-cream-dark/10 last:border-b-0">
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-xs text-porch-brown leading-tight">{exp.description}</p>
                        <p className="text-[10px] text-porch-brown-light/40 mt-0.5">
                          {new Date(exp.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-porch-brown shrink-0">
                        ${exp.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   COMPARISON SUMMARY — 4 key metrics side-by-side
   Shows at top of P&L when comparison month is active
   ═══════════════════════════════════════════ */

function ComparisonSummary({ fin, compareFin, compareLabel }: { fin: any; compareFin: any; compareLabel: string }) {
  if (!fin || !compareFin) return null;

  const revenue = fin.revenue?.total || 0;
  const prevRevenue = compareFin.revenue?.total || 0;
  const foodCost = fin.foodCost?.total || 0;
  const prevFoodCost = compareFin.foodCost?.total || 0;
  const labor = fin.labor?.total || 0;
  const prevLabor = compareFin.labor?.total || 0;
  const profit = fin.profit?.total || 0;
  const prevProfit = compareFin.profit?.total || 0;

  return (
    <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-porch-brown">Month-over-Month</h2>
        <span className="text-[10px] text-porch-brown-light/40">vs. {compareLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CompareMetric label="Revenue" current={revenue} previous={prevRevenue} higherIsGood />
        <CompareMetric label="Food Cost" current={foodCost} previous={prevFoodCost} higherIsGood={false} />
        <CompareMetric label="Labor" current={labor} previous={prevLabor} higherIsGood={false} />
        <CompareMetric label="Net Profit" current={profit} previous={prevProfit} higherIsGood />
      </div>
    </div>
  );
}

function CompareMetric({ label, current, previous, higherIsGood }: {
  label: string;
  current: number;
  previous: number;
  higherIsGood: boolean;
}) {
  const change = pctChange(current, previous);
  const isUp = change !== null && change > 0;
  const isDown = change !== null && change < 0;
  const isGood = higherIsGood ? isUp : isDown;
  const isBad = higherIsGood ? isDown : isUp;

  return (
    <div className={`rounded-xl p-2.5 ${isGood ? "bg-emerald-50" : isBad ? "bg-red-50" : "bg-porch-cream/50"}`}>
      <p className="text-[10px] text-porch-brown-light/60 font-medium">{label}</p>
      <p className="text-sm font-bold text-porch-brown">{fmtDollar(current)}</p>
      {change !== null && change !== 0 ? (
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[10px] font-bold ${isGood ? "text-emerald-600" : isBad ? "text-red-600" : "text-porch-brown-light/50"}`}>
            {isUp ? "\u2191" : "\u2193"} {Math.abs(change)}%
          </span>
          <span className="text-[9px] text-porch-brown-light/30">({fmtDollar(previous)})</span>
        </div>
      ) : (
        <p className="text-[10px] text-porch-brown-light/30 mt-0.5">No change</p>
      )}
    </div>
  );
}

/* ── Change Indicator — inline arrow shown next to P&L line items ── */

function ChangeIndicator({ current, previous, higherIsGood = false, showDollar = false }: {
  current: number;
  previous: number;
  higherIsGood?: boolean;
  showDollar?: boolean;
}) {
  const change = pctChange(current, previous);
  if (change === null || change === 0) return null;
  const isUp = change > 0;
  const isGood = higherIsGood ? isUp : !isUp;

  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold ml-1.5 ${isGood ? "text-emerald-500" : "text-red-500"}`}>
      {isUp ? "\u2191" : "\u2193"}{Math.abs(change)}%
      {showDollar && (
        <span className="font-normal text-[8px]">({fmtDollar(Math.abs(current - previous))})</span>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════
   P&L TAB — Full Profit & Loss Statement
   Structured: Revenue → COGS → Gross Profit → Labor → Overhead → Net Profit
   ═══════════════════════════════════════════ */

function PLTab({ fin, compareFin, onDrillDown, onDrillDownByType }: {
  fin: any;
  compareFin?: any;
  onDrillDown: (categoryId: string, categoryName: string) => void;
  onDrillDownByType: (categoryType: string, label: string) => void;
}) {
  if (!fin || fin.revenue?.total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-porch-brown font-medium">No financial data yet</p>
        <p className="text-porch-brown-light/60 text-sm mt-1">
          Sync your sales from Square first, then add your expenses here
        </p>
      </div>
    );
  }

  // Calculate overhead total (everything that's not food/labor)
  const overheadTotal =
    (fin.occupancy?.total || 0) +
    (fin.utilities?.total || 0) +
    (fin.directOps?.total || 0) +
    (fin.marketing?.total || 0) +
    (fin.technology?.total || 0) +
    (fin.admin?.total || 0) +
    (fin.repairs?.total || 0) +
    (fin.financialCosts?.total || 0) +
    (fin.otherCosts?.total || 0);

  const overheadPct =
    fin.revenue.total > 0
      ? Math.round((overheadTotal / fin.revenue.total) * 1000) / 10
      : 0;

  // Gross profit = Revenue - COGS - Labor
  const grossProfit = fin.revenue.total - fin.foodCost.total - fin.labor.total;
  const grossProfitPct =
    fin.revenue.total > 0
      ? Math.round((grossProfit / fin.revenue.total) * 1000) / 10
      : 0;

  // Comparison values
  const prevOverheadTotal = compareFin
    ? (compareFin.occupancy?.total || 0) +
      (compareFin.utilities?.total || 0) +
      (compareFin.directOps?.total || 0) +
      (compareFin.marketing?.total || 0) +
      (compareFin.technology?.total || 0) +
      (compareFin.admin?.total || 0) +
      (compareFin.repairs?.total || 0) +
      (compareFin.financialCosts?.total || 0) +
      (compareFin.otherCosts?.total || 0)
    : 0;

  const prevGrossProfit = compareFin
    ? (compareFin.revenue?.total || 0) - (compareFin.foodCost?.total || 0) - (compareFin.labor?.total || 0)
    : 0;

  return (
    <div className="space-y-3">
      {/* Period summary */}
      <div className="text-center py-1">
        <p className="text-[10px] text-porch-brown-light/40 uppercase tracking-wider font-semibold">
          {fin.period.days}-day P&L Statement
        </p>
      </div>

      {/* ── SECTION 1: REVENUE ── */}
      <PLSection title="Revenue" icon="💰">
        <PLLineItem label="Gross Sales" amount={fin.revenue.gross_sales} compareAmount={compareFin?.revenue?.gross_sales} higherIsGood />
        <PLLineItem
          label="Discounts"
          amount={-fin.revenue.discounts}
          negative
        />
        <PLSubtotal
          label="Net Sales"
          amount={fin.revenue.total}
          highlight
          compareAmount={compareFin?.revenue?.total}
          higherIsGood
        />
        <div className="px-4 pb-2 flex gap-4 text-[10px] text-porch-brown-light/40">
          <span>{fin.revenue.orders} orders</span>
          <span>${fin.revenue.daily_average.toFixed(0)}/day avg</span>
          <span>${fin.revenue.avg_ticket.toFixed(2)}/ticket</span>
        </div>
      </PLSection>

      {/* ── SECTION 2: COST OF GOODS SOLD (COGS) ── */}
      <PLSection title="Cost of Goods Sold" icon="🍗">
        {fin.foodCost.breakdown && fin.foodCost.breakdown.length > 0 ? (
          fin.foodCost.breakdown.map((b: any, i: number) => (
            <PLLineItem key={i} label={b.name} amount={b.amount} categoryId={b.category_id} onDrillDown={onDrillDown} />
          ))
        ) : null}
        {fin.foodCost.theoretical > 0 && (
          <PLLineItem label="Recipe-Based Food Cost" amount={fin.foodCost.theoretical} />
        )}
        <PLSubtotal
          label="Total COGS"
          amount={fin.foodCost.total}
          pct={fin.foodCost.percentage}
          status={fin.foodCost.status}
          target={fin.foodCost.benchmark?.target}
          compareAmount={compareFin?.foodCost?.total}
        />
      </PLSection>

      {/* ── SECTION 3: LABOR ── */}
      <PLSection title="Labor" icon="👥">
        {fin.labor.breakdown && fin.labor.breakdown.length > 0 &&
          fin.labor.breakdown.map((b: any, i: number) => (
            <PLLineItem key={i} label={b.name} amount={b.amount} />
          ))
        }
        <PLSubtotal
          label="Total Labor"
          amount={fin.labor.total}
          pct={fin.labor.percentage}
          status={fin.labor.status}
          target={fin.labor.benchmark?.target}
          compareAmount={compareFin?.labor?.total}
        />
        {fin.labor.total_hours > 0 && (
          <div className="px-4 pb-2 text-[10px] text-porch-brown-light/40">
            {fin.labor.total_hours} hours across {fin.labor.total_shifts} shifts
          </div>
        )}
      </PLSection>

      {/* ── SECTION 4: GROSS PROFIT (after food + labor) ── */}
      <div className={`rounded-2xl border border-porch-cream-dark/50 overflow-hidden ${marginBg(grossProfitPct)}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">📈</span>
            <span className="text-sm font-bold text-porch-brown">Gross Profit</span>
          </div>
          <div className="text-right flex items-center gap-1">
            <span className={`text-lg font-bold ${marginColor(grossProfitPct)}`}>
              ${grossProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
            <span className={`text-xs font-semibold ${marginColor(grossProfitPct)}`}>
              {grossProfitPct}%
            </span>
            {compareFin && <ChangeIndicator current={grossProfit} previous={prevGrossProfit} higherIsGood />}
          </div>
        </div>
        <div className="px-4 pb-3">
          <p className="text-[10px] text-porch-brown-light/50">
            What&apos;s left after food and labor (your two biggest costs). Healthy cafes aim for 35-45%.
          </p>
        </div>
      </div>

      {/* ── SECTION 5: OVERHEAD ── */}
      <PLSection title="Overhead & Operating Costs" icon="🏢">
        <OverheadRow label="Rent & Property" data={fin.occupancy} compareData={compareFin?.occupancy} expenseType="occupancy" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <OverheadRow label="Utilities" data={fin.utilities} compareData={compareFin?.utilities} expenseType="utilities" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <OverheadRow label="Cleaning & Maintenance" data={fin.directOps} compareData={compareFin?.directOps} expenseType="direct_ops" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <OverheadRow label="Marketing" data={fin.marketing} compareData={compareFin?.marketing} expenseType="marketing" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <OverheadRow label="Technology & Processing" data={fin.technology} compareData={compareFin?.technology} expenseType="technology" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <OverheadRow label="Admin & Insurance" data={fin.admin} compareData={compareFin?.admin} expenseType="admin" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <OverheadRow label="Maintenance & Repairs" data={fin.repairs} compareData={compareFin?.repairs} expenseType="repairs" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <OverheadRow label="Loans & Depreciation" data={fin.financialCosts} compareData={compareFin?.financialCosts} expenseType="financial" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <OverheadRow label="Other" data={fin.otherCosts} compareData={compareFin?.otherCosts} expenseType="other" onDrillDown={onDrillDown} onDrillDownByType={onDrillDownByType} />
        <PLSubtotal
          label="Total Overhead"
          amount={overheadTotal}
          pct={overheadPct}
          compareAmount={compareFin ? prevOverheadTotal : undefined}
        />
        {overheadTotal === 0 && (
          <div className="px-4 pb-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <p className="text-xs text-amber-700 font-medium">
                No overhead expenses entered yet
              </p>
              <p className="text-[10px] text-amber-600 mt-0.5">
                Add rent, utilities, insurance, and other costs in the &quot;Add Costs&quot; tab to see your complete P&L
              </p>
            </div>
          </div>
        )}
      </PLSection>

      {/* ── SECTION 6: OPERATING PROFIT ── */}
      {fin.operatingProfit && (
        <div className={`rounded-2xl border border-porch-cream-dark/50 overflow-hidden ${
          fin.operatingProfit.total >= 0 ? "bg-blue-50" : "bg-red-50"
        }`}>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-porch-brown-light/50">
                  Operating Profit
                </p>
                <p className="text-[10px] text-porch-brown-light/40 mt-0.5">
                  Before taxes
                </p>
              </div>
              <div className="text-right flex items-center gap-1">
                <div>
                  <p className={`text-xl font-bold ${fin.operatingProfit.total >= 0 ? "text-blue-700" : "text-red-700"}`}>
                    {fin.operatingProfit.total < 0 && "-"}${Math.abs(fin.operatingProfit.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-xs font-semibold text-blue-600">{fin.operatingProfit.percentage}% margin</span>
                </div>
                {compareFin?.operatingProfit && (
                  <ChangeIndicator current={fin.operatingProfit.total} previous={compareFin.operatingProfit.total} higherIsGood />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 7: TAXES ── */}
      {((fin.incomeTax && fin.incomeTax.total > 0) || (fin.salesTax && fin.salesTax.paid > 0)) && (
        <PLSection title="Taxes" icon="🏛️">
          {fin.incomeTax && fin.incomeTax.total > 0 && (
            <PLLineItem label="Income Tax" amount={fin.incomeTax.total} />
          )}
          {fin.incomeTax && fin.incomeTax.total > 0 && (
            <PLSubtotal
              label="Total Income Tax"
              amount={fin.incomeTax.total}
              pct={fin.incomeTax.percentage}
            />
          )}
          {fin.salesTax && fin.salesTax.paid > 0 && (
            <div className="px-4 py-2 bg-blue-50/50 border-t border-porch-cream-dark/10">
              <p className="text-[10px] text-blue-700 font-medium">Sales Tax (pass-through — not a business expense)</p>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-blue-600">Collected from customers</span>
                <span className="text-[10px] text-blue-600">${fin.salesTax.collected.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px] text-blue-600">Paid to state</span>
                <span className="text-[10px] text-blue-600">${fin.salesTax.paid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
        </PLSection>
      )}

      {/* ── SECTION 8: NET PROFIT ── */}
      <div
        className={`rounded-2xl border-2 overflow-hidden ${
          fin.profit.total >= 0
            ? "border-emerald-300 bg-emerald-50"
            : "border-red-300 bg-red-50"
        }`}
      >
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-porch-brown-light/50">
                {fin.profit.total >= 0 ? "Net Profit" : "Net Loss"}
              </p>
              <p className="text-[10px] text-porch-brown-light/40 mt-0.5">
                After all expenses & taxes
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 justify-end">
                <p
                  className={`text-2xl font-bold ${
                    fin.profit.total >= 0
                      ? "text-emerald-700"
                      : "text-red-700"
                  }`}
                >
                  {fin.profit.total < 0 && "-"}$
                  {Math.abs(fin.profit.total).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </p>
                {compareFin && (
                  <ChangeIndicator current={fin.profit.total} previous={compareFin.profit?.total || 0} higherIsGood />
                )}
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    fin.profit.percentage >= 15
                      ? "bg-status-good"
                      : fin.profit.percentage >= 5
                      ? "bg-status-warning"
                      : "bg-status-danger"
                  }`}
                />
                <span
                  className={`text-sm font-bold ${
                    fin.profit.percentage >= 15
                      ? "text-status-good"
                      : fin.profit.percentage >= 5
                      ? "text-status-warning"
                      : "text-status-danger"
                  }`}
                >
                  {fin.profit.percentage}% margin
                </span>
              </div>
            </div>
          </div>

          {/* Profit per order */}
          {fin.profit.per_order !== 0 && (
            <div className="mt-3 pt-3 border-t border-porch-brown/10 flex items-center justify-between">
              <span className="text-xs text-porch-brown-light/50">Profit per order</span>
              <span className={`text-sm font-semibold ${
                fin.profit.per_order >= 0 ? "text-emerald-700" : "text-red-700"
              }`}>
                ${fin.profit.per_order.toFixed(2)}
              </span>
            </div>
          )}

          {/* Smart recommendation */}
          {fin.kpis?.recommendation && (
            <div className={`mt-3 rounded-xl px-3 py-2 ${
              fin.kpis.recommendation.status === "good"
                ? "bg-emerald-100"
                : fin.kpis.recommendation.status === "warning"
                ? "bg-amber-100"
                : "bg-red-100"
            }`}>
              <p className="text-[10px] font-semibold text-porch-brown/80 mb-1">
                {fin.kpis.recommendation.summary}
              </p>
              {fin.kpis.recommendation.areas && fin.kpis.recommendation.areas.map((area: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    area.status === "good" ? "bg-emerald-500" : area.status === "warning" ? "bg-amber-500" : "bg-red-500"
                  }`} />
                  <p className="text-[10px] text-porch-brown-light/60">{area.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Where Every Dollar Goes — visual bar */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
        <h2 className="text-xs font-semibold text-porch-brown mb-2">
          Where Every Dollar Goes
        </h2>
        <div className="h-7 rounded-full overflow-hidden flex bg-porch-cream">
          {fin.foodCost.percentage > 0 && (
            <div
              className="bg-amber-400 flex items-center justify-center"
              style={{
                width: `${Math.min(fin.foodCost.percentage, 100)}%`,
              }}
            >
              {fin.foodCost.percentage >= 8 && (
                <span className="text-[8px] font-bold text-white">
                  {fin.foodCost.percentage}%
                </span>
              )}
            </div>
          )}
          {fin.labor.percentage > 0 && (
            <div
              className="bg-blue-400 flex items-center justify-center"
              style={{
                width: `${Math.min(fin.labor.percentage, 100)}%`,
              }}
            >
              {fin.labor.percentage >= 8 && (
                <span className="text-[8px] font-bold text-white">
                  {fin.labor.percentage}%
                </span>
              )}
            </div>
          )}
          {overheadPct > 0 && (
            <div
              className="bg-purple-400 flex items-center justify-center"
              style={{
                width: `${Math.min(overheadPct, 100)}%`,
              }}
            >
              {overheadPct >= 8 && (
                <span className="text-[8px] font-bold text-white">
                  {overheadPct.toFixed(1)}%
                </span>
              )}
            </div>
          )}
          {fin.profit.percentage > 0 && (
            <div
              className="bg-emerald-400 flex items-center justify-center"
              style={{
                width: `${Math.min(fin.profit.percentage, 100)}%`,
              }}
            >
              {fin.profit.percentage >= 6 && (
                <span className="text-[8px] font-bold text-white">
                  {fin.profit.percentage}%
                </span>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 text-center mt-2">
          <LegendDot color="bg-amber-400" label="Food" pct={fin.foodCost.percentage} />
          <LegendDot color="bg-blue-400" label="Labor" pct={fin.labor.percentage} />
          <LegendDot color="bg-purple-400" label="Overhead" pct={overheadPct} />
          <LegendDot color="bg-emerald-400" label="Profit" pct={fin.profit.percentage} />
        </div>
      </div>

      {/* Total summary card */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
        <h2 className="text-xs font-semibold text-porch-brown mb-3">
          Summary
        </h2>
        <div className="space-y-2 text-xs">
          <SummaryRow label="Net Sales" amount={fin.revenue.total} />
          <SummaryRow label="- Cost of Goods" amount={fin.foodCost.total} negative />
          <SummaryRow label="- Labor" amount={fin.labor.total} negative />
          <SummaryRow label="= Gross Profit" amount={grossProfit} bold />
          <SummaryRow label="- Overhead" amount={overheadTotal} negative />
          {fin.operatingProfit && (
            <div className="border-t border-porch-cream-dark/30 pt-2 mt-2">
              <SummaryRow label="= Operating Profit" amount={fin.operatingProfit.total} bold profit />
            </div>
          )}
          {fin.incomeTax && fin.incomeTax.total > 0 && (
            <SummaryRow label="- Income Tax" amount={fin.incomeTax.total} negative />
          )}
          <div className="border-t border-porch-cream-dark/30 pt-2 mt-2">
            <SummaryRow
              label={fin.profit.total >= 0 ? "= Net Profit" : "= Net Loss"}
              amount={fin.profit.total}
              bold
              profit
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── P&L Building Block Components ── */

function PLSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-porch-cream-dark/30 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h2 className="text-xs font-bold text-porch-brown uppercase tracking-wider">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function PLLineItem({
  label,
  amount,
  negative,
  categoryId,
  onDrillDown,
  compareAmount,
  higherIsGood,
}: {
  label: string;
  amount: number;
  negative?: boolean;
  categoryId?: string;
  onDrillDown?: (catId: string, catName: string) => void;
  compareAmount?: number;
  higherIsGood?: boolean;
}) {
  const canDrill = Boolean(categoryId && onDrillDown);
  function handleClick() {
    if (categoryId && onDrillDown) onDrillDown(categoryId, label);
  }
  return (
    <div
      className={`px-4 py-2 flex items-center justify-between border-b border-porch-cream-dark/10 last:border-b-0 ${canDrill ? "cursor-pointer active:bg-porch-cream/30" : ""}`}
      onClick={canDrill ? handleClick : undefined}
    >
      <span className={`text-xs text-porch-brown-light/70 ${canDrill ? "underline decoration-dotted underline-offset-2" : ""}`}>{label}</span>
      <span className={`text-xs flex items-center ${negative ? "text-status-danger" : "text-porch-brown"}`}>
        {negative && amount !== 0 ? "-" : ""}$
        {Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        {compareAmount !== undefined && compareAmount > 0 && (
          <ChangeIndicator current={amount} previous={compareAmount} higherIsGood={higherIsGood} />
        )}
      </span>
    </div>
  );
}

function PLSubtotal({
  label,
  amount,
  pct,
  status,
  target,
  highlight,
  compareAmount,
  higherIsGood,
}: {
  label: string;
  amount: number;
  pct?: number;
  status?: string;
  target?: number;
  highlight?: boolean;
  compareAmount?: number;
  higherIsGood?: boolean;
}) {
  return (
    <div className={`px-4 py-2.5 flex items-center justify-between ${
      highlight ? "bg-porch-cream/40" : "border-t border-porch-cream-dark/20"
    }`}>
      <span className="text-xs font-bold text-porch-brown">{label}</span>
      <div className="flex items-center gap-2">
        {status && (
          <span className={`w-2 h-2 rounded-full ${statusBg(status)}`} />
        )}
        <span className="text-xs font-bold text-porch-brown">
          ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
        {compareAmount !== undefined && (
          <ChangeIndicator current={amount} previous={compareAmount} higherIsGood={higherIsGood} />
        )}
        {pct !== undefined && (
          <span className="text-[10px] text-porch-brown-light/40 w-14 text-right">
            {pct}%
            {target ? <span className="text-porch-brown-light/25">/{target}%</span> : null}
          </span>
        )}
      </div>
    </div>
  );
}

function OverheadRow({ label, data, compareData, expenseType, onDrillDown, onDrillDownByType }: {
  label: string;
  data: any;
  compareData?: any;
  expenseType?: string;
  onDrillDown?: (catId: string, catName: string) => void;
  onDrillDownByType?: (type: string, lbl: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!data || data.total === 0) return null;

  const hasBreakdown = data.breakdown && data.breakdown.length > 1;
  const singleItem = data.breakdown && data.breakdown.length === 1;

  function handleRowClick() {
    if (singleItem && onDrillDown && data.breakdown[0].category_id) {
      onDrillDown(data.breakdown[0].category_id, data.breakdown[0].name);
    } else if (hasBreakdown) {
      setExpanded(!expanded);
    } else if (expenseType && onDrillDownByType) {
      onDrillDownByType(expenseType, label);
    }
  }

  return (
    <>
      <div
        className="px-4 py-2 flex items-center justify-between border-b border-porch-cream-dark/10 cursor-pointer active:bg-porch-cream/30"
        onClick={handleRowClick}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasBreakdown && (
            <svg
              className={`w-3 h-3 text-porch-brown-light/30 transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span className="text-xs text-porch-brown-light/70">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {data.status && (
            <span className={`w-2 h-2 rounded-full ${statusBg(data.status)}`} />
          )}
          <span className="text-xs text-porch-brown">
            ${data.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          {compareData?.total > 0 && (
            <ChangeIndicator current={data.total} previous={compareData.total} />
          )}
          <span className="text-[10px] text-porch-brown-light/40 w-10 text-right">
            {data.percentage}%
          </span>
          <svg className="w-3.5 h-3.5 text-porch-teal/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
      {expanded && data.breakdown && (
        <div className="bg-porch-cream/30 px-6 py-1">
          {data.breakdown.map((b: any, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 cursor-pointer active:bg-porch-cream/50 -mx-2 px-2 rounded-lg"
              onClick={() => { if (b.category_id && onDrillDown) onDrillDown(b.category_id, b.name); }}
            >
              <span className="text-[10px] text-porch-teal underline decoration-dotted underline-offset-2">{b.name}</span>
              <span className="text-[10px] text-porch-brown-light/80">
                ${b.amount.toFixed(2)}
              </span>
            </div>
          ))}
          {onDrillDownByType && expenseType && (
            <div
              className="flex items-center justify-center py-2 mt-1 cursor-pointer"
              onClick={() => onDrillDownByType(expenseType, label)}
            >
              <span className="text-[10px] font-semibold text-porch-teal">View all {label} transactions →</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SummaryRow({
  label,
  amount,
  bold,
  negative,
  profit,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  negative?: boolean;
  profit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? "font-bold text-porch-brown" : "text-porch-brown-light/60"}`}>
        {label}
      </span>
      <span
        className={`${
          bold ? "font-bold" : ""
        } ${
          profit
            ? amount >= 0
              ? "text-emerald-700"
              : "text-red-700"
            : negative
            ? "text-porch-brown-light/60"
            : "text-porch-brown"
        }`}
      >
        {profit && amount < 0 ? "-" : ""}$
        {Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}

function LegendDot({ color, label, pct }: { color: string; label: string; pct?: number }) {
  return (
    <div>
      <div className={`w-3 h-3 rounded-full ${color} mx-auto`} />
      <p className="text-[9px] text-porch-brown-light/60 mt-1">{label}</p>
      {pct !== undefined && (
        <p className="text-[9px] font-semibold text-porch-brown-light/80">{pct}%</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   KPI TAB — Key Performance Indicators
   ═══════════════════════════════════════════ */

function KPITab({ fin, compareFin, compareLabel }: { fin: any; compareFin?: any; compareLabel?: string }) {
  if (!fin || fin.revenue?.total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-8 text-center">
        <div className="text-4xl mb-3">📈</div>
        <p className="text-porch-brown font-medium">Need data first</p>
        <p className="text-porch-brown-light/60 text-sm mt-1">
          Sync sales and add expenses to see your KPIs
        </p>
      </div>
    );
  }

  const k = fin.kpis;
  const ck = compareFin?.kpis;

  return (
    <div className="space-y-3">
      {/* Prime Cost — THE #1 metric */}
      <KPICard
        title="Prime Cost"
        subtitle="The #1 number to watch"
        value={`${k.prime_cost.percentage}%`}
        detail={`$${k.prime_cost.total.toLocaleString("en-US", {
          minimumFractionDigits: 2,
        })} (Food + Labor)`}
        status={k.prime_cost.status}
        target={`Target: under ${k.prime_cost.benchmark.max}%`}
        explanation={k.prime_cost.explanation}
        compareValue={ck?.prime_cost?.percentage}
        compareSuffix="%"
        compareLabel={compareLabel}
        lowerIsGood
      />

      {/* Revenue Per Labor Hour */}
      <KPICard
        title="Revenue Per Labor Hour"
        subtitle="Are you overstaffed?"
        value={k.rplh.value > 0 ? `$${k.rplh.value.toFixed(2)}` : "—"}
        detail={
          k.rplh.value > 0
            ? `$${fin.revenue.total.toFixed(0)} revenue / ${fin.labor.total_hours} hours`
            : "No labor hour data yet"
        }
        status={k.rplh.status}
        target="Target: above $45/hr"
        explanation={k.rplh.explanation}
        compareValue={ck?.rplh?.value}
        comparePrefix="$"
        compareLabel={compareLabel}
      />

      {/* Break-Even */}
      <KPICard
        title="Break-Even Point"
        subtitle="How much to cover all costs"
        value={
          k.break_even.daily_needed > 0
            ? `$${k.break_even.daily_needed.toFixed(0)}/day`
            : "—"
        }
        detail={
          k.break_even.orders_needed > 0
            ? `${k.break_even.orders_needed} orders needed over ${fin.period.days} days ($${k.break_even.revenue_needed.toLocaleString("en-US", { minimumFractionDigits: 0 })} total)`
            : "Add your fixed costs (rent, insurance, etc.) to calculate"
        }
        status={
          fin.revenue.total > k.break_even.revenue_needed
            ? "good"
            : "danger"
        }
        target={
          fin.revenue.total > k.break_even.revenue_needed
            ? `You're $${(fin.revenue.total - k.break_even.revenue_needed).toFixed(0)} above break-even!`
            : `You need $${(k.break_even.revenue_needed - fin.revenue.total).toFixed(0)} more to break even`
        }
        explanation={k.break_even.explanation}
      />

      {/* Food Cost Variance */}
      <KPICard
        title="Food Cost Variance"
        subtitle="Expected vs. actual spending"
        value={
          k.food_cost_variance.value !== null
            ? `${Math.abs(k.food_cost_variance.value).toFixed(1)}%`
            : "—"
        }
        detail={
          k.food_cost_variance.value !== null
            ? `Theoretical: $${fin.foodCost.theoretical.toFixed(2)} | Actual purchases: $${fin.foodCost.actual_purchases.toFixed(2)}`
            : "Scan receipts and add recipes to compare expected vs. actual food costs"
        }
        status={k.food_cost_variance.status}
        target="Target: under 2% gap"
        explanation={k.food_cost_variance.explanation}
      />

      {/* Average Ticket */}
      <KPICard
        title="Average Ticket Size"
        subtitle="What each customer spends"
        value={`$${k.avg_ticket.value.toFixed(2)}`}
        detail={`${fin.revenue.orders} orders over ${fin.period.days} days`}
        explanation={k.avg_ticket.explanation}
        compareValue={ck?.avg_ticket?.value}
        comparePrefix="$"
        compareLabel={compareLabel}
      />

      {/* Controllable vs Fixed */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
        <h3 className="text-sm font-semibold text-porch-brown mb-1">
          Controllable vs. Fixed Costs
        </h3>
        <p className="text-[10px] text-porch-brown-light/50 mb-3">
          {k.controllable_vs_fixed.explanation}
        </p>
        <div className="flex gap-3">
          <div className="flex-1 bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-amber-700">
              {k.controllable_vs_fixed.controllable_pct}%
            </p>
            <p className="text-[10px] text-amber-600 font-medium">
              Controllable
            </p>
            <p className="text-[10px] text-amber-500">
              $
              {k.controllable_vs_fixed.controllable.toLocaleString("en-US", {
                minimumFractionDigits: 0,
              })}
            </p>
          </div>
          <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-blue-700">
              {k.controllable_vs_fixed.fixed_pct}%
            </p>
            <p className="text-[10px] text-blue-600 font-medium">Fixed</p>
            <p className="text-[10px] text-blue-500">
              $
              {k.controllable_vs_fixed.fixed.toLocaleString("en-US", {
                minimumFractionDigits: 0,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Gross Profit Margin */}
      <KPICard
        title="Gross Profit Margin"
        subtitle="Revenue minus food cost"
        value={`${fin.profit.gross_margin}%`}
        detail="Healthy cafes aim for 65-75%"
        status={
          fin.profit.gross_margin >= 65
            ? "good"
            : fin.profit.gross_margin >= 55
            ? "warning"
            : "danger"
        }
        explanation="This is what's left after paying for ingredients. Everything else (labor, rent, etc.) comes out of this."
        compareValue={compareFin?.profit?.gross_margin}
        compareSuffix="%"
        compareLabel={compareLabel}
      />

      {/* Daily Average Revenue */}
      <KPICard
        title="Daily Average Revenue"
        subtitle="Track this over time"
        value={`$${k.daily_avg_revenue.value.toFixed(0)}`}
        detail={`Based on ${fin.period.days} days of data`}
        explanation="Compare week to week. Growing? Great. Dropping? Figure out why."
        compareValue={ck?.daily_avg_revenue?.value}
        comparePrefix="$"
        compareLabel={compareLabel}
      />
    </div>
  );
}

function KPICard({
  title,
  subtitle,
  value,
  detail,
  status,
  target,
  explanation,
  compareValue,
  comparePrefix,
  compareSuffix,
  compareLabel,
  lowerIsGood,
}: {
  title: string;
  subtitle: string;
  value: string;
  detail: string;
  status?: string;
  target?: string;
  explanation: string;
  compareValue?: number;
  comparePrefix?: string;
  compareSuffix?: string;
  compareLabel?: string;
  lowerIsGood?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-porch-brown">{title}</h3>
          <p className="text-[10px] text-porch-brown-light/50">{subtitle}</p>
        </div>
        <div className="text-right">
          <p
            className={`text-xl font-bold ${
              status ? statusColor(status) : "text-porch-brown"
            }`}
          >
            {value}
          </p>
          {target && (
            <p className="text-[10px] text-porch-brown-light/40">{target}</p>
          )}
        </div>
      </div>
      <p className="text-xs text-porch-brown-light/60 mb-2">{detail}</p>

      {/* Comparison badge */}
      {compareValue !== undefined && compareValue > 0 && compareLabel && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-porch-cream/50 rounded-lg">
          <span className="text-[10px] text-porch-brown-light/50">{compareLabel}:</span>
          <span className="text-[10px] font-semibold text-porch-brown-light/70">
            {comparePrefix || ""}{typeof compareValue === "number" ? compareValue.toFixed(compareSuffix === "%" ? 1 : 2) : compareValue}{compareSuffix || ""}
          </span>
          {(() => {
            const currentNum = parseFloat(value.replace(/[^0-9.-]/g, ""));
            if (isNaN(currentNum) || compareValue === 0) return null;
            const diff = currentNum - compareValue;
            if (Math.abs(diff) < 0.1) return null;
            const isUp = diff > 0;
            const isGood = lowerIsGood ? !isUp : isUp;
            return (
              <span className={`text-[10px] font-bold ${isGood ? "text-emerald-500" : "text-red-500"}`}>
                {isUp ? "\u2191" : "\u2193"} {Math.abs(diff).toFixed(1)}{compareSuffix || ""}
              </span>
            );
          })()}
        </div>
      )}

      <div
        className={`rounded-xl p-2.5 ${
          status ? statusBgLight(status) : "bg-porch-cream/50"
        }`}
      >
        <p className="text-xs text-porch-brown-light/70">{explanation}</p>
      </div>
    </div>
  );
}
