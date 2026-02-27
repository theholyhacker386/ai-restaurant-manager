"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PendingItem {
  shopping_list_item_id: string;
  ingredient_name: string;
  supplier: string;
  packages_to_buy: number;
  total_received: number;
  remaining: number;
  list_name: string;
  list_date: string;
  shopping_list_id: string;
}

interface ShoppingList {
  id: string;
  name: string;
  status: string;
  created_at: string;
  total_items: number;
  checked_items: number;
  total_estimated_cost: number;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ReceiveOrderPage() {
  const [pendingBySupplier, setPendingBySupplier] = useState<Record<string, PendingItem[]>>({});
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [pendingRes, listsRes] = await Promise.all([
        fetch("/api/shopping-lists/receive?pending=true"),
        fetch("/api/shopping-lists"),
      ]);

      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingBySupplier(data.bySupplier || {});
      }
      if (listsRes.ok) {
        const allLists: ShoppingList[] = await listsRes.json();
        // Show non-completed, non-closed lists
        setLists(allLists.filter((l) => l.status !== "completed" && l.status !== "closed"));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-porch-brown" />
      </div>
    );
  }

  const hasPending = Object.keys(pendingBySupplier).length > 0;
  const totalPending = Object.values(pendingBySupplier).reduce((s, items) => s + items.length, 0);

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/" className="text-porch-brown hover:text-porch-brown/80 -ml-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h2 className="text-lg font-bold text-foreground">Receive an Order</h2>
          <p className="text-xs text-muted">Check in deliveries as they arrive</p>
        </div>
      </div>

      {/* Section 1: Items Still Coming */}
      {hasPending && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">
              {totalPending}
            </span>
            Items Still Coming
          </h3>
          <div className="space-y-2">
            {Object.entries(pendingBySupplier).filter(([, items]) => items && items.length > 0).map(([supplier, items]) => (
              <Link
                key={supplier}
                href={`/shopping/receive/${items[0].shopping_list_id}?supplier=${encodeURIComponent(supplier)}`}
                className="block bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-porch-brown/30 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{supplier}</h4>
                    <p className="text-xs text-muted mt-0.5">
                      {items.length} item{items.length !== 1 ? "s" : ""} still waiting
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium">
                      Pending
                    </span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                {/* Preview of items */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {items.slice(0, 4).map((item) => (
                    <span
                      key={item.shopping_list_item_id}
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-50 text-[11px] text-gray-600"
                    >
                      {item.ingredient_name}
                    </span>
                  ))}
                  {items.length > 4 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-50 text-[11px] text-gray-500">
                      +{items.length - 4} more
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Receive a New Delivery */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {hasPending ? "Your Orders" : "Select an Order to Receive"}
        </h3>

        {lists.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-6 text-center">
            <p className="text-sm text-muted">No open shopping lists.</p>
            <Link
              href="/shopping"
              className="inline-block mt-3 text-sm font-medium text-porch-brown hover:underline"
            >
              Generate a shopping list first
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {lists.map((list) => {
              const progress = list.total_items > 0
                ? Math.round((list.checked_items / list.total_items) * 100)
                : 0;
              const isNew = list.checked_items === 0;
              const isInProgress = list.checked_items > 0 && list.checked_items < list.total_items;

              return (
                <Link
                  key={list.id}
                  href={`/shopping/receive/${list.id}`}
                  className="block bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-porch-brown/30 active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground truncate">{list.name}</h4>
                        {isNew && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium flex-shrink-0">
                            New
                          </span>
                        )}
                        {isInProgress && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium flex-shrink-0">
                            In Progress
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {formatDate(list.created_at)} &middot; {list.total_items} items &middot; ~${list.total_estimated_cost.toFixed(2)}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Progress bar for in-progress orders */}
                  {isInProgress && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-muted">{list.checked_items} of {list.total_items} received</span>
                        <span className="font-medium text-amber-700">{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
