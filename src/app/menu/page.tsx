"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface MenuItem {
  id: string;
  name: string;
  selling_price: number;
  category_id: string | null;
  category_name: string | null;
  total_ingredient_cost: number;
  packaging_cost: number;
  food_cost_percentage: number;
  profit_per_item: number;
  suggested_price: number;
  status: "good" | "warning" | "danger" | "needs-input" | "incomplete" | "approved";
  approved_food_cost?: number | null;
}

interface CategoryGroup {
  name: string;
  items: MenuItem[];
}

type FilterOption = "all" | "review" | "danger" | "warning" | "good" | "needs-input";
type SortOption = "category" | "status" | "name" | "cost-high";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  good: {
    label: "Good",
    bg: "bg-status-good/10",
    text: "text-status-good",
    border: "border-status-good/20",
    dot: "bg-status-good",
  },
  approved: {
    label: "Approved",
    bg: "bg-porch-teal/10",
    text: "text-porch-teal",
    border: "border-porch-teal/20",
    dot: "bg-porch-teal",
  },
  warning: {
    label: "Watch",
    bg: "bg-status-warning/10",
    text: "text-status-warning",
    border: "border-status-warning/20",
    dot: "bg-status-warning",
  },
  danger: {
    label: "Too High",
    bg: "bg-status-danger/10",
    text: "text-status-danger",
    border: "border-status-danger/20",
    dot: "bg-status-danger",
  },
  incomplete: {
    label: "Incomplete",
    bg: "bg-status-warning/10",
    text: "text-status-warning",
    border: "border-status-warning/20",
    dot: "bg-status-warning",
  },
  "needs-input": {
    label: "Needs Recipe",
    bg: "bg-status-gray/10",
    text: "text-status-gray",
    border: "border-status-gray/20",
    dot: "bg-status-gray",
  },
};

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "review", label: "Need Review" },
  { value: "danger", label: "Too High" },
  { value: "warning", label: "Watch" },
  { value: "good", label: "Good" },
  { value: "needs-input", label: "Needs Recipe" },
];

export default function MenuPage() {
  return (
    <Suspense>
      <MenuPageInner />
    </Suspense>
  );
}

function MenuPageInner() {
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") as FilterOption) || "all";

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterOption>(initialFilter);
  const [sort, setSort] = useState<SortOption>("category");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    fetch("/api/menu-items")
      .then((res) => res.json())
      .then((data) => {
        setItems(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filter items
  const filtered = items.filter((item) => {
    if (filter === "review" && item.status !== "warning" && item.status !== "danger") return false;
    else if (filter !== "all" && filter !== "review" && item.status !== filter) return false;
    if (
      search &&
      !item.name.toLowerCase().includes(search.toLowerCase()) &&
      !(item.category_name || "")
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  // Sort items
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "status") {
      const order: Record<string, number> = { danger: 0, warning: 1, incomplete: 2, "needs-input": 3, good: 4 };
      return (order[a.status] ?? 4) - (order[b.status] ?? 4);
    }
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "cost-high")
      return b.food_cost_percentage - a.food_cost_percentage;
    return 0; // category — keep original API order
  });

  // Group by category
  const grouped: CategoryGroup[] = [];
  if (sort === "category") {
    const catMap = new Map<string, MenuItem[]>();
    for (const item of sorted) {
      const catName = item.category_name || "Uncategorized";
      if (!catMap.has(catName)) catMap.set(catName, []);
      catMap.get(catName)!.push(item);
    }
    for (const [name, catItems] of catMap) {
      grouped.push({ name, items: catItems });
    }
  }

  function toggleCategory(catName: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });
  }

  // Approve handler
  async function approveItem(itemId: string, foodCostPct: number) {
    try {
      const res = await fetch("/api/menu-items/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, foodCostPct }),
      });
      if (res.ok) {
        // Update local state — mark as approved
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, status: "approved" as any, approved_food_cost: foodCostPct } : i
          )
        );
      }
    } catch (err) {
      console.error("Failed to approve:", err);
    }
  }

  async function unapproveItem(itemId: string) {
    try {
      const res = await fetch("/api/menu-items/approve", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) {
        // Re-fetch to get correct status back
        const listRes = await fetch("/api/menu-items");
        if (listRes.ok) {
          const data = await listRes.json();
          setItems(data.items || []);
        }
      }
    } catch (err) {
      console.error("Failed to unapprove:", err);
    }
  }

  // Status summary counts
  const dangerCount = items.filter((i) => i.status === "danger").length;
  const warningCount = items.filter((i) => i.status === "warning").length;
  const statusCounts: Record<string, number> = {
    all: items.length,
    review: dangerCount + warningCount,
    danger: dangerCount,
    warning: warningCount,
    good: items.filter((i) => i.status === "good").length,
    "needs-input": items.filter((i) => i.status === "needs-input").length,
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-porch-teal rounded-full animate-spin" />
        <p className="text-sm text-porch-brown-light/70">
          Loading your menu...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 -mx-4">
      {/* Page Header */}
      <div className="px-4">
        <h2 className="text-xl font-bold text-foreground">My Menu</h2>
        <p className="text-sm text-porch-brown-light/70 mt-0.5">
          {items.length} items across your entire menu
        </p>
      </div>

      {/* Search */}
      <div className="px-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-porch-brown-light/40"
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
            placeholder="Search menu items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-porch-cream-dark bg-white text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
          />
        </div>
      </div>

      {/* Filter Pills */}
      <div className="px-4 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === opt.value
                ? "bg-porch-teal text-white"
                : "bg-white border border-porch-cream-dark text-porch-brown-light hover:border-porch-brown-light/30"
            }`}
          >
            {opt.label}
            <span className="ml-1 opacity-70">
              {statusCounts[opt.value]}
            </span>
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="px-4 flex items-center gap-2">
        <span className="text-xs text-porch-brown-light/50">Sort by:</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="text-xs bg-white border border-porch-cream-dark rounded-lg px-2 py-1 text-porch-brown-light focus:outline-none focus:ring-1 focus:ring-porch-teal/50"
        >
          <option value="category">Category</option>
          <option value="status">Needs Attention First</option>
          <option value="cost-high">Highest Cost %</option>
          <option value="name">Name A-Z</option>
        </select>
        <span className="text-xs text-porch-brown-light/40 ml-auto">
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <div className="text-center py-16 px-6">
          <p className="text-lg font-medium text-foreground">
            No menu items yet
          </p>
          <p className="text-sm text-porch-brown-light/60 mt-1">
            Start adding your menu items to see how they&apos;re doing
          </p>
          <Link
            href="/menu/add"
            className="inline-block mt-4 bg-porch-teal text-white px-6 py-3 rounded-xl font-semibold text-sm"
          >
            Add Your First Item
          </Link>
        </div>
      )}

      {/* No Results */}
      {items.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 px-6">
          <p className="text-porch-brown-light/60">
            No items match your search
          </p>
          <button
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
            className="mt-2 text-porch-teal text-sm font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Grouped by Category */}
      {sort === "category" && grouped.length > 0 && (
        <div className="space-y-2">
          {grouped.map((group) => {
            const isCollapsed = collapsedCategories.has(group.name);
            const groupDanger = group.items.filter(
              (i) => i.status === "danger"
            ).length;
            const groupWarning = group.items.filter(
              (i) => i.status === "warning"
            ).length;

            return (
              <div key={group.name}>
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(group.name)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-porch-cream/60 hover:bg-porch-cream active:bg-porch-cream-dark/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className={`w-4 h-4 text-porch-brown-light/50 transition-transform ${
                        isCollapsed ? "" : "rotate-90"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-foreground">
                      {group.name}
                    </span>
                    <span className="text-xs text-porch-brown-light/50">
                      ({group.items.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {groupDanger > 0 && (
                      <span className="w-2 h-2 rounded-full bg-status-danger" />
                    )}
                    {groupWarning > 0 && (
                      <span className="w-2 h-2 rounded-full bg-status-warning" />
                    )}
                  </div>
                </button>

                {/* Items in Category */}
                {!isCollapsed && (
                  <div className="divide-y divide-porch-cream-dark/30">
                    {group.items.map((item) => (
                      <MenuItemCard key={item.id} item={item} onApprove={approveItem} onUnapprove={unapproveItem} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Flat List (when sorted by something other than category) */}
      {sort !== "category" && sorted.length > 0 && (
        <div className="divide-y divide-porch-cream-dark/30">
          {sorted.map((item) => (
            <MenuItemCard key={item.id} item={item} onApprove={approveItem} onUnapprove={unapproveItem} />
          ))}
        </div>
      )}

      {/* Floating Add Button */}
      <div className="fixed bottom-20 right-4 z-30">
        <Link
          href="/menu/add"
          className="flex items-center gap-2 bg-porch-teal text-white px-5 py-3.5 rounded-full shadow-lg hover:bg-porch-teal-light active:scale-95 transition-all font-medium text-sm"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Item
        </Link>
      </div>
    </div>
  );
}

/* --- Menu Item Card --- */

function MenuItemCard({
  item,
  onApprove,
  onUnapprove,
}: {
  item: MenuItem;
  onApprove: (itemId: string, foodCostPct: number) => void;
  onUnapprove: (itemId: string) => void;
}) {
  const config = STATUS_CONFIG[item.status];
  const canApprove = item.status === "warning" || item.status === "danger";
  const isApproved = item.status === "approved";

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-porch-warm-white transition-colors">
      {/* Status Dot */}
      <span
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${config.dot}`}
      />

      {/* Item Info — taps here go to the detail page */}
      <Link href={`/menu/${item.id}`} className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {item.name}
        </h3>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-porch-brown-light/60">
            Sells for ${item.selling_price.toFixed(2)}
          </span>
          {item.status !== "needs-input" && (
            <>
              <span className="text-xs text-porch-brown-light/30">|</span>
              <span className="text-xs text-porch-brown-light/60">
                Costs ${item.total_ingredient_cost.toFixed(2)}
              </span>
            </>
          )}
          {item.status === "needs-input" && item.packaging_cost > 0 && (
            <>
              <span className="text-xs text-porch-brown-light/30">|</span>
              <span className="text-xs text-porch-brown-light/50">
                Packaging: ${item.packaging_cost.toFixed(2)}
              </span>
            </>
          )}
        </div>
        {item.status !== "needs-input" && item.status !== "incomplete" && item.suggested_price > 0 && (
          <p className={`text-[10px] mt-0.5 ${
            item.status === "danger" ? "text-status-danger/80" :
            item.status === "warning" ? "text-status-warning/80" :
            "text-porch-brown-light/50"
          }`}>
            30% target price: ${item.suggested_price.toFixed(2)}
          </p>
        )}
      </Link>

      {/* Cost % Badge */}
      <div className="shrink-0 text-right">
        {item.status === "needs-input" || item.status === "incomplete" ? (
          <span
            className={`inline-block px-2 py-1 rounded-lg text-[10px] font-semibold ${config.bg} ${config.text}`}
          >
            {config.label}
          </span>
        ) : (
          <>
            <span className={`text-lg font-bold ${config.text}`}>
              {item.food_cost_percentage}%
            </span>
            <span className={`block text-[10px] font-medium ${config.text}`}>
              {config.label}
            </span>
          </>
        )}
      </div>

      {/* Approve / Unapprove Button */}
      {canApprove && (
        <button
          onClick={() => onApprove(item.id, item.food_cost_percentage)}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-porch-teal/10 text-porch-teal text-[11px] font-semibold active:scale-95 transition-transform"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          OK
        </button>
      )}
      {isApproved && (
        <button
          onClick={() => onUnapprove(item.id)}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-porch-cream text-porch-brown-light/60 text-[11px] font-medium active:scale-95 transition-transform"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Undo
        </button>
      )}

      {/* Chevron — only when no approve button */}
      {!canApprove && !isApproved && (
        <Link href={`/menu/${item.id}`}>
          <svg
            className="w-4 h-4 text-porch-brown-light/30 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      )}
    </div>
  );
}
