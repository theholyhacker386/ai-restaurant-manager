"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ReceiveItem {
  id: string;
  ingredient_name: string;
  supplier: string;
  quantity_needed: string;
  estimated_cost: string;
  packages_to_buy: number;
  package_info: string | null;
  checked: boolean;
  ingredient_id: string | null;
  package_size: number | null;
  package_unit: string | null;
  base_unit: string | null;
  current_stock: number;
  total_received: number;
  remaining: number;
  is_reorder: boolean;
}

interface ListData {
  id: string;
  name: string;
  status: string;
  created_at: string;
  items: ReceiveItem[];
  bySupplier: Record<string, ReceiveItem[]>;
}

// Tracks what the user is doing with each item in this shipment
interface ItemAction {
  status: "received" | "adjusted" | "reorder" | null;
  received_packages: number;
  actual_package_size: number | null;
  actual_package_unit: string | null;
  notes: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ReceiveItemsPage() {
  const params = useParams();
  const listId = params.id as string;

  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");

  // Track actions per item: key = shopping_list_item.id
  const [actions, setActions] = useState<Record<string, ItemAction>>({});
  // Which item is expanded for adjustment
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/shopping-lists/receive?listId=${listId}`);
      if (!res.ok) throw new Error("Failed to load");
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set action for an item
  const setItemAction = (itemId: string, status: "received" | "adjusted" | "reorder" | null) => {
    setActions((prev) => {
      const item = data?.items.find((i) => i.id === itemId);
      if (!item) return prev;

      if (status === null) {
        // Clear action
        const next = { ...prev };
        delete next[itemId];
        if (expandedId === itemId) setExpandedId(null);
        return next;
      }

      const existing = prev[itemId];
      return {
        ...prev,
        [itemId]: {
          status,
          received_packages: status === "reorder" ? 0 : (existing?.received_packages ?? item.remaining),
          actual_package_size: existing?.actual_package_size ?? item.package_size,
          actual_package_unit: existing?.actual_package_unit ?? item.package_unit,
          notes: existing?.notes ?? "",
        },
      };
    });

    if (status === "adjusted") {
      setExpandedId(itemId);
    } else if (expandedId === itemId) {
      setExpandedId(null);
    }
  };

  // Update adjustment fields
  const updateAction = (itemId: string, updates: Partial<ItemAction>) => {
    setActions((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...updates },
    }));
  };

  // Select all remaining items as received
  const selectAllReceived = () => {
    if (!data) return;
    const newActions: Record<string, ItemAction> = { ...actions };
    for (const item of data.items) {
      if (item.remaining > 0 && !item.is_reorder && !newActions[item.id]) {
        newActions[item.id] = {
          status: "received",
          received_packages: item.remaining,
          actual_package_size: item.package_size,
          actual_package_unit: item.package_unit,
          notes: "",
        };
      }
    }
    setActions(newActions);
  };

  // Save the shipment
  const saveShipment = async () => {
    if (!data) return;

    const itemsToSave = Object.entries(actions)
      .filter(([, action]) => action.status !== null)
      .map(([itemId, action]) => {
        const item = data.items.find((i) => i.id === itemId);
        return {
          shopping_list_item_id: itemId,
          ingredient_id: item?.ingredient_id || null,
          ingredient_name: item?.ingredient_name || "Unknown",
          ordered_packages: item?.packages_to_buy || 0,
          ordered_package_size: item?.package_size || null,
          ordered_package_unit: item?.package_unit || null,
          received_packages: action.received_packages,
          actual_package_size: action.actual_package_size,
          actual_package_unit: action.actual_package_unit,
          status: action.status,
          notes: action.notes || null,
        };
      });

    if (itemsToSave.length === 0) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/shopping-lists/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId, items: itemsToSave }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      setSaved(true);
      setActions({});
      // Reload data to show updated receive counts
      await loadData();

      // Clear success message after 3s
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Close the order
  const closeOrder = async () => {
    if (!data) return;
    setClosing(true);

    try {
      const res = await fetch("/api/shopping-lists/receive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId }),
      });

      if (!res.ok) throw new Error("Failed to close order");
      // Go back to receive list
      window.location.href = "/shopping/receive";
    } catch (err: any) {
      setError(err.message);
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-muted">Order not found.</p>
        <Link href="/shopping/receive" className="text-sm text-porch-brown hover:underline mt-2 inline-block">
          Back to orders
        </Link>
      </div>
    );
  }

  // Split items into categories
  const pendingItems = data.items.filter((i) => i.remaining > 0 && !i.is_reorder);
  const receivedItems = data.items.filter((i) => i.remaining === 0 && !i.is_reorder);
  const reorderedItems = data.items.filter((i) => i.is_reorder);

  const totalItems = data.items.length;
  const doneItems = receivedItems.length + reorderedItems.length;
  const progress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const allDone = pendingItems.length === 0;
  const hasActions = Object.keys(actions).length > 0;
  const actionCount = Object.values(actions).filter((a) => a.status !== null).length;

  // Group pending items by supplier
  const pendingBySupplier: Record<string, ReceiveItem[]> = {};
  for (const item of pendingItems) {
    const s = item.supplier || "Other";
    if (!pendingBySupplier[s]) pendingBySupplier[s] = [];
    pendingBySupplier[s].push(item);
  }

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Link href="/shopping/receive" className="text-porch-brown hover:text-porch-brown/80 -ml-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">{data.name}</h2>
          <p className="text-xs text-muted">{formatDate(data.created_at)}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className={`rounded-xl shadow-sm border p-4 mb-4 ${allDone ? "bg-green-50 border-green-200" : "bg-white border-gray-100"}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${allDone ? "text-green-700" : "text-foreground"}`}>
            {allDone ? "All items accounted for!" : `${doneItems} of ${totalItems} received`}
          </span>
          <span className="text-sm font-bold text-porch-brown">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-300 ${allDone ? "bg-green-500" : "bg-porch-brown"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-green-700 font-medium">Shipment saved! Inventory updated.</p>
        </div>
      )}

      {/* Select All button */}
      {pendingItems.length > 0 && (
        <button
          onClick={selectAllReceived}
          className="w-full mb-4 py-2.5 rounded-xl border-2 border-dashed border-porch-brown/30 text-sm font-medium text-porch-brown hover:border-porch-brown hover:bg-porch-brown/5 transition-colors"
        >
          Select All as Received ({pendingItems.length} items)
        </button>
      )}

      {/* Pending items by supplier */}
      {Object.entries(pendingBySupplier).map(([supplier, items]) => (
        <div key={supplier} className="mb-4">
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-porch-brown text-white text-[11px] font-bold">
              {items.length}
            </span>
            <h3 className="font-bold text-sm text-foreground">{supplier}</h3>
            <span className="text-[11px] text-muted">— waiting</span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {items.map((item) => {
              const action = actions[item.id];
              const isExpanded = expandedId === item.id;

              return (
                <div key={item.id} className="p-3">
                  {/* Item info */}
                  <div className="flex items-start gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.ingredient_name}</p>
                      <p className="text-xs text-porch-brown font-semibold mt-0.5">
                        {item.quantity_needed}
                      </p>
                      {item.package_info && (
                        <p className="text-[10px] text-muted mt-0.5">{item.package_info}</p>
                      )}
                      {item.total_received > 0 && (
                        <p className="text-[10px] text-green-600 font-medium mt-0.5">
                          {item.total_received} of {item.packages_to_buy} already received
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted flex-shrink-0">
                      {item.remaining} left
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setItemAction(item.id, action?.status === "received" ? null : "received")}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        action?.status === "received"
                          ? "bg-green-600 text-white"
                          : "bg-green-50 text-green-700 hover:bg-green-100"
                      }`}
                    >
                      {action?.status === "received" ? "Got it" : "Got it"}
                    </button>
                    <button
                      onClick={() => setItemAction(item.id, action?.status === "adjusted" ? null : "adjusted")}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        action?.status === "adjusted"
                          ? "bg-amber-500 text-white"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      Adjust
                    </button>
                    <button
                      onClick={() => setItemAction(item.id, action?.status === "reorder" ? null : "reorder")}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        action?.status === "reorder"
                          ? "bg-red-500 text-white"
                          : "bg-red-50 text-red-700 hover:bg-red-100"
                      }`}
                    >
                      Reorder
                    </button>
                  </div>

                  {/* Expanded adjustment panel */}
                  {isExpanded && action?.status === "adjusted" && (
                    <div className="mt-3 bg-amber-50 rounded-lg p-3 space-y-3">
                      <div>
                        <label className="text-[11px] font-medium text-amber-800 block mb-1">
                          How many received?
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={action.received_packages}
                          onChange={(e) => updateAction(item.id, { received_packages: Number(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-medium text-amber-800 block mb-1">
                            Actual size
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            value={action.actual_package_size ?? ""}
                            onChange={(e) => updateAction(item.id, { actual_package_size: Number(e.target.value) || null })}
                            className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            placeholder={item.package_size ? String(item.package_size) : ""}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-amber-800 block mb-1">
                            Unit
                          </label>
                          <input
                            type="text"
                            value={action.actual_package_unit ?? ""}
                            onChange={(e) => updateAction(item.id, { actual_package_unit: e.target.value || null })}
                            className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            placeholder={item.package_unit || item.base_unit || ""}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-amber-800 block mb-1">
                          Notes (optional)
                        </label>
                        <input
                          type="text"
                          value={action.notes}
                          onChange={(e) => updateAction(item.id, { notes: e.target.value })}
                          className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder="e.g., Got 2lb bags instead of 5lb"
                        />
                      </div>
                    </div>
                  )}

                  {/* Reorder note */}
                  {action?.status === "reorder" && (
                    <div className="mt-2 bg-red-50 rounded-lg p-2 flex items-center gap-2">
                      <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5L12 3z" />
                      </svg>
                      <p className="text-[11px] text-red-700">
                        Will be added to the next shopping list
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Already received items (dimmed) */}
      {receivedItems.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-muted mb-2 px-1 uppercase tracking-wider">
            Already Received ({receivedItems.length})
          </h3>
          <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
            {receivedItems.map((item) => (
              <div key={item.id} className="p-3 flex items-center gap-3 opacity-60">
                <div className="w-5 h-5 rounded-md bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted line-through">{item.ingredient_name}</p>
                  <p className="text-[11px] text-muted">{item.quantity_needed}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reordered items */}
      {reorderedItems.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-red-500 mb-2 px-1 uppercase tracking-wider">
            Reordered ({reorderedItems.length})
          </h3>
          <div className="bg-red-50/50 rounded-xl border border-red-100 divide-y divide-red-100">
            {reorderedItems.map((item) => (
              <div key={item.id} className="p-3 flex items-center gap-3 opacity-60">
                <div className="w-5 h-5 rounded-md bg-red-400 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-red-700">{item.ingredient_name}</p>
                  <p className="text-[11px] text-red-500">On next shopping list</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mark Order Complete when all done */}
      {allDone && !hasActions && (
        <button
          onClick={closeOrder}
          disabled={closing}
          className="w-full bg-green-600 text-white text-sm font-semibold py-3.5 rounded-xl hover:bg-green-700 transition-colors mb-4 flex items-center justify-center gap-2"
        >
          {closing ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Closing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Mark Order Complete
            </>
          )}
        </button>
      )}

      {/* Close Order (when some items still pending) */}
      {!allDone && !hasActions && pendingItems.length > 0 && (
        <button
          onClick={closeOrder}
          disabled={closing}
          className="w-full text-red-600 text-xs font-medium py-2 rounded-xl hover:bg-red-50 transition-colors mb-4"
        >
          {closing ? "Closing..." : "Close Order (items not received will be flagged for reorder)"}
        </button>
      )}

      {/* Sticky save button */}
      {hasActions && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-50">
          <div className="max-w-lg mx-auto">
            <button
              onClick={saveShipment}
              disabled={saving}
              className="w-full bg-porch-brown text-white text-sm font-semibold py-3.5 rounded-xl hover:bg-porch-brown/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Shipment ({actionCount} item{actionCount !== 1 ? "s" : ""})
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
