"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

/* ── Types ───────────────────────────────────────────── */

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number | null;
  package_size: number | null;
  package_unit: string | null;
  package_price: number | null;
  supplier: string | null;
  ingredient_type: string | null;
  notes: string | null;
}

type TabFilter = "all" | "needs_supplier";

/* ── Supplier Color Generator ────────────────────────── */

const SUPPLIER_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
  { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200" },
  { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200" },
  { bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-200" },
  { bg: "bg-teal-100", text: "text-teal-800", border: "border-teal-200" },
  { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200" },
  { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-200" },
  { bg: "bg-red-100", text: "text-red-800", border: "border-red-200" },
  { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-200" },
];

function getSupplierColor(supplierName: string, colorMap: Map<string, number>) {
  if (!colorMap.has(supplierName)) {
    colorMap.set(supplierName, colorMap.size % SUPPLIER_COLORS.length);
  }
  return SUPPLIER_COLORS[colorMap.get(supplierName)!];
}

/* ── Helper: does this ingredient need a supplier? ───── */

function needsSupplier(ing: Ingredient): boolean {
  if (ing.ingredient_type === "sub_recipe") return false;
  if (ing.supplier === "Homemade") return false;
  if (!ing.supplier || ing.supplier.trim() === "") return true;
  return false;
}

/* ── Main Page Component ─────────────────────────────── */

export default function IngredientSourcingPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabFilter>("needs_supplier");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [lookingUpId, setLookingUpId] = useState<string | null>(null);
  const [priceMessage, setPriceMessage] = useState<Record<string, { type: "success" | "info"; text: string }>>({});
  const [pendingSupplier, setPendingSupplier] = useState<Record<string, string>>({});

  const supplierColorMap = useRef(new Map<string, number>());

  /* ── Load data ──────────────────────────────────────── */

  const loadData = useCallback(async () => {
    try {
      const [ingRes, supRes] = await Promise.all([
        fetch("/api/ingredients"),
        fetch("/api/suppliers"),
      ]);

      const ingData = await ingRes.json();
      const supData = await supRes.json();

      const ingList: Ingredient[] = ingData.ingredients || [];
      setIngredients(ingList.sort((a, b) => a.name.localeCompare(b.name)));
      setSuppliers(supData.suppliers || []);

      // If no ingredients need suppliers, default to "all" tab
      const needsCount = ingList.filter(needsSupplier).length;
      if (needsCount === 0) {
        setActiveTab("all");
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Computed values ────────────────────────────────── */

  const totalEligible = ingredients.filter(
    (i) => i.ingredient_type !== "sub_recipe" && i.supplier !== "Homemade"
  ).length;

  const withSupplier = ingredients.filter(
    (i) =>
      i.ingredient_type !== "sub_recipe" &&
      i.supplier !== "Homemade" &&
      i.supplier &&
      i.supplier.trim() !== ""
  ).length;

  const allAssigned = totalEligible > 0 && withSupplier >= totalEligible;

  /* ── Filter & search ────────────────────────────────── */

  const filtered = ingredients.filter((ing) => {
    // Search filter
    if (search && !ing.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    // Tab filter
    if (activeTab === "needs_supplier") {
      return needsSupplier(ing);
    }
    return true;
  });

  /* ── Expand / collapse ──────────────────────────────── */

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      // Pre-fill pending supplier with current value
      const ing = ingredients.find((i) => i.id === id);
      if (ing?.supplier && ing.supplier !== "") {
        setPendingSupplier((prev) => ({ ...prev, [id]: ing.supplier! }));
      }
    }
  }

  /* ── Save supplier ──────────────────────────────────── */

  async function saveSupplier(ing: Ingredient) {
    const selectedSupplier = pendingSupplier[ing.id];
    if (!selectedSupplier && selectedSupplier !== "") return;

    const supplierValue = selectedSupplier === "__none__" ? "Homemade" : selectedSupplier;

    setSavingId(ing.id);
    setPriceMessage((prev) => {
      const next = { ...prev };
      delete next[ing.id];
      return next;
    });

    try {
      // 1. Update the supplier
      const patchRes = await fetch(`/api/ingredients/${ing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier: supplierValue }),
      });

      if (!patchRes.ok) throw new Error("Failed to update supplier");

      const patchData = await patchRes.json();
      const updatedIng = patchData.ingredient;

      // Update local state
      setIngredients((prev) =>
        prev.map((i) => (i.id === ing.id ? { ...i, ...updatedIng } : i))
      );

      // 2. If no price and supplier is not Homemade, look up price
      const hasPrice = ing.cost_per_unit && ing.cost_per_unit > 0;
      if (!hasPrice && supplierValue !== "Homemade" && supplierValue.trim() !== "") {
        setLookingUpId(ing.id);

        try {
          const priceRes = await fetch(
            `/api/supplier-prices?ingredient=${encodeURIComponent(ing.name)}&supplier=${encodeURIComponent(supplierValue)}`
          );
          const priceData = await priceRes.json();

          if (priceData.found && priceData.price) {
            // Update the ingredient with the found price
            const priceUpdateRes = await fetch(`/api/ingredients/${ing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cost_per_unit: priceData.price,
                package_unit: priceData.unit || null,
              }),
            });

            if (priceUpdateRes.ok) {
              const priceUpdateData = await priceUpdateRes.json();
              setIngredients((prev) =>
                prev.map((i) =>
                  i.id === ing.id ? { ...i, ...priceUpdateData.ingredient } : i
                )
              );
              setPriceMessage((prev) => ({
                ...prev,
                [ing.id]: {
                  type: "success",
                  text: `Price found: $${Number(priceData.price).toFixed(2)}${priceData.unit ? ` per ${priceData.unit}` : ""}`,
                },
              }));
            }
          } else {
            setPriceMessage((prev) => ({
              ...prev,
              [ing.id]: {
                type: "info",
                text: "We couldn't find a price online. You can add it manually on the ingredients page.",
              },
            }));
          }
        } catch {
          setPriceMessage((prev) => ({
            ...prev,
            [ing.id]: {
              type: "info",
              text: "Price lookup didn't work this time. You can add the price manually.",
            },
          }));
        } finally {
          setLookingUpId(null);
        }
      }

      // Collapse the row
      setExpandedId(null);
    } catch (err) {
      console.error("Failed to save supplier:", err);
    } finally {
      setSavingId(null);
    }
  }

  /* ── Format price ───────────────────────────────────── */

  function formatPrice(ing: Ingredient) {
    if (!ing.cost_per_unit || ing.cost_per_unit === 0) return null;
    return `$${Number(ing.cost_per_unit).toFixed(2)}/${ing.unit}`;
  }

  /* ── Render ─────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Loading your ingredients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          {/* Back + Title */}
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/launch-pad"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 transition-colors shrink-0"
            >
              <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">
                Ingredient Suppliers
              </h1>
              <p className="text-sm text-zinc-500">
                Tell us where you buy each ingredient so we can track prices and build shopping lists.
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-3">
            {allAssigned ? (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-emerald-800 font-medium">
                  All ingredients have suppliers! Your shopping lists and cost tracking are ready to go.
                </p>
              </div>
            ) : (
              <div className="bg-zinc-100 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-zinc-600">
                    <span className="font-semibold text-zinc-900">{withSupplier}</span> of{" "}
                    <span className="font-semibold text-zinc-900">{totalEligible}</span>{" "}
                    ingredients have a supplier assigned
                  </p>
                  <span className="text-xs text-zinc-400">
                    {totalEligible > 0
                      ? Math.round((withSupplier / totalEligible) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="w-full bg-zinc-200 rounded-full h-1.5">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${totalEligible > 0 ? (withSupplier / totalEligible) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              All ({ingredients.length})
            </button>
            <button
              onClick={() => setActiveTab("needs_supplier")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === "needs_supplier"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              Needs Supplier ({ingredients.filter(needsSupplier).length})
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search ingredients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Ingredient List */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            {search ? (
              <>
                <p className="text-zinc-500 text-lg">
                  No ingredients match &ldquo;{search}&rdquo;
                </p>
                <button
                  onClick={() => setSearch("")}
                  className="mt-2 text-emerald-600 text-sm font-medium"
                >
                  Clear search
                </button>
              </>
            ) : activeTab === "needs_supplier" ? (
              <div>
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-zinc-700 text-lg font-medium">All set!</p>
                <p className="text-zinc-500 text-sm mt-1">
                  Every ingredient has a supplier assigned.
                </p>
                <button
                  onClick={() => setActiveTab("all")}
                  className="mt-3 text-emerald-600 text-sm font-medium"
                >
                  View all ingredients
                </button>
              </div>
            ) : (
              <p className="text-zinc-500">No ingredients found.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400 px-1 mb-2">
              {filtered.length} ingredient{filtered.length !== 1 ? "s" : ""}
            </p>

            {/* No suppliers warning */}
            {suppliers.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                <p className="text-sm text-amber-800 font-medium">
                  You haven&apos;t added any suppliers yet
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Add your suppliers during onboarding or on the settings page to assign them here.
                </p>
              </div>
            )}

            {filtered.map((ing) => {
              const isSubRecipe = ing.ingredient_type === "sub_recipe";
              const isHomemade = ing.supplier === "Homemade";
              const isExpanded = expandedId === ing.id;
              const isSaving = savingId === ing.id;
              const isLookingUp = lookingUpId === ing.id;
              const message = priceMessage[ing.id];
              const price = formatPrice(ing);
              const hasSupplier = !!ing.supplier && ing.supplier.trim() !== "" && ing.supplier !== "Homemade";
              const supplierColors = hasSupplier
                ? getSupplierColor(ing.supplier!, supplierColorMap.current)
                : null;

              return (
                <div
                  key={ing.id}
                  className={`bg-white rounded-xl border transition-colors ${
                    isExpanded ? "border-emerald-300 shadow-sm" : "border-zinc-200"
                  }`}
                >
                  {/* Row */}
                  <button
                    onClick={() => {
                      if (!isSubRecipe) toggleExpand(ing.id);
                    }}
                    className={`w-full text-left p-4 ${
                      isSubRecipe ? "cursor-default" : "cursor-pointer active:bg-zinc-50"
                    }`}
                    disabled={isSubRecipe}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-zinc-900 truncate text-sm">
                          {ing.name}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">{ing.unit}</p>

                        {/* Supplier badge */}
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          {isSubRecipe || isHomemade ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800 border border-violet-200">
                              Homemade
                            </span>
                          ) : hasSupplier && supplierColors ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${supplierColors.bg} ${supplierColors.text} border ${supplierColors.border}`}
                            >
                              {ing.supplier}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200">
                              No supplier
                            </span>
                          )}

                          {/* Loading spinner for price lookup */}
                          {isLookingUp && (
                            <div className="flex items-center gap-1 text-xs text-zinc-400">
                              <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              <span>Looking up price...</span>
                            </div>
                          )}
                        </div>

                        {/* Price message */}
                        {message && (
                          <p
                            className={`text-xs mt-1.5 ${
                              message.type === "success"
                                ? "text-emerald-600"
                                : "text-zinc-500"
                            }`}
                          >
                            {message.text}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        {price ? (
                          <span className="text-sm font-bold text-emerald-700">
                            {price}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">No price</span>
                        )}

                        {/* Expand chevron (not for sub-recipes) */}
                        {!isSubRecipe && (
                          <svg
                            className={`w-4 h-4 text-zinc-400 transition-transform ${
                              isExpanded ? "rotate-180" : ""
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
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Supplier Picker */}
                  {isExpanded && !isSubRecipe && (
                    <div className="border-t border-zinc-100 px-4 py-3 bg-zinc-50/50 rounded-b-xl">
                      <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                        Choose supplier
                      </label>
                      <select
                        value={pendingSupplier[ing.id] || ""}
                        onChange={(e) =>
                          setPendingSupplier((prev) => ({
                            ...prev,
                            [ing.id]: e.target.value,
                          }))
                        }
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      >
                        <option value="">-- Select a supplier --</option>
                        <option value="__none__">None / Homemade</option>
                        {suppliers.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      {suppliers.length === 0 && (
                        <p className="text-xs text-zinc-400 mt-1.5">
                          No suppliers saved yet. Add them during onboarding or on the settings page.
                        </p>
                      )}

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => saveSupplier(ing)}
                          disabled={!pendingSupplier[ing.id] || isSaving}
                          className="flex-1 bg-emerald-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isSaving ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save"
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setExpandedId(null);
                            setPriceMessage((prev) => {
                              const next = { ...prev };
                              delete next[ing.id];
                              return next;
                            });
                          }}
                          className="px-4 py-2 text-sm text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
