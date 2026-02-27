"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

const UTILITY_TYPES = [
  { value: "electric", label: "Electric", unit: "kWh", icon: "⚡" },
  { value: "gas", label: "Natural Gas", unit: "therms", icon: "🔥" },
  { value: "water", label: "Water & Sewage", unit: "gal", icon: "💧" },
  { value: "internet", label: "Internet/Phone", unit: "", icon: "📡" },
  { value: "trash", label: "Trash/Recycling", unit: "", icon: "🗑️" },
];

function getTypeInfo(type: string) {
  return UTILITY_TYPES.find((t) => t.value === type) || UTILITY_TYPES[0];
}

export default function UtilitiesPage() {
  const [bills, setBills] = useState<any[]>([]);
  const [projections, setProjections] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeType, setActiveType] = useState("electric");
  const [form, setForm] = useState({
    utilityType: "electric",
    billDate: new Date().toISOString().split("T")[0],
    amount: "",
    usageQty: "",
    ratePerUnit: "",
    notes: "",
  });

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/utilities");
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills || []);
        setProjections(data.projections || {});
      }
    } catch (err) {
      console.error("Failed to load utilities:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const handleSubmit = async () => {
    if (!form.amount || !form.billDate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utilityType: form.utilityType,
          billDate: form.billDate,
          amount: parseFloat(form.amount),
          usageQty: form.usageQty ? parseFloat(form.usageQty) : null,
          usageUnit: getTypeInfo(form.utilityType).unit,
          ratePerUnit: form.ratePerUnit ? parseFloat(form.ratePerUnit) : null,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({
          utilityType: activeType,
          billDate: new Date().toISOString().split("T")[0],
          amount: "",
          usageQty: "",
          ratePerUnit: "",
          notes: "",
        });
        fetchBills();
      }
    } catch (err) {
      console.error("Failed to save bill:", err);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/utilities?id=${id}`, { method: "DELETE" });
      fetchBills();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  // Auto-calculate rate when amount and usage are both entered
  const autoRate =
    form.amount && form.usageQty && parseFloat(form.usageQty) > 0
      ? (parseFloat(form.amount) / parseFloat(form.usageQty)).toFixed(4)
      : "";

  const filteredBills = bills.filter((b) => b.utility_type === activeType);
  const typeInfo = getTypeInfo(activeType);
  const projection = projections[activeType];

  // Build simple bar chart data from filtered bills (last 12 months, oldest first)
  const chartBills = [...filteredBills]
    .sort((a, b) => a.bill_date.localeCompare(b.bill_date))
    .slice(-12);
  const maxBillAmount = Math.max(...chartBills.map((b) => b.amount), 1);

  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-porch-brown to-porch-brown/90 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/expenses"
            className="text-porch-cream/60 text-sm"
          >
            Expenses
          </Link>
          <span className="text-porch-cream/30 text-sm">/</span>
        </div>
        <h1 className="text-2xl font-display font-bold">Utility Bills</h1>
        <p className="text-porch-cream/70 text-sm mt-1">
          Track usage, rates & project future costs
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {/* Utility Type Selector */}
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-3">
          <div className="flex gap-2 overflow-x-auto">
            {UTILITY_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => {
                  setActiveType(type.value);
                  setForm((f) => ({ ...f, utilityType: type.value }));
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeType === type.value
                    ? "bg-porch-teal text-white"
                    : "bg-porch-cream text-porch-brown-light"
                }`}
              >
                <span>{type.icon}</span>
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-teal" />
          </div>
        ) : (
          <>
            {/* Projection Card */}
            {projection && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                    Avg Monthly
                  </p>
                  <p className="text-xl font-bold text-porch-brown mt-1">
                    ${projection.avgMonthly.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-porch-brown-light/50">
                    {projection.monthsOfData} months tracked
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                    Annual Projection
                  </p>
                  <p className="text-xl font-bold text-porch-brown mt-1">
                    ${projection.annualProjection.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-porch-brown-light/50">
                    based on current trends
                  </p>
                </div>
                {projection.latestRate > 0 && typeInfo.unit && (
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                      Latest Rate
                    </p>
                    <p className="text-xl font-bold text-porch-brown mt-1">
                      ${projection.latestRate.toFixed(4)}
                    </p>
                    <p className="text-[10px] text-porch-brown-light/50">
                      per {typeInfo.unit}
                    </p>
                  </div>
                )}
                {projection.rateChange !== 0 && typeInfo.unit && (
                  <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-porch-brown-light/50 font-semibold">
                      Rate Trend
                    </p>
                    <p
                      className={`text-xl font-bold mt-1 ${
                        projection.rateChange > 0 ? "text-status-danger" : "text-status-good"
                      }`}
                    >
                      {projection.rateChange > 0 ? "+" : ""}
                      {projection.rateChange}%
                    </p>
                    <p className="text-[10px] text-porch-brown-light/50">
                      {projection.rateChange > 0 ? "rates going up" : "rates going down"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Cost History Bar Chart */}
            {chartBills.length > 0 && (
              <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-porch-cream-dark/30">
                  <h2 className="text-sm font-semibold text-porch-brown">
                    {typeInfo.icon} {typeInfo.label} History
                  </h2>
                </div>
                <div className="p-4">
                  {chartBills.map((bill) => {
                    const pct = (bill.amount / maxBillAmount) * 100;
                    const d = new Date(bill.bill_date + "T12:00:00");
                    const label = d.toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    });
                    return (
                      <div key={bill.id} className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-medium text-porch-brown-light/60 w-14 text-right">
                          {label}
                        </span>
                        <div className="flex-1 bg-porch-cream rounded-full h-4 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-porch-teal/70 transition-all"
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-porch-brown w-16 text-right">
                          ${bill.amount.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bill List */}
            <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-porch-cream-dark/30 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-porch-brown">Bills</h2>
                  <p className="text-[10px] text-porch-brown-light/50">
                    {filteredBills.length} {typeInfo.label.toLowerCase()} bill{filteredBills.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setForm((f) => ({ ...f, utilityType: activeType }));
                    setShowForm(true);
                  }}
                  className="text-[10px] font-semibold bg-porch-teal text-white px-3 py-1 rounded-full"
                >
                  + Add Bill
                </button>
              </div>

              {filteredBills.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-3xl mb-2">{typeInfo.icon}</div>
                  <p className="text-sm text-porch-brown-light/60">
                    No {typeInfo.label.toLowerCase()} bills yet.
                  </p>
                  <p className="text-xs text-porch-brown-light/40 mt-1">
                    Add your monthly bills to track costs and project future expenses.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-porch-cream-dark/20">
                  {filteredBills.map((bill) => {
                    const d = new Date(bill.bill_date + "T12:00:00");
                    return (
                      <div key={bill.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-porch-brown">
                              ${bill.amount.toFixed(2)}
                            </p>
                            <p className="text-[10px] text-porch-brown-light/50">
                              {d.toLocaleDateString("en-US", {
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {bill.usage_qty && bill.rate_per_unit && (
                              <div className="text-right">
                                <p className="text-[10px] font-medium text-porch-brown">
                                  {bill.usage_qty.toLocaleString()} {bill.usage_unit}
                                </p>
                                <p className="text-[9px] text-porch-brown-light/50">
                                  ${bill.rate_per_unit.toFixed(4)}/{bill.usage_unit}
                                </p>
                              </div>
                            )}
                            <button
                              onClick={() => handleDelete(bill.id)}
                              className="text-porch-brown-light/30 hover:text-status-danger text-sm"
                            >
                              &times;
                            </button>
                          </div>
                        </div>
                        {bill.notes && (
                          <p className="text-[10px] text-porch-brown-light/40 mt-1">{bill.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ============ ADD BILL MODAL ============ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-porch-brown">
                Add {typeInfo.icon} {typeInfo.label} Bill
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-porch-brown-light/40 text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-porch-brown mb-1 block">
                  Bill Date
                </label>
                <input
                  type="date"
                  value={form.billDate}
                  onChange={(e) => setForm({ ...form, billDate: e.target.value })}
                  className="w-full border border-porch-cream-dark/50 rounded-lg px-3 py-2 text-sm text-porch-brown"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-porch-brown mb-1 block">
                  Total Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g., 245.67"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border border-porch-cream-dark/50 rounded-lg px-3 py-2 text-sm text-porch-brown placeholder:text-porch-brown-light/30"
                />
              </div>

              {typeInfo.unit && (
                <>
                  <div>
                    <label className="text-xs font-medium text-porch-brown mb-1 block">
                      Usage ({typeInfo.unit}) — optional
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder={`e.g., 1200 ${typeInfo.unit}`}
                      value={form.usageQty}
                      onChange={(e) => setForm({ ...form, usageQty: e.target.value })}
                      className="w-full border border-porch-cream-dark/50 rounded-lg px-3 py-2 text-sm text-porch-brown placeholder:text-porch-brown-light/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-porch-brown mb-1 block">
                      Rate per {typeInfo.unit} ($) — optional
                      {autoRate && (
                        <button
                          onClick={() => setForm({ ...form, ratePerUnit: autoRate })}
                          className="ml-2 text-porch-teal font-normal"
                        >
                          Auto: ${autoRate}
                        </button>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder={`e.g., 0.1250`}
                      value={form.ratePerUnit}
                      onChange={(e) => setForm({ ...form, ratePerUnit: e.target.value })}
                      className="w-full border border-porch-cream-dark/50 rounded-lg px-3 py-2 text-sm text-porch-brown placeholder:text-porch-brown-light/30"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-medium text-porch-brown mb-1 block">
                  Notes — optional
                </label>
                <input
                  type="text"
                  placeholder="e.g., New AC unit installed"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-porch-cream-dark/50 rounded-lg px-3 py-2 text-sm text-porch-brown placeholder:text-porch-brown-light/30"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-porch-cream-dark/50 text-sm font-medium text-porch-brown-light"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.amount || !form.billDate || saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-porch-teal text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Bill"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
