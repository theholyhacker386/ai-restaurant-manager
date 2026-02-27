"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ShoppingList {
  id: string;
  name: string;
  based_on_days: number;
  multiplier: number;
  total_estimated_cost: number;
  status: string;
  created_at: string;
  total_items?: number;
  checked_items?: number;
}

interface ShoppingItem {
  id: string;
  ingredient_name: string;
  supplier: string;
  quantity_needed: string;
  estimated_cost: string;
  packages_to_buy: number | null;
  package_info: string | null;
  checked: boolean;
}

interface ListDetail extends ShoppingList {
  notes: string | null;
  items: ShoppingItem[];
  bySupplier: Record<string, ShoppingItem[]>;
}

interface AIFlag {
  type: "warning" | "info" | "missing";
  item: string;
  message: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ShoppingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
        </div>
      }
    >
      <ShoppingPageInner />
    </Suspense>
  );
}

function ShoppingPageInner() {
  const searchParams = useSearchParams();
  const listIdParam = searchParams.get("id");

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeList, setActiveList] = useState<ListDetail | null>(null);
  const [suppliers, setSuppliers] = useState<Array<{ supplier: string; ingredient_count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [aiFlags, setAiFlags] = useState<AIFlag[]>([]);
  const [aiReviewing, setAiReviewing] = useState(false);

  const loadLists = useCallback(async () => {
    try {
      setLoading(true);
      const [listsRes, suppliersRes] = await Promise.all([
        fetch("/api/shopping-lists"),
        fetch("/api/shopping-lists/suppliers"),
      ]);
      if (listsRes.ok) setLists(await listsRes.json());
      if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const runAIReview = useCallback(async (id: string) => {
    setAiReviewing(true);
    setAiFlags([]);
    try {
      const res = await fetch("/api/shopping-lists/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiFlags(data.flags || []);
      }
    } catch {
      // AI review is non-critical — silently fail
    } finally {
      setAiReviewing(false);
    }
  }, []);

  const loadListDetail = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/shopping-lists?id=${id}`);
      if (!res.ok) throw new Error("Failed to load list");
      setActiveList(await res.json());
      // Run AI review in background (non-blocking)
      runAIReview(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [runAIReview]);

  useEffect(() => {
    if (listIdParam) {
      loadListDetail(listIdParam);
    } else {
      loadLists();
    }
  }, [listIdParam, loadListDetail, loadLists]);

  // Generate a new shopping list
  const generateList = async (supplier?: string) => {
    const key = supplier || "all";
    setGenerating(key);
    setError("");

    try {
      const res = await fetch("/api/shopping-lists/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: 7,
          multiplier: 1.0,
          supplier: supplier || undefined,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to generate list");
        return;
      }

      window.history.pushState({}, "", `/shopping?id=${data.list_id}`);
      loadListDetail(data.list_id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(null);
    }
  };

  // Toggle item checked
  const toggleItem = async (itemId: string, currentChecked: boolean) => {
    if (!activeList) return;

    setActiveList((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((item) =>
        item.id === itemId ? { ...item, checked: !currentChecked } : item
      );
      const updatedBySupplier: Record<string, ShoppingItem[]> = {};
      for (const [supplier, items] of Object.entries(prev.bySupplier)) {
        updatedBySupplier[supplier] = items.map((item) =>
          item.id === itemId ? { ...item, checked: !currentChecked } : item
        );
      }
      return { ...prev, items: updatedItems, bySupplier: updatedBySupplier };
    });

    try {
      await fetch("/api/shopping-lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, checked: !currentChecked }),
      });
    } catch {
      loadListDetail(activeList.id);
    }
  };

  // Mark all visible items as purchased
  const markAllPurchased = async (itemsToMark: ShoppingItem[]) => {
    if (!activeList) return;
    const unchecked = itemsToMark.filter((i) => !i.checked);
    if (unchecked.length === 0) return;

    // Optimistic update
    setActiveList((prev) => {
      if (!prev) return prev;
      const ids = new Set(unchecked.map((i) => i.id));
      const updatedItems = prev.items.map((item) =>
        ids.has(item.id) ? { ...item, checked: true } : item
      );
      const updatedBySupplier: Record<string, ShoppingItem[]> = {};
      for (const [supplier, items] of Object.entries(prev.bySupplier)) {
        updatedBySupplier[supplier] = items.map((item) =>
          ids.has(item.id) ? { ...item, checked: true } : item
        );
      }
      return { ...prev, items: updatedItems, bySupplier: updatedBySupplier };
    });

    // Send all updates
    try {
      await Promise.all(
        unchecked.map((item) =>
          fetch("/api/shopping-lists", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id, checked: true }),
          })
        )
      );
    } catch {
      loadListDetail(activeList.id);
    }
  };

  // Mark entire list as completed
  const markListCompleted = async () => {
    if (!activeList) return;
    try {
      await fetch("/api/shopping-lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: activeList.id, status: "completed" }),
      });
      goBack();
    } catch {
      // ignore
    }
  };

  // Delete a shopping list
  const deleteList = async (listId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/shopping-lists?id=${listId}`, { method: "DELETE" });
      setLists((prev) => prev.filter((l) => l.id !== listId));
    } catch {
      // ignore
    }
  };

  // Swipe state for list items
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState(0);

  const handleTouchStart = (id: string, x: number) => {
    setTouchStartX(x);
    // If another item is swiped open, close it
    if (swipedId && swipedId !== id) setSwipedId(null);
  };

  const handleTouchEnd = (id: string, endX: number) => {
    const diff = touchStartX - endX;
    if (diff > 60) {
      // Swiped left — show delete
      setSwipedId(id);
    } else if (diff < -30) {
      // Swiped right — close
      setSwipedId(null);
    }
  };

  const goBack = () => {
    setActiveList(null);
    setSupplierFilter(null);
    window.history.pushState({}, "", "/shopping");
    loadLists();
  };

  if (loading && !generating) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (activeList) {
    const allSuppliers = Object.keys(activeList.bySupplier);
    const visibleSuppliers = supplierFilter
      ? [[supplierFilter, activeList.bySupplier[supplierFilter] || []]] as [string, ShoppingItem[]][]
      : Object.entries(activeList.bySupplier);

    const visibleItems = supplierFilter
      ? activeList.items.filter((i) => i.supplier === supplierFilter)
      : activeList.items;
    const totalItems = visibleItems.length;
    const checkedItems = visibleItems.filter((i) => i.checked).length;
    const progress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
    const visibleCost = visibleItems.reduce(
      (sum, i) => sum + parseFloat((i.estimated_cost || "$0").replace("$", "")), 0
    );
    const allDone = checkedItems === totalItems && totalItems > 0;

    return (
      <div className="pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={goBack} className="text-porch-brown hover:text-porch-brown/80 -ml-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground">
              {supplierFilter ? `${supplierFilter} List` : "Shopping List"}
            </h2>
            <p className="text-xs text-muted">
              Based on {activeList.based_on_days} days of sales
            </p>
          </div>
        </div>

        {/* Supplier filter tabs */}
        {allSuppliers.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
            <button
              onClick={() => setSupplierFilter(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                !supplierFilter
                  ? "bg-porch-brown text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All ({activeList.items.length})
            </button>
            {allSuppliers.map((s) => {
              const count = (activeList.bySupplier[s] || []).length;
              const sChecked = (activeList.bySupplier[s] || []).filter((i) => i.checked).length;
              return (
                <button
                  key={s}
                  onClick={() => setSupplierFilter(supplierFilter === s ? null : s)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    supplierFilter === s
                      ? "bg-porch-brown text-white"
                      : sChecked === count && count > 0
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s} {sChecked === count && count > 0 ? "\u2713" : `(${count})`}
                </button>
              );
            })}
          </div>
        )}

        {/* Progress */}
        <div className={`rounded-xl shadow-sm border p-4 mb-4 ${allDone ? "bg-green-50 border-green-200" : "bg-white border-gray-100"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${allDone ? "text-green-700" : "text-foreground"}`}>
              {allDone ? "All items purchased!" : `${checkedItems} of ${totalItems} items`}
            </span>
            <span className="text-sm font-bold text-porch-brown">
              ~${visibleCost.toFixed(2)}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-300 ${allDone ? "bg-green-500" : "bg-porch-brown"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* AI Review */}
        {(aiReviewing || aiFlags.length > 0) && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="px-4 py-2.5 bg-amber-100 flex items-center gap-2">
              <span className="text-sm">AI Review</span>
              {aiReviewing && (
                <span className="text-xs text-amber-700 flex items-center gap-1">
                  <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-700" />
                  Checking...
                </span>
              )}
              {!aiReviewing && aiFlags.length === 0 && (
                <span className="text-xs text-green-700 font-medium">Everything looks good</span>
              )}
            </div>
            {aiFlags.length > 0 && (
              <div className="divide-y divide-amber-200">
                {aiFlags.map((flag, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 text-base">
                      {flag.type === "warning" ? "\u26A0\uFE0F" : flag.type === "missing" ? "\u2753" : "\u2139\uFE0F"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-900">{flag.item}</p>
                      <p className="text-xs text-amber-800 mt-0.5">{flag.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* "All Done" button when everything is checked */}
        {allDone && (
          <button
            onClick={markListCompleted}
            className="w-full bg-green-600 text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors mb-4 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Done — Complete This List
          </button>
        )}

        {/* Items by supplier */}
        {visibleSuppliers.map(([supplier, items]) => {
          const supplierTotal = items.reduce(
            (sum, i) => sum + parseFloat((i.estimated_cost || "$0").replace("$", "")), 0
          );
          const supplierChecked = items.filter((i) => i.checked).length;
          const supplierDone = supplierChecked === items.length && items.length > 0;

          return (
            <div key={supplier} className="mb-4">
              {!supplierFilter && (
                <div className="flex items-center justify-between px-1 mb-2">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[11px] font-bold ${supplierDone ? "bg-green-500" : "bg-porch-brown"}`}>
                      {supplierDone ? "\u2713" : items.length}
                    </span>
                    {supplier}
                  </h3>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-foreground">~${supplierTotal.toFixed(2)}</span>
                    {supplierChecked > 0 && !supplierDone && (
                      <span className="text-[11px] text-muted ml-1">({supplierChecked}/{items.length})</span>
                    )}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id, item.checked)}
                    className={`w-full flex items-start gap-3 p-3 text-left transition-colors ${
                      item.checked ? "bg-gray-50/50" : "hover:bg-gray-50"
                    }`}
                  >
                    <div
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        item.checked ? "bg-porch-brown border-porch-brown" : "border-gray-300"
                      }`}
                    >
                      {item.checked && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${item.checked ? "line-through text-muted" : "text-foreground"}`}>
                        {item.ingredient_name}
                      </p>
                      {/* Primary: what to buy (cases, lbs, individual items) */}
                      <p className={`text-xs mt-0.5 font-semibold ${item.checked ? "text-muted" : "text-porch-brown"}`}>
                        {item.quantity_needed}
                      </p>
                      {/* Secondary: package breakdown */}
                      {item.package_info && (
                        <p className="text-[10px] text-muted mt-0.5">
                          {item.package_info}
                        </p>
                      )}
                    </div>
                    <span className={`text-sm font-medium flex-shrink-0 ${item.checked ? "text-muted" : "text-foreground"}`}>
                      {item.estimated_cost}
                    </span>
                  </button>
                ))}
              </div>

              {/* Mark All Purchased button for this supplier */}
              {!supplierDone && (
                <button
                  onClick={() => markAllPurchased(items)}
                  className="w-full mt-2 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-porch-brown hover:text-porch-brown transition-colors"
                >
                  Mark All {supplier} Items Purchased
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── MAIN VIEW ──
  return (
    <div className="pb-8">
      <h2 className="text-lg font-bold text-foreground mb-1">Shopping Lists</h2>
      <p className="text-xs text-muted mb-4">
        Based on what&apos;s selling, we calculate what you need to buy
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Generate buttons */}
      <div className="mb-6">
        <button
          onClick={() => generateList()}
          disabled={!!generating}
          className="w-full bg-porch-brown text-white text-sm font-semibold py-3.5 rounded-xl hover:bg-porch-brown/90 disabled:opacity-50 transition-colors mb-3"
        >
          {generating === "all" ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Generating...
            </span>
          ) : (
            "Generate Full Shopping List"
          )}
        </button>

        {suppliers.length > 0 && (
          <>
            <p className="text-xs font-medium text-muted mb-2 px-1">Or generate by store:</p>
            <div className="grid grid-cols-2 gap-2">
              {suppliers.map((s) => (
                <button
                  key={s.supplier}
                  onClick={() => generateList(s.supplier)}
                  disabled={!!generating}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-left hover:border-porch-brown/40 disabled:opacity-50 transition-colors"
                >
                  {generating === s.supplier ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-porch-brown" />
                      <span className="text-sm text-muted">Generating...</span>
                    </span>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-foreground">{s.supplier}</p>
                      <p className="text-[11px] text-muted">{s.ingredient_count} ingredients</p>
                    </>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Previous lists */}
      {lists.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-foreground mb-2">Previous Lists</h3>
          <div className="space-y-2">
            {lists.map((list) => {
              const listProgress =
                list.total_items && list.total_items > 0
                  ? Math.round(((list.checked_items || 0) / list.total_items) * 100)
                  : 0;
              const isCompleted = list.status === "completed";
              const isSwiped = swipedId === list.id;

              return (
                <div key={list.id} className="relative overflow-hidden rounded-xl">
                  {/* Delete button behind the card */}
                  <div className="absolute right-0 top-0 bottom-0 flex items-center">
                    <button
                      onClick={(e) => deleteList(list.id, e)}
                      className="h-full px-5 bg-red-500 text-white text-sm font-semibold flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                  {/* Swipeable card */}
                  <button
                    onTouchStart={(e) => handleTouchStart(list.id, e.touches[0].clientX)}
                    onTouchEnd={(e) => handleTouchEnd(list.id, e.changedTouches[0].clientX)}
                    onClick={() => {
                      if (isSwiped) { setSwipedId(null); return; }
                      window.history.pushState({}, "", `/shopping?id=${list.id}`);
                      loadListDetail(list.id);
                    }}
                    className={`w-full shadow-sm border p-3 text-left transition-transform duration-200 relative z-10 ${
                      isCompleted
                        ? "bg-green-50 border-green-200"
                        : "bg-white border-gray-100 hover:border-porch-brown/30"
                    } rounded-xl`}
                    style={{ transform: isSwiped ? "translateX(-90px)" : "translateX(0)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className={`text-sm font-medium ${isCompleted ? "text-green-700" : "text-foreground"}`}>
                          {isCompleted && "\u2713 "}{list.name}
                        </h4>
                        <p className="text-[11px] text-muted">
                          {formatDate(list.created_at)} &middot; {list.total_items || 0} items
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${isCompleted ? "text-green-700" : "text-porch-brown"}`}>
                          ${list.total_estimated_cost.toFixed(2)}
                        </span>
                        {!isCompleted && listProgress > 0 && (
                          <p className="text-[11px] text-muted">{listProgress}% done</p>
                        )}
                        {isCompleted && (
                          <p className="text-[11px] text-green-600">Purchased</p>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
