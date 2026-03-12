"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";

/* ─── Types ───────────────────────────────────────────────────── */

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  supplier: string;
}

interface RecipeLine {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  quantity_unit: string;
  cost_per_unit: number;
  line_cost: number;
  supplier: string;
}

interface MenuItem {
  id: string;
  name: string;
  selling_price: number;
  category_name: string | null;
  category_id: string | null;
  food_recipe_count: number;
}

/* ─── Constants ───────────────────────────────────────────────── */

const UNIT_OPTIONS = [
  "oz",
  "lb",
  "g",
  "kg",
  "cups",
  "tbsp",
  "tsp",
  "fl oz",
  "each",
  "serving",
  "ml",
  "L",
];

/* ─── Page ────────────────────────────────────────────────────── */

export default function RecipeWizardPage() {
  /* ─── State ──────────────────────────────────────────────────── */

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [recipesByItem, setRecipesByItem] = useState<
    Record<string, RecipeLine[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // UI state
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );
  const [filterIncomplete, setFilterIncomplete] = useState(true);

  // Inline editor state (per expanded item)
  const [searchText, setSearchText] = useState("");
  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Refs for scrolling
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  /* ─── Load data ─────────────────────────────────────────────── */

  useEffect(() => {
    Promise.all([
      fetch("/api/menu-items").then((r) => r.json()),
      fetch("/api/ingredients").then((r) => r.json()),
      fetch("/api/recipes?all=true").then((r) => r.json()),
    ])
      .then(([menuRes, ingRes, recipeRes]) => {
        setMenuItems(menuRes.items || []);
        setAllIngredients(ingRes.ingredients || []);
        setRecipesByItem(recipeRes.recipes_by_item || {});
        setLoading(false);
      })
      .catch(() => {
        setError("Something went wrong loading data. Please refresh the page.");
        setLoading(false);
      });
  }, []);

  /* ─── Close dropdown on outside click ───────────────────────── */

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ─── Computed ──────────────────────────────────────────────── */

  const itemsWithRecipeCount = useMemo(() => {
    return menuItems.map((item) => ({
      ...item,
      recipeLines: recipesByItem[item.id] || [],
      hasRecipe: (recipesByItem[item.id] || []).length > 0,
    }));
  }, [menuItems, recipesByItem]);

  const totalItems = itemsWithRecipeCount.length;
  const itemsWithRecipes = itemsWithRecipeCount.filter(
    (i) => i.hasRecipe
  ).length;

  // Group by category
  const groupedItems = useMemo(() => {
    const groups = new Map<
      string,
      (typeof itemsWithRecipeCount)[number][]
    >();

    for (const item of itemsWithRecipeCount) {
      const cat = item.category_name || "Uncategorized";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }

    return groups;
  }, [itemsWithRecipeCount]);

  // Filtered groups (when filter is ON, only show items needing recipes)
  const filteredGroups = useMemo(() => {
    if (!filterIncomplete) return groupedItems;

    const filtered = new Map<
      string,
      (typeof itemsWithRecipeCount)[number][]
    >();

    for (const [cat, items] of groupedItems) {
      const needsRecipe = items.filter((i) => !i.hasRecipe);
      if (needsRecipe.length > 0) {
        filtered.set(cat, needsRecipe);
      }
    }

    return filtered;
  }, [groupedItems, filterIncomplete, itemsWithRecipeCount]);

  // Flat ordered list of items without recipes (for "Save & Next")
  const itemsNeedingRecipes = useMemo(() => {
    return itemsWithRecipeCount.filter((i) => !i.hasRecipe);
  }, [itemsWithRecipeCount]);

  /* ─── Filter ingredients for autocomplete ───────────────────── */

  const filteredIngredients = useMemo(() => {
    if (!searchText.trim()) return [];
    const lower = searchText.toLowerCase();
    return allIngredients.filter(
      (ing) =>
        ing.name.toLowerCase().includes(lower) ||
        (ing.supplier && ing.supplier.toLowerCase().includes(lower))
    );
  }, [allIngredients, searchText]);

  // Check if search text exactly matches an existing ingredient name
  const exactMatch = useMemo(() => {
    if (!searchText.trim()) return false;
    return allIngredients.some(
      (ing) => ing.name.toLowerCase() === searchText.trim().toLowerCase()
    );
  }, [allIngredients, searchText]);

  /* ─── Handlers ──────────────────────────────────────────────── */

  function resetEditorForm() {
    setSearchText("");
    setSelectedIngredient(null);
    setQuantity("");
    setQuantityUnit("");
    setShowDropdown(false);
    setRemovingId(null);
    setCreatingIngredient(false);
  }

  function expandItem(itemId: string) {
    resetEditorForm();
    setExpandedItemId(itemId);
    // Scroll into view after a tick
    setTimeout(() => {
      itemRefs.current[itemId]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  function collapseItem() {
    resetEditorForm();
    setExpandedItemId(null);
  }

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function selectIngredient(ing: Ingredient) {
    setSelectedIngredient(ing);
    setSearchText(ing.name);
    setQuantityUnit(ing.unit);
    setShowDropdown(false);
  }

  async function handleCreateIngredient() {
    const trimmedName = searchText.trim();
    if (!trimmedName) return;

    setCreatingIngredient(true);
    try {
      const res = await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          unit: "each",
        }),
      });

      if (!res.ok) throw new Error("Failed to create ingredient");
      const data = await res.json();

      const newIng: Ingredient = {
        id: data.id,
        name: data.name,
        unit: data.unit,
        cost_per_unit: data.cost_per_unit || 0,
        supplier: "",
      };

      setAllIngredients((prev) =>
        [...prev, newIng].sort((a, b) => a.name.localeCompare(b.name))
      );
      selectIngredient(newIng);
    } catch {
      setError("Could not create the ingredient. Please try again.");
    } finally {
      setCreatingIngredient(false);
    }
  }

  const handleAddIngredient = useCallback(
    async (menuItemId: string) => {
      if (!selectedIngredient || parseFloat(quantity) <= 0) return;

      const qtyNum = parseFloat(quantity);
      setAdding(true);
      setError("");

      try {
        const res = await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            menu_item_id: menuItemId,
            ingredient_id: selectedIngredient.id,
            quantity: qtyNum,
            quantity_unit: quantityUnit || selectedIngredient.unit,
          }),
        });

        if (!res.ok) throw new Error("Failed to add");
        const data = await res.json();

        const newLine: RecipeLine = {
          id: data.id,
          menu_item_id: menuItemId,
          ingredient_id: selectedIngredient.id,
          ingredient_name: selectedIngredient.name,
          quantity: qtyNum,
          quantity_unit: quantityUnit || selectedIngredient.unit,
          cost_per_unit: selectedIngredient.cost_per_unit,
          line_cost: qtyNum * selectedIngredient.cost_per_unit,
          supplier: selectedIngredient.supplier,
        };

        setRecipesByItem((prev) => ({
          ...prev,
          [menuItemId]: [...(prev[menuItemId] || []), newLine].sort((a, b) =>
            a.ingredient_name.localeCompare(b.ingredient_name)
          ),
        }));

        // Reset just the add form, keep expanded
        setSelectedIngredient(null);
        setSearchText("");
        setQuantity("");
        setQuantityUnit("");
      } catch {
        setError("Could not add the ingredient. Please try again.");
      } finally {
        setAdding(false);
      }
    },
    [selectedIngredient, quantity, quantityUnit]
  );

  async function handleRemoveIngredient(
    menuItemId: string,
    recipeLineId: string
  ) {
    setRemovingId(null);
    try {
      const res = await fetch(`/api/recipes?id=${recipeLineId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");

      setRecipesByItem((prev) => {
        const updated = (prev[menuItemId] || []).filter(
          (r) => r.id !== recipeLineId
        );
        const next = { ...prev };
        if (updated.length === 0) {
          delete next[menuItemId];
        } else {
          next[menuItemId] = updated;
        }
        return next;
      });
    } catch {
      setError("Could not remove that ingredient. Please try again.");
    }
  }

  function handleSaveAndNext(currentItemId: string) {
    // Find the next item that needs a recipe (after current item in the global list)
    // We need to look at all items, not just currently visible ones
    const currentIdx = itemsNeedingRecipes.findIndex(
      (i) => i.id === currentItemId
    );

    // The current item now has a recipe (we just added ingredients),
    // so find the next item that still has no recipe
    const nextItem = itemsNeedingRecipes.find(
      (item, idx) =>
        idx > currentIdx &&
        item.id !== currentItemId &&
        !(recipesByItem[item.id] && recipesByItem[item.id].length > 0)
    );

    // If no next item found searching after current, try from the beginning
    const fallbackItem = !nextItem
      ? itemsNeedingRecipes.find(
          (item) =>
            item.id !== currentItemId &&
            !(recipesByItem[item.id] && recipesByItem[item.id].length > 0)
        )
      : null;

    const target = nextItem || fallbackItem;

    if (target) {
      // Make sure the target's category is not collapsed
      const targetCat = target.category_name || "Uncategorized";
      setCollapsedCategories((prev) => {
        const next = new Set(prev);
        next.delete(targetCat);
        return next;
      });

      expandItem(target.id);
    } else {
      // All done!
      collapseItem();
    }
  }

  /* ─── Loading State ─────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-foreground rounded-full animate-spin" />
        <p className="text-sm text-porch-brown-light/70">
          Loading your menu items...
        </p>
      </div>
    );
  }

  /* ─── Progress calculations ─────────────────────────────────── */

  const progressPct =
    totalItems > 0 ? Math.round((itemsWithRecipes / totalItems) * 100) : 0;
  const allComplete = itemsWithRecipes === totalItems && totalItems > 0;

  /* ─── Render ────────────────────────────────────────────────── */

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/launch-pad"
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-porch-cream active:bg-porch-cream-dark transition-colors shrink-0"
        >
          <svg
            className="w-5 h-5 text-porch-brown-light"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground">
            Add Your Recipes
          </h1>
          <p className="text-xs text-porch-brown-light/60 mt-0.5 leading-relaxed">
            Tell us what goes into each menu item — every ingredient and how
            much. This is how we calculate your real cost per plate.
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">
            {itemsWithRecipes} of {totalItems} items have recipes
          </span>
          <span className="text-xs font-medium text-porch-brown-light/50">
            {progressPct}%
          </span>
        </div>
        <div className="w-full h-3 bg-porch-cream-dark/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allComplete ? "bg-status-good" : "bg-porch-teal"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* All Complete State */}
      {allComplete && (
        <div className="bg-status-good/5 border border-status-good/20 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-status-good/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-status-good"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-foreground">
            All recipes complete!
          </h2>
          <p className="text-sm text-porch-brown-light/60 mt-1">
            Every menu item has at least one ingredient listed. Great job!
          </p>
          <Link
            href="/launch-pad"
            className="inline-block mt-4 px-6 py-3 bg-foreground text-white rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
          >
            Back to Launch Pad
          </Link>
        </div>
      )}

      {/* Filter Toggle */}
      {!allComplete && (
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={filterIncomplete}
                onChange={(e) => setFilterIncomplete(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-porch-cream-dark/70 rounded-full peer-checked:bg-porch-teal transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-foreground font-medium">
              Show only items needing recipes
            </span>
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-status-danger/5 border border-status-danger/20 rounded-xl p-3">
          <p className="text-sm text-status-danger">{error}</p>
          <button
            onClick={() => setError("")}
            className="text-xs text-status-danger/70 underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Empty filtered state */}
      {filteredGroups.size === 0 && !allComplete && (
        <div className="text-center py-12">
          <p className="text-sm text-porch-brown-light/60">
            {filterIncomplete
              ? "All visible items have recipes! Turn off the filter to see everything."
              : "No menu items found. Add items to your menu first."}
          </p>
          {filterIncomplete && (
            <button
              onClick={() => setFilterIncomplete(false)}
              className="mt-3 text-sm font-semibold text-porch-teal underline"
            >
              Show all items
            </button>
          )}
        </div>
      )}

      {/* Menu Items by Category */}
      {Array.from(filteredGroups.entries()).map(([category, items]) => {
        const isCatCollapsed = collapsedCategories.has(category);
        const catRecipeCount = items.filter((i) => i.hasRecipe).length;

        return (
          <div key={category}>
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between px-1 py-2 group"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-4 h-4 text-porch-brown-light/40 transition-transform ${
                    isCatCollapsed ? "-rotate-90" : ""
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
                <span className="text-sm font-semibold text-porch-brown-light/60 uppercase tracking-wider">
                  {category}
                </span>
              </div>
              <span className="text-xs text-porch-brown-light/40">
                {catRecipeCount}/{items.length} done
              </span>
            </button>

            {/* Items list */}
            {!isCatCollapsed && (
              <div className="space-y-2">
                {items.map((item) => {
                  const isExpanded = expandedItemId === item.id;
                  const lines = recipesByItem[item.id] || [];
                  const hasRecipe = lines.length > 0;

                  return (
                    <div
                      key={item.id}
                      ref={(el) => {
                        itemRefs.current[item.id] = el;
                      }}
                      className="bg-white rounded-2xl border border-porch-cream-dark overflow-hidden"
                    >
                      {/* Item Row (tap to expand) */}
                      <button
                        onClick={() =>
                          isExpanded ? collapseItem() : expandItem(item.id)
                        }
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-porch-cream/30 transition-colors"
                      >
                        {/* Status indicator */}
                        {hasRecipe ? (
                          <div className="w-7 h-7 rounded-full bg-status-good/10 flex items-center justify-center shrink-0">
                            <svg
                              className="w-4 h-4 text-status-good"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-status-warning/10 flex items-center justify-center shrink-0">
                            <div className="w-2.5 h-2.5 rounded-full bg-status-warning" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-porch-brown-light/50">
                              ${Number(item.selling_price).toFixed(2)}
                            </span>
                            {hasRecipe ? (
                              <span className="text-xs text-status-good font-medium">
                                {lines.length} ingredient
                                {lines.length !== 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-status-warning/10 text-[10px] font-semibold text-status-warning">
                                Needs Recipe
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Chevron */}
                        <svg
                          className={`w-4 h-4 text-porch-brown-light/30 transition-transform shrink-0 ${
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
                      </button>

                      {/* Expanded Inline Editor */}
                      {isExpanded && (
                        <div className="border-t border-porch-cream-dark/50">
                          {/* Existing ingredients */}
                          {lines.length > 0 && (
                            <div className="px-4 pt-3 pb-1">
                              <p className="text-[10px] font-semibold text-porch-brown-light/50 uppercase tracking-wider mb-2">
                                Current Ingredients
                              </p>
                              {lines.map((line) => (
                                <div
                                  key={line.id}
                                  className="flex items-center gap-2 py-2 border-b border-porch-cream-dark/20 last:border-b-0"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {line.ingredient_name}
                                    </p>
                                    <p className="text-[11px] text-porch-brown-light/50">
                                      {line.quantity} {line.quantity_unit}
                                    </p>
                                  </div>

                                  {/* Remove button */}
                                  {removingId === line.id ? (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        onClick={() =>
                                          handleRemoveIngredient(
                                            item.id,
                                            line.id
                                          )
                                        }
                                        className="text-[10px] font-semibold text-status-danger bg-status-danger/10 px-2 py-1 rounded-lg"
                                      >
                                        Remove
                                      </button>
                                      <button
                                        onClick={() => setRemovingId(null)}
                                        className="text-[10px] font-semibold text-porch-brown-light/50 px-2 py-1 rounded-lg"
                                      >
                                        Keep
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setRemovingId(line.id)}
                                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-porch-cream active:bg-porch-cream-dark transition-colors shrink-0"
                                      aria-label={`Remove ${line.ingredient_name}`}
                                    >
                                      <svg
                                        className="w-4 h-4 text-porch-brown-light/40"
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
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add Ingredient Form */}
                          <div className="p-4 space-y-3 bg-porch-cream/20">
                            <p className="text-[10px] font-semibold text-porch-brown-light/50 uppercase tracking-wider">
                              Add Ingredient
                            </p>

                            {/* Search input */}
                            <div className="relative" ref={dropdownRef}>
                              <div className="relative">
                                <svg
                                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-porch-brown-light/30"
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
                                  placeholder="Search for an ingredient..."
                                  value={searchText}
                                  onChange={(e) => {
                                    setSearchText(e.target.value);
                                    setSelectedIngredient(null);
                                    setShowDropdown(true);
                                  }}
                                  onFocus={() => {
                                    if (searchText.trim().length > 0)
                                      setShowDropdown(true);
                                  }}
                                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30"
                                />
                              </div>

                              {/* Autocomplete Dropdown */}
                              {showDropdown &&
                                !selectedIngredient &&
                                searchText.trim().length > 0 && (
                                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-porch-cream-dark rounded-xl shadow-xl max-h-64 overflow-y-auto">
                                    {filteredIngredients.length > 0 && (
                                      <>
                                        <div className="px-3 py-2 border-b border-porch-cream-dark/30 bg-porch-cream/30">
                                          <p className="text-[10px] font-medium text-porch-brown-light/50 uppercase tracking-wider">
                                            {filteredIngredients.length} match
                                            {filteredIngredients.length !== 1
                                              ? "es"
                                              : ""}
                                          </p>
                                        </div>
                                        {filteredIngredients
                                          .slice(0, 15)
                                          .map((ing) => (
                                            <button
                                              key={ing.id}
                                              type="button"
                                              onClick={() =>
                                                selectIngredient(ing)
                                              }
                                              className="w-full text-left px-4 py-3 hover:bg-porch-cream/50 active:bg-porch-cream transition-colors border-b border-porch-cream-dark/15 last:border-b-0"
                                            >
                                              <p className="text-sm font-medium text-foreground">
                                                {ing.name}
                                              </p>
                                              <div className="flex items-center gap-1.5 mt-0.5">
                                                {ing.supplier && (
                                                  <span className="inline-block px-2 py-0.5 rounded-md bg-porch-cream border border-porch-cream-dark text-[10px] font-medium text-porch-brown-light whitespace-nowrap">
                                                    from{" "}
                                                    <span className="font-semibold text-foreground">
                                                      {ing.supplier}
                                                    </span>
                                                  </span>
                                                )}
                                                <span className="text-[11px] text-porch-brown-light/50">
                                                  per {ing.unit}
                                                </span>
                                              </div>
                                            </button>
                                          ))}
                                      </>
                                    )}

                                    {/* Create new ingredient option */}
                                    {!exactMatch && (
                                      <button
                                        type="button"
                                        onClick={handleCreateIngredient}
                                        disabled={creatingIngredient}
                                        className="w-full text-left px-4 py-3 bg-porch-teal/5 hover:bg-porch-teal/10 active:bg-porch-teal/15 transition-colors border-t border-porch-cream-dark/30"
                                      >
                                        <p className="text-sm font-semibold text-porch-teal">
                                          {creatingIngredient
                                            ? "Creating..."
                                            : `+ Create new ingredient: "${searchText.trim()}"`}
                                        </p>
                                      </button>
                                    )}

                                    {filteredIngredients.length === 0 &&
                                      exactMatch && (
                                        <div className="p-4 text-center">
                                          <p className="text-sm text-porch-brown-light/50">
                                            No matches found
                                          </p>
                                        </div>
                                      )}
                                  </div>
                                )}
                            </div>

                            {/* Quantity + Unit (when ingredient selected) */}
                            {selectedIngredient && (
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  placeholder="Amount"
                                  value={quantity}
                                  onChange={(e) => setQuantity(e.target.value)}
                                  min="0"
                                  step="any"
                                  autoFocus
                                  className="flex-1 px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30"
                                />
                                <select
                                  value={
                                    quantityUnit || selectedIngredient.unit
                                  }
                                  onChange={(e) =>
                                    setQuantityUnit(e.target.value)
                                  }
                                  className="px-3 py-3 rounded-xl border border-porch-cream-dark bg-white text-sm font-medium text-porch-brown-light focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30"
                                >
                                  {UNIT_OPTIONS.map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Add Button */}
                            {selectedIngredient && (
                              <button
                                onClick={() => handleAddIngredient(item.id)}
                                disabled={
                                  adding || parseFloat(quantity) <= 0 || !quantity
                                }
                                className="w-full py-3 rounded-xl bg-foreground text-white font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                              >
                                {adding ? "Adding..." : "Add to Recipe"}
                              </button>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-3 px-4 py-3 border-t border-porch-cream-dark/50 bg-porch-cream/10">
                            <button
                              onClick={() => collapseItem()}
                              className="flex-1 py-3 rounded-xl border border-porch-cream-dark text-porch-brown-light font-medium text-sm active:scale-[0.98] transition-all"
                            >
                              Done
                            </button>
                            <button
                              onClick={() => handleSaveAndNext(item.id)}
                              className="flex-1 py-3 rounded-xl bg-porch-teal text-white font-semibold text-sm active:scale-[0.98] transition-all"
                            >
                              Save & Next
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
        );
      })}
    </div>
  );
}
