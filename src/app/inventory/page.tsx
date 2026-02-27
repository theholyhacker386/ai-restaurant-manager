"use client";

import { useEffect, useState, useMemo } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  supplier: string;
  ingredient_type: string;
  package_size: number | null;
  package_unit: string | null;
  package_price: number | null;
  current_stock: number;
  par_level: number;
  reorder_point: number;
  stock_counted_at: string | null;
  cost_per_unit: number;
}

type StatusFilter = "all" | "low" | "ok" | "not-counted";
type TypeFilter = "all" | "food" | "packaging";

export default function InventoryPage() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Editable fields for the expanded item
  const [editStock, setEditStock] = useState("");
  const [editReorder, setEditReorder] = useState("");
  const [editPar, setEditPar] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function fetchInventory() {
    try {
      const res = await fetch("/api/inventory/stock");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setItems(data.ingredients);
      setError(null);
    } catch {
      setError("Couldn't load inventory. Pull down to try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInventory();
  }, []);

  // Unique suppliers for filter
  const suppliers = useMemo(() => {
    const set = new Set(items.map((i) => i.supplier).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  // Status helper
  function getStatus(item: Ingredient): "out" | "low" | "ok" | "not-counted" {
    if (!item.stock_counted_at && item.current_stock === 0) return "not-counted";
    if (item.current_stock === 0) return "out";
    if (item.reorder_point > 0 && item.current_stock <= item.reorder_point) return "low";
    return "ok";
  }

  // Filtered items
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (supplierFilter !== "all" && item.supplier !== supplierFilter) return false;
      if (typeFilter !== "all" && item.ingredient_type !== typeFilter) return false;
      if (statusFilter === "low") {
        const s = getStatus(item);
        return s === "low" || s === "out";
      }
      if (statusFilter === "ok") return getStatus(item) === "ok";
      if (statusFilter === "not-counted") return getStatus(item) === "not-counted";
      return true;
    });
  }, [items, search, supplierFilter, typeFilter, statusFilter]);

  // Group by type
  const foodItems = filtered.filter((i) => i.ingredient_type === "food");
  const packagingItems = filtered.filter((i) => i.ingredient_type === "packaging");

  // Summary stats
  const totalItems = items.length;
  const lowCount = items.filter((i) => {
    const s = getStatus(i);
    return s === "low" || s === "out";
  }).length;
  const lastCounted = items
    .filter((i) => i.stock_counted_at)
    .sort((a, b) => new Date(b.stock_counted_at!).getTime() - new Date(a.stock_counted_at!).getTime())[0];

  // Expand an item for editing
  function handleExpand(item: Ingredient) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    setEditStock(String(item.current_stock || 0));
    setEditReorder(String(item.reorder_point || 0));
    setEditPar(String(item.par_level || 0));
    setSavedId(null);
  }

  // Save stock update
  async function handleSave(item: Ingredient) {
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/stock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [
            {
              id: item.id,
              current_stock: parseFloat(editStock) || 0,
              reorder_point: parseFloat(editReorder) || 0,
              par_level: parseFloat(editPar) || 0,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error("Save failed");

      // Update local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                current_stock: parseFloat(editStock) || 0,
                reorder_point: parseFloat(editReorder) || 0,
                par_level: parseFloat(editPar) || 0,
                stock_counted_at: new Date().toISOString(),
              }
            : i
        )
      );
      setSavedId(item.id);
      setTimeout(() => {
        setExpandedId(null);
        setSavedId(null);
      }, 1200);
    } catch {
      alert("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Smart unit helpers ──────────────────────────────────

  // Known large-unit conversions: if base unit is "fl oz" and package is 128, that's a gallon
  function getFriendlyPackageName(item: Ingredient): string | null {
    const pkgSize = Number(item.package_size) || 0;
    const unit = (item.unit || "").toLowerCase();
    const pkgUnit = (item.package_unit || "").toLowerCase();

    // Fluid ounce → gallon / quart / pint
    if (unit === "fl oz" || pkgUnit === "fl oz") {
      if (pkgSize === 128) return "gallon";
      if (pkgSize === 64) return "half gallon";
      if (pkgSize === 32) return "quart";
      if (pkgSize === 16) return "pint";
    }
    // Weight ounce → pound
    if ((unit === "oz" || pkgUnit === "oz") && pkgSize === 16) return "lb";

    return null;
  }

  // Pluralize common words properly
  function plural(word: string, count: number): string {
    if (count === 1) return word;
    const w = word.toLowerCase();
    if (w === "box") return "boxes";
    if (w === "each") return "each";
    if (w === "fl oz" || w === "oz") return word;
    if (w === "lb") return "lbs";
    if (w === "gallon") return "gallons";
    if (w === "half gallon") return "half gallons";
    if (w === "quart") return "quarts";
    if (w === "pint") return "pints";
    if (w.endsWith("s") || w.endsWith("x") || w.endsWith("ch") || w.endsWith("sh")) return word + "es";
    return word + "s";
  }

  // Convert raw base-unit amount to friendly display
  // e.g. 392 fl oz → "3 gallons + 8 fl oz"
  function friendlyAmount(amount: number, item: Ingredient): string {
    const pkgSize = Number(item.package_size) || 0;
    if (pkgSize <= 0 || amount <= 0) return `${amount} ${item.unit}`;

    const friendlyName = getFriendlyPackageName(item);
    const wholePkgs = Math.floor(amount / pkgSize);
    const remainder = Math.round((amount - wholePkgs * pkgSize) * 100) / 100;

    // If we have a friendly name (gallon, lb, etc.), use it
    if (friendlyName) {
      if (wholePkgs >= 1 && remainder === 0) {
        return `${wholePkgs} ${plural(friendlyName, wholePkgs)}`;
      }
      if (wholePkgs >= 1) {
        return `${wholePkgs} ${plural(friendlyName, wholePkgs)} + ${remainder} ${item.unit}`;
      }
      return `${amount} ${item.unit}`;
    }

    // For packaging items (case, box, pack) — show packages + remainder
    const pkgLabel = item.package_unit || "package";
    if (wholePkgs >= 1 && remainder === 0) {
      return `${wholePkgs} ${plural(pkgLabel, wholePkgs)} (${amount.toLocaleString()} ${item.unit})`;
    }
    if (wholePkgs >= 1) {
      return `${wholePkgs}+ ${plural(pkgLabel, wholePkgs)} (${amount.toLocaleString()} ${item.unit})`;
    }
    // Less than one full package
    const pct = Math.round((amount / pkgSize) * 100);
    return `${amount.toLocaleString()} ${item.unit} (~${pct}% of a ${pkgLabel})`;
  }

  // Format the "what's left" friendly text
  function friendlyStock(item: Ingredient): string {
    const stock = Number(item.current_stock) || 0;
    if (stock === 0) return "None on hand";
    return friendlyAmount(stock, item);
  }

  // Format "last counted" relative time
  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }

  // Package size label — reads naturally like "Case of 1,000" or "Gallon (128 fl oz)"
  function packageLabel(item: Ingredient): string {
    if (!item.package_size) return "";
    const friendlyName = getFriendlyPackageName(item);
    if (friendlyName) {
      return `${friendlyName} (${item.package_size} ${item.unit})`;
    }
    const pkgUnit = item.package_unit || "pack";
    return `${pkgUnit} of ${item.package_size.toLocaleString()}`;
  }

  // Friendly benchmark description (converts base units to package terms)
  function benchmarkDesc(value: number, item: Ingredient): string {
    if (!value) return "Not set";
    return friendlyAmount(value, item);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-porch-teal rounded-full animate-spin" />
        <p className="text-sm text-porch-brown-light/70">Loading inventory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-red-500">
            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm text-foreground/70">{error}</p>
        <button onClick={() => { setLoading(true); fetchInventory(); }} className="text-sm text-porch-teal font-medium mt-2">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Inventory Check</h2>
        <p className="text-sm text-porch-brown-light/70 mt-0.5">
          Tap any item to update its count
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-porch-cream-dark/50 text-center">
          <p className="text-[10px] font-medium text-porch-brown-light/60 uppercase tracking-wider">Total Items</p>
          <p className="text-2xl font-bold text-porch-teal mt-1">{totalItems}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-porch-cream-dark/50 text-center">
          <p className="text-[10px] font-medium text-porch-brown-light/60 uppercase tracking-wider">Low / Out</p>
          <p className={`text-2xl font-bold mt-1 ${lowCount > 0 ? "text-red-500" : "text-emerald-500"}`}>{lowCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-porch-cream-dark/50 text-center">
          <p className="text-[10px] font-medium text-porch-brown-light/60 uppercase tracking-wider">Last Count</p>
          <p className="text-sm font-bold text-foreground mt-2">
            {lastCounted ? timeAgo(lastCounted.stock_counted_at!) : "Never"}
          </p>
        </div>
      </div>

      {/* Search + Filters (sticky) */}
      <div className="sticky top-[52px] z-30 bg-porch-cream -mx-4 px-4 md:-mx-8 md:px-8 py-3 space-y-2 border-b border-porch-cream-dark/30">
        {/* Search */}
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-porch-brown-light/40">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-porch-cream-dark text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-porch-brown-light/40">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
          {/* Supplier filter */}
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-porch-cream-dark bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
          >
            <option value="all">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-porch-cream-dark bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
          >
            <option value="all">All Types</option>
            <option value="food">Food</option>
            <option value="packaging">Supplies</option>
          </select>

          {/* Status filter pills */}
          {(["all", "low", "ok", "not-counted"] as StatusFilter[]).map((s) => {
            const labels: Record<StatusFilter, string> = {
              all: "All",
              low: "Low / Out",
              ok: "OK",
              "not-counted": "Not Counted",
            };
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border shrink-0 transition-colors ${
                  statusFilter === s
                    ? "bg-porch-brown text-white border-porch-brown"
                    : "bg-white text-porch-brown-light/70 border-porch-cream-dark hover:border-porch-brown/30"
                }`}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-porch-brown-light/50">
        Showing {filtered.length} of {totalItems} items
      </p>

      {/* Food items section */}
      {foodItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-porch-brown-light/50 uppercase tracking-wider mb-2">
            Food Ingredients ({foodItems.length})
          </h3>
          <div className="space-y-2">
            {foodItems.map((item) => (
              <InventoryCard
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                saved={savedId === item.id}
                saving={saving && expandedId === item.id}
                editStock={editStock}
                editReorder={editReorder}
                editPar={editPar}
                onToggle={() => handleExpand(item)}
                onSave={() => handleSave(item)}
                onCancel={() => setExpandedId(null)}
                onEditStock={setEditStock}
                onEditReorder={setEditReorder}
                onEditPar={setEditPar}
                getStatus={getStatus}
                friendlyStock={friendlyStock}
                timeAgo={timeAgo}
                packageLabel={packageLabel}
                benchmarkDesc={benchmarkDesc}
                friendlyAmount={friendlyAmount}
              />
            ))}
          </div>
        </div>
      )}

      {/* Packaging / Supplies section */}

      {packagingItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-porch-brown-light/50 uppercase tracking-wider mb-2">
            Supplies &amp; Packaging ({packagingItems.length})
          </h3>
          <div className="space-y-2">
            {packagingItems.map((item) => (
              <InventoryCard
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                saved={savedId === item.id}
                saving={saving && expandedId === item.id}
                editStock={editStock}
                editReorder={editReorder}
                editPar={editPar}
                onToggle={() => handleExpand(item)}
                onSave={() => handleSave(item)}
                onCancel={() => setExpandedId(null)}
                onEditStock={setEditStock}
                onEditReorder={setEditReorder}
                onEditPar={setEditPar}
                getStatus={getStatus}
                friendlyStock={friendlyStock}
                timeAgo={timeAgo}
                packageLabel={packageLabel}
                benchmarkDesc={benchmarkDesc}
                friendlyAmount={friendlyAmount}
              />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-porch-brown-light/50">No items match your filters</p>
          <button
            onClick={() => { setSearch(""); setSupplierFilter("all"); setTypeFilter("all"); setStatusFilter("all"); }}
            className="text-sm text-porch-teal font-medium mt-2"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────── */
/* INVENTORY CARD COMPONENT                 */
/* ──────────────────────────────────────── */

function InventoryCard({
  item,
  expanded,
  saved,
  saving,
  editStock,
  editReorder,
  editPar,
  onToggle,
  onSave,
  onCancel,
  onEditStock,
  onEditReorder,
  onEditPar,
  getStatus,
  friendlyStock,
  timeAgo,
  packageLabel,
  benchmarkDesc,
  friendlyAmount,
}: {
  item: Ingredient;
  expanded: boolean;
  saved: boolean;
  saving: boolean;
  editStock: string;
  editReorder: string;
  editPar: string;
  onToggle: () => void;
  onSave: () => void;
  onCancel: () => void;
  onEditStock: (v: string) => void;
  onEditReorder: (v: string) => void;
  onEditPar: (v: string) => void;
  getStatus: (i: Ingredient) => "out" | "low" | "ok" | "not-counted";
  friendlyStock: (i: Ingredient) => string;
  timeAgo: (d: string) => string;
  packageLabel: (i: Ingredient) => string;
  benchmarkDesc: (v: number, i: Ingredient) => string;
  friendlyAmount: (amount: number, i: Ingredient) => string;
}) {
  const status = getStatus(item);

  const statusColors = {
    ok: "bg-emerald-100 text-emerald-700",
    low: "bg-amber-100 text-amber-700",
    out: "bg-red-100 text-red-700",
    "not-counted": "bg-gray-100 text-gray-500",
  };

  const statusLabels = {
    ok: "OK",
    low: "Low",
    out: "Out",
    "not-counted": "Not Counted",
  };

  const pkgLabel = packageLabel(item);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border transition-colors ${
      saved ? "border-emerald-400" : expanded ? "border-porch-teal/40" : "border-porch-cream-dark/50"
    }`}>
      {/* Main row — tap to expand */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 active:bg-porch-cream/50 transition-colors rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-foreground truncate">{item.name}</h4>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[status]}`}>
                {statusLabels[status]}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-porch-brown-light/50">{item.supplier}</span>
              {pkgLabel && (
                <>
                  <span className="text-[11px] text-porch-brown-light/30">|</span>
                  <span className="text-[11px] text-porch-brown-light/50">{pkgLabel}</span>
                </>
              )}
            </div>

            <p className={`text-xs mt-1 ${status === "low" || status === "out" ? "text-red-600 font-medium" : "text-porch-brown-light/70"}`}>
              {friendlyStock(item)}
            </p>

            <p className="text-[10px] text-porch-brown-light/40 mt-1">
              {item.stock_counted_at ? `Counted ${timeAgo(item.stock_counted_at)}` : "Never counted"}
            </p>
          </div>

          {/* Expand arrow / checkmark */}
          <div className="flex-shrink-0 mt-1">
            {saved ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-emerald-500">
                <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 text-porch-brown-light/30 transition-transform ${expanded ? "rotate-180" : ""}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* Expanded edit section */}
      {expanded && !saved && (
        <div className="px-4 pb-4 pt-1 border-t border-porch-cream-dark/30 space-y-3">
          {/* On Hand */}
          <div>
            <label className="text-[11px] font-semibold text-porch-brown-light/60 uppercase tracking-wider block mb-1">
              On Hand ({item.unit})
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={editStock}
              onChange={(e) => onEditStock(e.target.value)}
              className="w-full px-3 py-2.5 bg-porch-cream rounded-xl border border-porch-cream-dark text-sm font-medium focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
            />
            {Number(item.package_size) > 0 && editStock && (
              <p className="text-[10px] text-porch-brown-light/50 mt-1">
                = {friendlyAmount(parseFloat(editStock) || 0, item)}
              </p>
            )}
          </div>

          {/* Order When (reorder point) */}
          <div>
            <label className="text-[11px] font-semibold text-porch-brown-light/60 uppercase tracking-wider block mb-1">
              Order When Below ({item.unit})
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={editReorder}
              onChange={(e) => onEditReorder(e.target.value)}
              placeholder="e.g. 200"
              className="w-full px-3 py-2.5 bg-porch-cream rounded-xl border border-porch-cream-dark text-sm font-medium focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
            />
            {Number(item.package_size) > 0 && editReorder && Number(editReorder) > 0 && (
              <p className="text-[10px] text-porch-brown-light/50 mt-1">
                = {friendlyAmount(parseFloat(editReorder) || 0, item)}
              </p>
            )}
            <p className="text-[10px] text-porch-brown-light/40 mt-0.5">
              When stock drops below this, it shows as &quot;Low&quot;
            </p>
          </div>

          {/* Keep On Hand (par level) */}
          <div>
            <label className="text-[11px] font-semibold text-porch-brown-light/60 uppercase tracking-wider block mb-1">
              Keep On Hand ({item.unit})
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={editPar}
              onChange={(e) => onEditPar(e.target.value)}
              placeholder="e.g. 1000"
              className="w-full px-3 py-2.5 bg-porch-cream rounded-xl border border-porch-cream-dark text-sm font-medium focus:outline-none focus:ring-2 focus:ring-porch-teal/30"
            />
            {Number(item.package_size) > 0 && editPar && Number(editPar) > 0 && (
              <p className="text-[10px] text-porch-brown-light/50 mt-1">
                = {friendlyAmount(parseFloat(editPar) || 0, item)}
              </p>
            )}
            <p className="text-[10px] text-porch-brown-light/40 mt-0.5">
              Shopping lists order enough to get back to this level
            </p>
          </div>

          {/* Current benchmarks summary */}
          {(item.reorder_point > 0 || item.par_level > 0) && (
            <div className="bg-porch-cream/50 rounded-lg p-2.5">
              <p className="text-[10px] text-porch-brown-light/50">
                Currently: Order when below {benchmarkDesc(item.reorder_point, item)} | Keep {benchmarkDesc(item.par_level, item)} on hand
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-sm font-medium text-porch-brown-light/70 bg-porch-cream rounded-xl border border-porch-cream-dark active:scale-[0.98] transition-transform"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-porch-teal rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
