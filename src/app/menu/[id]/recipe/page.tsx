"use client";

import { useEffect, useState, useMemo, use } from "react";
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
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  quantity_unit: string;
  cost_per_unit: number;
  line_cost: number;
  supplier: string;
}

/* ─── Supplier Badge Colors ────────────────────────────────────── */

function SupplierBadge({ supplier }: { supplier: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-md bg-porch-cream border border-porch-cream-dark text-[10px] font-medium text-porch-brown-light whitespace-nowrap">
      from <span className="font-semibold text-foreground">{supplier}</span>
    </span>
  );
}

interface MenuItem {
  id: string;
  name: string;
  selling_price: number;
  category_name: string | null;
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function RecipeBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [menuItem, setMenuItem] = useState<MenuItem | null>(null);
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add ingredient form state
  const [searchText, setSearchText] = useState("");
  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Remove confirmation
  const [removingId, setRemovingId] = useState<string | null>(null);

  /* ─── Load data ─────────────────────────────────────────────── */

  useEffect(() => {
    Promise.all([
      fetch(`/api/menu-items/${id}`).then((r) => r.json()),
      fetch(`/api/recipes?menu_item_id=${id}`).then((r) => r.json()),
      fetch("/api/ingredients").then((r) => r.json()),
    ])
      .then(([itemRes, recipeRes, ingRes]) => {
        if (!itemRes.item) {
          setError("Couldn't find this menu item");
          setLoading(false);
          return;
        }
        setMenuItem(itemRes.item);
        setRecipe(recipeRes.recipes || []);
        setAllIngredients(ingRes.ingredients || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Something went wrong loading the recipe builder");
        setLoading(false);
      });
  }, [id]);

  /* ─── Calculations (real-time) ──────────────────────────────── */

  const totalCost = useMemo(
    () => recipe.reduce((sum, r) => sum + r.line_cost, 0),
    [recipe]
  );

  const sellingPrice = menuItem?.selling_price || 0;

  const foodCostPct = useMemo(
    () => (sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : 0),
    [totalCost, sellingPrice]
  );

  const profit = sellingPrice - totalCost;

  const suggestedPrice = totalCost > 0 ? totalCost / 0.3 : 0;

  const costReduction =
    foodCostPct > 30 ? totalCost - sellingPrice * 0.3 : 0;

  const status: "good" | "warning" | "danger" | "empty" = useMemo(() => {
    if (recipe.length === 0) return "empty";
    if (foodCostPct <= 30) return "good";
    if (foodCostPct <= 35) return "warning";
    return "danger";
  }, [recipe.length, foodCostPct]);

  /* ─── Add ingredient preview ────────────────────────────────── */

  const qtyNum = parseFloat(quantity) || 0;
  const previewCost =
    selectedIngredient && qtyNum > 0
      ? qtyNum * selectedIngredient.cost_per_unit
      : 0;

  /* ─── Filter ingredients for search ─────────────────────────── */

  const filteredIngredients = useMemo(() => {
    if (!searchText.trim()) return allIngredients;
    const lower = searchText.toLowerCase();
    return allIngredients.filter(
      (ing) =>
        ing.name.toLowerCase().includes(lower) ||
        ing.supplier.toLowerCase().includes(lower)
    );
  }, [allIngredients, searchText]);

  /* ─── Handlers ──────────────────────────────────────────────── */

  function selectIngredient(ing: Ingredient) {
    setSelectedIngredient(ing);
    setSearchText(ing.name);
    setQuantityUnit(ing.unit);
    setShowDropdown(false);
  }

  async function handleAddIngredient() {
    if (!selectedIngredient || qtyNum <= 0) return;

    setAdding(true);
    setError("");

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu_item_id: id,
          ingredient_id: selectedIngredient.id,
          quantity: qtyNum,
          quantity_unit: quantityUnit || selectedIngredient.unit,
        }),
      });

      if (!res.ok) throw new Error("Failed to add");
      const data = await res.json();

      // Add to local recipe list immediately (real-time update)
      const newLine: RecipeLine = {
        id: data.id,
        ingredient_id: selectedIngredient.id,
        ingredient_name: selectedIngredient.name,
        quantity: qtyNum,
        quantity_unit: quantityUnit || selectedIngredient.unit,
        cost_per_unit: selectedIngredient.cost_per_unit,
        line_cost: qtyNum * selectedIngredient.cost_per_unit,
        supplier: selectedIngredient.supplier,
      };

      setRecipe((prev) =>
        [...prev, newLine].sort((a, b) =>
          a.ingredient_name.localeCompare(b.ingredient_name)
        )
      );

      // Reset form
      setSelectedIngredient(null);
      setSearchText("");
      setQuantity("");
      setQuantityUnit("");
    } catch {
      setError("Couldn't add the ingredient. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveIngredient(recipeLineId: string) {
    setRemovingId(null);

    try {
      const res = await fetch(`/api/recipes?id=${recipeLineId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");

      setRecipe((prev) => prev.filter((r) => r.id !== recipeLineId));
    } catch {
      setError("Couldn't remove that ingredient. Please try again.");
    }
  }

  /* ─── Loading / Error States ────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-foreground rounded-full animate-spin" />
        <p className="text-sm text-porch-brown-light/70">
          Loading recipe builder...
        </p>
      </div>
    );
  }

  if (!menuItem) {
    return (
      <div className="text-center py-16">
        <p className="text-foreground font-medium">
          {error || "Menu item not found"}
        </p>
        <Link
          href="/menu"
          className="text-porch-brown-light text-sm font-medium mt-2 inline-block underline"
        >
          Back to menu
        </Link>
      </div>
    );
  }

  /* ─── Status bar colors ─────────────────────────────────────── */

  const statusColors = {
    empty: { bar: "bg-porch-cream-dark", text: "text-status-gray", label: "" },
    good: {
      bar: "bg-status-good",
      text: "text-status-good",
      label: "Healthy",
    },
    warning: {
      bar: "bg-status-warning",
      text: "text-status-warning",
      label: "Watch",
    },
    danger: {
      bar: "bg-status-danger",
      text: "text-status-danger",
      label: "Too High",
    },
  };

  const sc = statusColors[status];

  /* ─── Render ────────────────────────────────────────────────── */

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/menu/${id}`}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-porch-cream active:bg-porch-cream-dark transition-colors"
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
          <h2 className="text-lg font-bold text-foreground truncate">
            {menuItem.name}
          </h2>
          <p className="text-xs text-porch-brown-light/60">
            Sells for ${sellingPrice.toFixed(2)}
            {menuItem.category_name && ` · ${menuItem.category_name}`}
          </p>
        </div>
      </div>

      {/* Live Cost Status Bar */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark overflow-hidden">
        {/* Color bar at top */}
        <div className={`h-1.5 ${sc.bar} transition-colors duration-300`} />

        <div className="p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] text-porch-brown-light/50 uppercase tracking-wider font-medium">
                Food Cost
              </p>
              <p
                className={`text-3xl font-bold mt-0.5 ${
                  status === "empty"
                    ? "text-porch-brown-light/30"
                    : sc.text
                }`}
              >
                {status === "empty" ? "—" : `${Math.round(foodCostPct * 10) / 10}%`}
              </p>
              {status !== "empty" && (
                <p className={`text-xs font-semibold ${sc.text}`}>
                  {sc.label}
                </p>
              )}
            </div>

            <div className="text-right text-xs space-y-0.5">
              <p className="text-porch-brown-light/50">
                Ingredient cost:{" "}
                <span className="font-semibold text-foreground">
                  ${totalCost.toFixed(2)}
                </span>
              </p>
              <p className="text-porch-brown-light/50">
                Profit:{" "}
                <span
                  className={`font-semibold ${
                    profit < 0 ? "text-status-danger" : "text-foreground"
                  }`}
                >
                  ${profit.toFixed(2)}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Recipe — Ingredient List */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark overflow-hidden">
        <div className="px-4 py-3 border-b border-porch-cream-dark/50">
          <h3 className="text-sm font-semibold text-foreground">
            Recipe Ingredients
          </h3>
        </div>

        {recipe.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-porch-brown-light/60">
              No ingredients yet
            </p>
            <p className="text-xs text-porch-brown-light/40 mt-1">
              Start adding ingredients below to see what this item costs you to
              make!
            </p>
          </div>
        ) : (
          <div>
            {recipe.map((line) => (
              <div
                key={line.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-porch-cream-dark/20 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate">
                      {line.ingredient_name}
                    </p>
                    {line.supplier && <SupplierBadge supplier={line.supplier} />}
                  </div>
                  <p className="text-[11px] text-porch-brown-light/50">
                    {line.quantity} {line.quantity_unit} @ $
                    {line.cost_per_unit.toFixed(2)}/{line.quantity_unit}
                  </p>
                </div>

                <span className="text-sm font-semibold text-foreground shrink-0">
                  ${line.line_cost.toFixed(2)}
                </span>

                {/* Remove button */}
                {removingId === line.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRemoveIngredient(line.id)}
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

            {/* Total row */}
            <div className="flex items-center justify-between px-4 py-3 bg-porch-cream/50">
              <span className="text-sm font-semibold text-foreground">
                Total Cost
              </span>
              <span className="text-sm font-bold text-foreground">
                ${totalCost.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Add Ingredient Section */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark">
        <div className="px-4 py-3 border-b border-porch-cream-dark/50">
          <h3 className="text-sm font-semibold text-foreground">
            Add an Ingredient
          </h3>
        </div>

        <div className="p-4 space-y-3">
          {/* Ingredient Search */}
          <div className="relative">
            <label className="block text-xs font-medium text-porch-brown-light/60 mb-1">
              Pick an ingredient
            </label>
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
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-porch-cream-dark bg-porch-warm-white text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30"
              />
            </div>

            {/* Dropdown */}
            {showDropdown && !selectedIngredient && searchText.trim().length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-porch-cream-dark rounded-xl shadow-xl max-h-64 overflow-y-auto">
                {filteredIngredients.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-sm text-porch-brown-light/50">
                      No ingredient called &ldquo;{searchText}&rdquo; found
                    </p>
                    <Link
                      href="/ingredients/add"
                      className="text-sm font-semibold text-porch-teal underline mt-2 inline-block"
                    >
                      + Add it as a new ingredient
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-porch-cream-dark/30 bg-porch-cream/30">
                      <p className="text-[10px] font-medium text-porch-brown-light/50 uppercase tracking-wider">
                        {filteredIngredients.length} match{filteredIngredients.length !== 1 ? 'es' : ''}
                      </p>
                    </div>
                    {filteredIngredients.slice(0, 20).map((ing) => (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => selectIngredient(ing)}
                        className="w-full text-left px-4 py-3 hover:bg-porch-cream/50 active:bg-porch-cream transition-colors border-b border-porch-cream-dark/15 last:border-b-0"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {ing.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <SupplierBadge supplier={ing.supplier} />
                          <span className="text-[11px] text-porch-brown-light/50">
                            {ing.cost_per_unit > 0
                              ? `$${ing.cost_per_unit.toFixed(4)} per ${ing.unit}`
                              : `Price needed · per ${ing.unit}`}
                          </span>
                        </div>
                      </button>
                    ))}
                    {filteredIngredients.length > 20 && (
                      <div className="px-3 py-2 text-center text-xs text-porch-brown-light/40">
                        Type more to narrow results...
                      </div>
                    )}
                    <div className="p-3 border-t border-porch-cream-dark/30 bg-porch-cream/20">
                      <Link
                        href="/ingredients/add"
                        className="block text-center text-sm font-semibold text-porch-teal py-1"
                      >
                        + Add a new ingredient
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Quantity + Unit (shown when ingredient is selected) */}
          {selectedIngredient && (
            <div>
              <label className="block text-xs font-medium text-porch-brown-light/60 mb-1">
                How much goes into one serving?
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Amount"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="0"
                  step="any"
                  autoFocus
                  className="flex-1 px-4 py-3 rounded-xl border border-porch-cream-dark bg-porch-warm-white text-base focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30"
                />
                <div className="px-4 py-3 rounded-xl border border-porch-cream-dark bg-porch-cream/30 text-sm text-porch-brown-light font-medium flex items-center">
                  {quantityUnit || selectedIngredient.unit}
                </div>
              </div>
            </div>
          )}

          {/* Cost Preview */}
          {selectedIngredient && qtyNum > 0 && (
            <div className="bg-porch-cream/50 border border-porch-cream-dark rounded-xl p-3">
              <p className="text-sm text-foreground">
                <span className="font-medium">{qtyNum}</span>{" "}
                {quantityUnit || selectedIngredient.unit} of{" "}
                <span className="font-medium">
                  {selectedIngredient.name}
                </span>{" "}
                ={" "}
                <span className="font-bold text-base">
                  ${previewCost.toFixed(2)}
                </span>
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <SupplierBadge supplier={selectedIngredient.supplier} />
                <span className="text-[10px] text-porch-brown-light/40">
                  ${selectedIngredient.cost_per_unit.toFixed(4)} per {selectedIngredient.unit}
                </span>
              </div>
            </div>
          )}

          {/* Add Button */}
          {selectedIngredient && (
            <button
              onClick={handleAddIngredient}
              disabled={adding || qtyNum <= 0}
              className="w-full py-3 rounded-xl bg-foreground text-white font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              {adding ? "Adding..." : "Add to Recipe"}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-status-danger/5 border border-status-danger/20 rounded-xl p-3">
          <p className="text-sm text-status-danger">{error}</p>
        </div>
      )}

      {/* Cost Analysis Panel */}
      {recipe.length > 0 && (
        <div className="bg-white rounded-2xl border border-porch-cream-dark overflow-hidden">
          <div className="px-4 py-3 border-b border-porch-cream-dark/50">
            <h3 className="text-sm font-semibold text-foreground">
              Cost Breakdown
            </h3>
          </div>

          <div className="p-4 space-y-3">
            {/* Numbers grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-porch-cream/40 rounded-xl p-3 text-center">
                <p className="text-[10px] text-porch-brown-light/50 uppercase tracking-wider">
                  Ingredient Cost
                </p>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  ${totalCost.toFixed(2)}
                </p>
              </div>

              <div className="bg-porch-cream/40 rounded-xl p-3 text-center">
                <p className="text-[10px] text-porch-brown-light/50 uppercase tracking-wider">
                  Selling Price
                </p>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  ${sellingPrice.toFixed(2)}
                </p>
              </div>

              <div className="bg-porch-cream/40 rounded-xl p-3 text-center">
                <p className="text-[10px] text-porch-brown-light/50 uppercase tracking-wider">
                  Your Profit
                </p>
                <p
                  className={`text-xl font-bold mt-0.5 ${
                    profit < 0 ? "text-status-danger" : "text-foreground"
                  }`}
                >
                  ${profit.toFixed(2)}
                </p>
              </div>

              <div
                className={`rounded-xl p-3 text-center ${
                  status === "good"
                    ? "bg-status-good/10"
                    : status === "warning"
                    ? "bg-status-warning/10"
                    : "bg-status-danger/10"
                }`}
              >
                <p className="text-[10px] text-porch-brown-light/50 uppercase tracking-wider">
                  Food Cost
                </p>
                <p className={`text-xl font-bold mt-0.5 ${sc.text}`}>
                  {Math.round(foodCostPct * 10) / 10}%
                </p>
                <p className={`text-[10px] font-semibold ${sc.text}`}>
                  {sc.label}
                </p>
              </div>
            </div>

            {/* Suggestions for warning/danger */}
            {(status === "warning" || status === "danger") && (
              <div className="bg-status-danger/5 border border-status-danger/15 rounded-xl p-3 space-y-2">
                <p className="text-sm text-foreground/80">
                  {status === "danger"
                    ? "This item costs more than it should compared to your selling price."
                    : "This item's cost is getting close to the limit."}
                </p>

                <div className="space-y-1 text-xs">
                  <p className="text-foreground/70">
                    <span className="font-semibold">Option 1:</span> Raise
                    your price to{" "}
                    <span className="font-bold text-foreground">
                      ${suggestedPrice.toFixed(2)}
                    </span>{" "}
                    to hit the ideal 30% food cost
                  </p>
                  {costReduction > 0 && (
                    <p className="text-foreground/70">
                      <span className="font-semibold">Option 2:</span> Reduce
                      ingredient cost by{" "}
                      <span className="font-bold text-foreground">
                        ${costReduction.toFixed(2)}
                      </span>{" "}
                      (use smaller portions or cheaper ingredients)
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Good status celebration */}
            {status === "good" && (
              <div className="bg-status-good/5 border border-status-good/15 rounded-xl p-3">
                <p className="text-sm text-foreground/80">
                  This item is priced well! You&apos;re making a healthy profit
                  on every sale.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Done button */}
      <Link
        href={`/menu/${id}`}
        className="block w-full py-3.5 rounded-xl bg-foreground text-white font-semibold text-base text-center active:scale-[0.98] transition-all"
      >
        Done — Back to Item
      </Link>
    </div>
  );
}
