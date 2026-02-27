"use client";

import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  ingredient_type: string;
}

interface RecipeIngredient {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  quantity_unit: string;
  cost_per_unit: number;
  ingredient_unit: string;
  ingredient_type: string;
  line_cost: number;
}

// Convert between units for cost preview
function unitConversionFactor(recipeUnit: string, ingredientUnit: string): number {
  if (recipeUnit === 'g' && ingredientUnit === 'oz') return 1.0 / 28.3495;
  if (recipeUnit === 'g' && ingredientUnit === 'lb') return 1.0 / 453.592;
  if (recipeUnit === 'oz' && ingredientUnit === 'lb') return 1.0 / 16.0;
  return 1.0;
}

// Show enough decimal places for very small prices (sub-penny like napkins at $0.008)
function formatPrice(price: number): string {
  if (price >= 0.01) return price.toFixed(2);
  if (price > 0) return price.toFixed(4);
  return "0.00";
}

interface ItemData {
  id: string;
  name: string;
  selling_price: number;
  category_id: string | null;
  category_name: string | null;
  notes: string | null;
  total_ingredient_cost: number;
  packaging_cost: number;
  food_cost_percentage: number;
  profit_per_item: number;
  suggested_price: number;
  food_recipe_count: number;
  status: string;
  has_zero_cost_ingredients: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  good: {
    label: "Good — food cost is healthy",
    bg: "bg-status-good/10",
    text: "text-status-good",
  },
  warning: {
    label: "Watch — food cost is getting high",
    bg: "bg-status-warning/10",
    text: "text-status-warning",
  },
  danger: {
    label: "Too High — consider raising your price",
    bg: "bg-status-danger/10",
    text: "text-status-danger",
  },
  incomplete: {
    label: "Recipe not fully broken down yet — cost may be inaccurate",
    bg: "bg-status-warning/10",
    text: "text-status-warning",
  },
  "needs-input": {
    label: "Add a recipe to see your food cost",
    bg: "bg-status-gray/10",
    text: "text-status-gray",
  },
};

export default function EditMenuItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [itemData, setItemData] = useState<ItemData | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [notes, setNotes] = useState("");

  // Inline recipe editing
  const [editingRecipe, setEditingRecipe] = useState<RecipeIngredient | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [savingQty, setSavingQty] = useState(false);

  // Ingredient swap
  const [showSwap, setShowSwap] = useState(false);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [swapping, setSwapping] = useState(false);

  // Add ingredient
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [addQty, setAddQty] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addingIngredient, setAddingIngredient] = useState(false);

  // Delete ingredient
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingRecipe, setDeletingRecipe] = useState(false);

  // New category inline creation
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // Check if any food ingredient has $0 cost or missing weight
  const hasZeroCostIngredient = recipes.some(
    (r) => (r.ingredient_type === "food" || r.ingredient_type === "sub_recipe") && r.cost_per_unit === 0
  );
  const hasMissingWeight = recipes.some(
    (r) => (r.ingredient_type === "food" || r.ingredient_type === "sub_recipe") && r.quantity === 0
  );
  const hasFoodIngredients = recipes.some((r) => r.ingredient_type === "food" || r.ingredient_type === "sub_recipe");

  // Helper: is this specific ingredient incomplete?
  const isIncomplete = (r: RecipeIngredient) =>
    (r.ingredient_type === "food" || r.ingredient_type === "sub_recipe") &&
    (r.cost_per_unit === 0 || r.quantity === 0);

  // Determine display status (override to "incomplete" if missing prices or weights)
  const displayStatus =
    !hasFoodIngredients
      ? "needs-input"
      : hasZeroCostIngredient || hasMissingWeight
      ? "incomplete"
      : itemData?.status || "needs-input";

  const statusConfig = STATUS_CONFIG[displayStatus] || STATUS_CONFIG["needs-input"];

  async function refreshData() {
    const itemRes = await fetch(`/api/menu-items/${id}`).then((r) => r.json());
    setItemData(itemRes.item);
    setRecipes(itemRes.recipes || []);
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/menu-items/${id}`).then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([itemRes, catRes]) => {
        const item = itemRes.item;
        if (!item) {
          setError("Couldn't find this menu item");
          setLoading(false);
          return;
        }
        setItemData(item);
        setName(item.name || "");
        setCategoryId(item.category_id || "");
        setSellingPrice(item.selling_price?.toString() || "");
        setNotes(item.notes || "");
        setRecipes(itemRes.recipes || []);
        setCategories(catRes.categories || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Something went wrong loading this item");
        setLoading(false);
      });
  }, [id]);

  async function handleSaveQty() {
    if (!editingRecipe || !editQty) return;
    const newQty = parseFloat(editQty);
    if (isNaN(newQty) || newQty <= 0) return;
    setSavingQty(true);
    try {
      const body: Record<string, unknown> = { id: editingRecipe.id, quantity: newQty };
      if (editUnit && editUnit !== editingRecipe.quantity_unit) {
        body.quantity_unit = editUnit;
      }
      const res = await fetch("/api/recipes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      await refreshData();
      setEditingRecipe(null);
    } catch {
      setError("Couldn't update the amount. Try again.");
    } finally {
      setSavingQty(false);
    }
  }

  async function handleSwapIngredient(newIngredientId: string) {
    if (!editingRecipe) return;
    setSwapping(true);
    try {
      const res = await fetch("/api/recipes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRecipe.id,
          ingredient_id: newIngredientId,
        }),
      });
      if (!res.ok) throw new Error("Failed to swap");
      await refreshData();
      setEditingRecipe(null);
      setShowSwap(false);
      setIngredientSearch("");
    } catch {
      setError("Couldn't change the ingredient. Try again.");
    } finally {
      setSwapping(false);
    }
  }

  async function loadIngredients() {
    if (allIngredients.length > 0) return;
    try {
      const res = await fetch("/api/ingredients");
      const data = await res.json();
      setAllIngredients(data.ingredients || []);
    } catch {
      // ignore
    }
  }

  async function handleAddIngredient() {
    if (!selectedIngredient || !addQty) return;
    const qty = parseFloat(addQty);
    if (isNaN(qty) || qty <= 0) return;
    setAddingIngredient(true);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu_item_id: id,
          ingredient_id: selectedIngredient.id,
          quantity: qty,
          quantity_unit: addUnit || selectedIngredient.unit,
        }),
      });
      if (!res.ok) throw new Error("Failed to add");
      await refreshData();
      setShowAddIngredient(false);
      setSelectedIngredient(null);
      setAddSearch("");
      setAddQty("");
      setAddUnit("");
    } catch {
      setError("Couldn't add the ingredient. Try again.");
    } finally {
      setAddingIngredient(false);
    }
  }

  async function handleDeleteRecipe() {
    if (!editingRecipe) return;
    setDeletingRecipe(true);
    try {
      const res = await fetch(`/api/recipes?id=${editingRecipe.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await refreshData();
      setEditingRecipe(null);
      setConfirmDelete(false);
    } catch {
      setError("Couldn't remove the ingredient. Try again.");
    } finally {
      setDeletingRecipe(false);
    }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCategories((prev) => [...prev, { id: data.id, name: data.name }]);
      setCategoryId(data.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch {
      setError("Couldn't create the category.");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please give this item a name");
      return;
    }
    if (!sellingPrice || parseFloat(sellingPrice) <= 0) {
      setError("Please enter the selling price");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/menu-items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          selling_price: parseFloat(sellingPrice),
          category_id: categoryId || null,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      router.push("/menu");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/menu-items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }
      router.push("/menu");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-porch-teal rounded-full animate-spin" />
        <p className="text-sm text-porch-brown-light/70">Loading item...</p>
      </div>
    );
  }

  if (!itemData && error) {
    return (
      <div className="text-center py-16">
        <p className="text-foreground font-medium">{error}</p>
        <Link
          href="/menu"
          className="text-porch-teal text-sm font-medium mt-2 inline-block"
        >
          Back to menu
        </Link>
      </div>
    );
  }

  const filteredIngredients = allIngredients.filter(
    (ing) =>
      ing.name.toLowerCase().includes(ingredientSearch.toLowerCase()) &&
      ing.id !== editingRecipe?.ingredient_id
  );

  return (
    <div className="space-y-4">
      {/* Page Header - sticky so you always see what item you're editing */}
      <div className="sticky top-0 z-40 bg-background -mx-4 px-4 py-3 border-b border-porch-cream-dark/30">
        <div className="flex items-center gap-3">
          <Link
            href="/menu"
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
          <div>
            <h2 className="text-lg font-bold text-foreground leading-tight">{itemData?.name || "Edit Menu Item"}</h2>
            {itemData && itemData.selling_price > 0 && (
              <p className="text-xs text-porch-brown-light/60">Sells for ${itemData.selling_price.toFixed(2)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Cost Summary Card */}
      {itemData && (
        <div
          className={`rounded-2xl p-4 border ${statusConfig.bg} ${
            displayStatus === "good"
              ? "border-status-good/20"
              : displayStatus === "warning"
              ? "border-status-warning/20"
              : displayStatus === "danger"
              ? "border-status-danger/20"
              : displayStatus === "incomplete"
              ? "border-status-warning/20"
              : "border-status-gray/20"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-xs font-semibold ${statusConfig.text} uppercase tracking-wider`}>
                {displayStatus === "needs-input" || displayStatus === "incomplete"
                  ? "Status"
                  : "Food Cost"}
              </p>
              {displayStatus !== "needs-input" && displayStatus !== "incomplete" ? (
                <p className={`text-3xl font-bold mt-1 ${statusConfig.text}`}>
                  {itemData.food_cost_percentage}%
                </p>
              ) : null}
              <p className={`text-xs mt-1 ${statusConfig.text}`}>
                {statusConfig.label}
              </p>
            </div>

            {displayStatus !== "needs-input" && displayStatus !== "incomplete" && (
              <div className="text-right text-xs space-y-1">
                <p className="text-porch-brown-light/60">
                  Costs{" "}
                  <span className="font-semibold text-foreground">
                    ${itemData.total_ingredient_cost.toFixed(2)}
                  </span>{" "}
                  to make
                </p>
                <p className="text-porch-brown-light/60">
                  Profit:{" "}
                  <span className="font-semibold text-foreground">
                    ${itemData.profit_per_item.toFixed(2)}
                  </span>
                </p>
                {itemData.suggested_price > 0 && (
                  <p className={`font-semibold ${
                    displayStatus === "danger" ? "text-status-danger" :
                    displayStatus === "warning" ? "text-status-warning" :
                    "text-porch-brown-light/60"
                  }`}>
                    30% target: ${itemData.suggested_price.toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recipe Section */}
      <div className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-porch-cream-dark/30">
          <h3 className="text-sm font-semibold text-foreground">
            Recipe ({recipes.length} ingredient{recipes.length !== 1 ? "s" : ""})
          </h3>
          <Link
            href={`/menu/${id}/recipe`}
            className="text-xs font-semibold text-porch-teal hover:text-porch-teal-light transition-colors"
          >
            {recipes.length > 0 ? "Edit Recipe" : "Add Recipe"}
          </Link>
        </div>

        {recipes.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-porch-brown-light/50">
              No recipe added yet
            </p>
            <p className="text-xs text-porch-brown-light/40 mt-1">
              Add ingredients to see what this item costs to make
            </p>
            <button
              onClick={() => { setShowAddIngredient(true); loadIngredients(); }}
              className="inline-block mt-3 bg-porch-teal text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              Add Ingredient
            </button>
          </div>
        ) : (
          <div className="divide-y divide-porch-cream-dark/20">
            {/* Food ingredients */}
            {recipes.filter(r => r.ingredient_type === 'food' || r.ingredient_type === 'sub_recipe').length > 0 && (
              <>
                <div className="px-4 py-2 bg-porch-cream/20">
                  <span className="text-[10px] font-semibold text-porch-brown-light/60 uppercase tracking-wider">Ingredients</span>
                </div>
                {recipes.filter(r => r.ingredient_type === 'food' || r.ingredient_type === 'sub_recipe').map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setEditingRecipe(r); setEditQty(r.quantity.toString()); setEditUnit(r.quantity_unit); setShowSwap(false); setIngredientSearch(""); }}
                    className={`flex items-center justify-between px-4 py-2.5 w-full text-left hover:bg-porch-cream/30 active:bg-porch-cream/50 transition-colors ${
                      isIncomplete(r) ? "bg-status-danger/5 border-l-4 border-l-status-danger" : ""
                    }`}
                  >
                    <div>
                      <p className={`text-sm ${isIncomplete(r) ? "text-status-danger" : "text-foreground"}`}>
                        {r.ingredient_name}
                        {r.cost_per_unit === 0 && (
                          <span className="ml-1.5 text-[10px] font-semibold bg-status-danger/15 text-status-danger px-1.5 py-0.5 rounded-full">
                            needs price
                          </span>
                        )}
                        {r.quantity === 0 && (
                          <span className="ml-1.5 text-[10px] font-semibold bg-status-danger/15 text-status-danger px-1.5 py-0.5 rounded-full">
                            needs weight
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-porch-brown-light/50">
                        {r.quantity > 0 ? `${r.quantity} ${r.quantity_unit}` : "no amount set"}
                        {r.cost_per_unit > 0 && r.quantity > 0 ? ` @ $${formatPrice(r.cost_per_unit)}/${r.ingredient_unit || r.quantity_unit}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${isIncomplete(r) ? "text-status-danger" : "text-foreground"}`}>
                        {isIncomplete(r) ? "$?.??" : `$${r.line_cost.toFixed(2)}`}
                      </span>
                      <svg className="w-3.5 h-3.5 text-porch-brown-light/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </div>
                  </button>
                ))}
              </>
            )}
            {/* Packaging */}
            {recipes.filter(r => r.ingredient_type === 'packaging').length > 0 && (
              <>
                <div className="px-4 py-2 bg-porch-cream/20">
                  <span className="text-[10px] font-semibold text-porch-brown-light/60 uppercase tracking-wider">Packaging</span>
                </div>
                {recipes.filter(r => r.ingredient_type === 'packaging').map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setEditingRecipe(r); setEditQty(r.quantity.toString()); setEditUnit(r.quantity_unit); setShowSwap(false); setIngredientSearch(""); }}
                    className="flex items-center justify-between px-4 py-2.5 w-full text-left hover:bg-porch-cream/30 active:bg-porch-cream/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm text-foreground">{r.ingredient_name}</p>
                      <p className="text-[10px] text-porch-brown-light/50">
                        {r.quantity} {r.quantity_unit} {r.cost_per_unit > 0 ? `@ $${r.cost_per_unit.toFixed(4)}/each` : '(price needed)'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${r.cost_per_unit > 0 ? 'text-foreground' : 'text-porch-brown-light/40'}`}>
                        {r.cost_per_unit > 0 ? `$${r.line_cost.toFixed(2)}` : '—'}
                      </span>
                      <svg className="w-3.5 h-3.5 text-porch-brown-light/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </div>
                  </button>
                ))}
              </>
            )}
            {/* No food ingredients notice */}
            {recipes.filter(r => r.ingredient_type === 'food' || r.ingredient_type === 'sub_recipe').length === 0 && recipes.length > 0 && (
              <div className="px-4 py-3 bg-status-warning/5 border-t border-status-warning/20">
                <p className="text-xs text-status-warning font-medium">
                  Packaging added — food ingredients still needed for accurate cost
                </p>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-2.5 bg-porch-cream/30">
              <div>
                <span className="text-sm font-semibold text-foreground">Total Cost</span>
                {itemData && itemData.packaging_cost > 0 && (
                  <p className="text-[10px] text-porch-brown-light/50">
                    (Packaging: ${itemData.packaging_cost.toFixed(2)})
                  </p>
                )}
              </div>
              <span className={`text-sm font-bold ${hasZeroCostIngredient || hasMissingWeight ? "text-status-danger" : "text-foreground"}`}>
                {hasZeroCostIngredient || hasMissingWeight ? "Incomplete" : `$${itemData?.total_ingredient_cost.toFixed(2)}`}
              </span>
            </div>
            {/* Add Ingredient Button */}
            <button
              onClick={() => { setShowAddIngredient(true); loadIngredients(); }}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-semibold text-porch-teal hover:bg-porch-teal/5 active:bg-porch-teal/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Ingredient
            </button>
          </div>
        )}
      </div>

      {/* Edit Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <h3 className="text-sm font-semibold text-foreground">Item Details</h3>

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            Item name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            Category
          </label>

          {!showNewCategory ? (
            <select
              value={categoryId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setShowNewCategory(true);
                  setCategoryId("");
                } else {
                  setCategoryId(e.target.value);
                }
              }}
              className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
              <option value="__new__">+ Create new category</option>
            </select>
          ) : (
            <div className="bg-porch-cream/40 border border-porch-cream-dark rounded-xl p-3 space-y-2">
              <input
                type="text"
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategoryName("");
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-porch-cream-dark text-porch-brown-light text-sm font-medium hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={creatingCategory || !newCategoryName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-porch-teal text-white text-sm font-medium hover:bg-porch-teal-light disabled:opacity-50 transition-colors"
                >
                  {creatingCategory ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Selling Price */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            Selling price
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-porch-brown-light/40 text-base font-medium">
              $
            </span>
            <input
              type="number"
              placeholder="0.00"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              min="0"
              step="0.01"
              className="w-full pl-8 pr-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            Notes{" "}
            <span className="font-normal text-porch-brown-light/50">
              (optional)
            </span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base resize-none focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-status-danger/5 border border-status-danger/20 rounded-xl p-3">
            <p className="text-sm text-status-danger">{error}</p>
          </div>
        )}

        {/* Save */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-porch-teal text-white font-semibold text-base hover:bg-porch-teal-light active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        {/* Delete */}
        <div className="pt-4 border-t border-porch-cream-dark/50">
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 rounded-xl border border-status-danger/30 text-status-danger font-medium text-sm hover:bg-status-danger/5 transition-colors"
            >
              Delete this menu item
            </button>
          ) : (
            <div className="bg-status-danger/5 border border-status-danger/20 rounded-xl p-4">
              <p className="text-sm font-semibold text-status-danger mb-1">
                Are you sure?
              </p>
              <p className="text-sm text-foreground/70 mb-3">
                This will permanently remove &ldquo;{name}&rdquo;
                {recipes.length > 0
                  ? ` and its recipe (${recipes.length} ingredient${
                      recipes.length !== 1 ? "s" : ""
                    })`
                  : ""}
                . You can always add it again later.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-porch-cream-dark text-porch-brown-light text-sm font-medium hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-status-danger text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting..." : "Yes, delete it"}
                </button>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Add Ingredient Modal */}
      {showAddIngredient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowAddIngredient(false); setSelectedIngredient(null); setAddSearch(""); setAddQty(""); }}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl p-5 animate-slide-up max-h-[80vh] overflow-y-auto">
            <h3 className="text-base font-bold text-foreground mb-3">
              Add Ingredient
            </h3>

            {!selectedIngredient ? (
              <>
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Search ingredients..."
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                />
                <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-porch-cream-dark/20 border border-porch-cream-dark/30 rounded-xl">
                  {allIngredients.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-porch-brown-light/50">Loading...</p>
                  ) : addSearch.length < 1 ? (
                    <p className="px-4 py-3 text-sm text-porch-brown-light/50">Start typing to search</p>
                  ) : (
                    allIngredients
                      .filter((ing) =>
                        ing.name.toLowerCase().includes(addSearch.toLowerCase()) &&
                        !recipes.some((r) => r.ingredient_id === ing.id)
                      )
                      .slice(0, 20)
                      .map((ing) => (
                        <button
                          key={ing.id}
                          onClick={() => { setSelectedIngredient(ing); setAddQty(""); }}
                          className="w-full px-4 py-2.5 text-left hover:bg-porch-cream/30 active:bg-porch-cream/50"
                        >
                          <p className="text-sm text-foreground">{ing.name}</p>
                          <p className="text-[10px] text-porch-brown-light/50">
                            {ing.cost_per_unit > 0
                              ? `$${formatPrice(ing.cost_per_unit)}/${ing.unit}`
                              : "No price yet"}
                          </p>
                        </button>
                      ))
                  )}
                  {addSearch.length >= 1 &&
                    allIngredients.filter((ing) =>
                      ing.name.toLowerCase().includes(addSearch.toLowerCase()) &&
                      !recipes.some((r) => r.ingredient_id === ing.id)
                    ).length === 0 && (
                      <p className="px-4 py-3 text-sm text-porch-brown-light/50">No matches</p>
                    )}
                </div>
                <button
                  onClick={() => { setShowAddIngredient(false); setAddSearch(""); }}
                  className="w-full mt-3 py-3 rounded-xl border border-porch-cream-dark text-porch-brown-light font-medium text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="bg-porch-cream/40 rounded-xl px-4 py-3 mb-3">
                  <p className="text-sm font-semibold text-foreground">{selectedIngredient.name}</p>
                  <p className="text-[10px] text-porch-brown-light/50">
                    {selectedIngredient.cost_per_unit > 0
                      ? `$${formatPrice(selectedIngredient.cost_per_unit)} per ${selectedIngredient.unit}`
                      : "No price yet"}
                  </p>
                </div>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  Amount
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    placeholder="How much?"
                    min="0.01"
                    step="any"
                    autoFocus
                    className="flex-1 px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                  />
                  <select
                    value={addUnit || selectedIngredient.unit}
                    onChange={(e) => setAddUnit(e.target.value)}
                    className="px-3 py-3 rounded-xl border border-porch-cream-dark bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                  >
                    <option value="g">g</option>
                    <option value="oz">oz</option>
                    <option value="lb">lb</option>
                    <option value="fl oz">fl oz</option>
                    <option value="each">each</option>
                    <option value="half">half</option>
                    <option value="serving">serving</option>
                  </select>
                </div>
                {addQty && parseFloat(addQty) > 0 && selectedIngredient.cost_per_unit > 0 && (
                  <p className="text-xs text-porch-brown-light/60 mt-2">
                    Cost: ${(parseFloat(addQty) * selectedIngredient.cost_per_unit * unitConversionFactor(addUnit || selectedIngredient.unit, selectedIngredient.unit)).toFixed(2)}
                  </p>
                )}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => { setSelectedIngredient(null); setAddQty(""); setAddUnit(""); }}
                    className="flex-1 py-3 rounded-xl border border-porch-cream-dark text-porch-brown-light font-medium text-sm"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAddIngredient}
                    disabled={addingIngredient || !addQty || parseFloat(addQty) <= 0}
                    className="flex-1 py-3 rounded-xl bg-porch-teal text-white font-semibold text-sm disabled:opacity-50"
                  >
                    {addingIngredient ? "Adding..." : "Add"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Ingredient Modal */}
      {editingRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setEditingRecipe(null); setShowSwap(false); setConfirmDelete(false); }}
          />
          <div ref={modalRef} className="relative w-full max-w-sm bg-white rounded-2xl p-5 animate-slide-up max-h-[80vh] overflow-y-auto">
            <h3 className="text-base font-bold text-foreground mb-1">
              {editingRecipe.ingredient_name}
            </h3>
            <p className="text-xs text-porch-brown-light/60 mb-4">
              Currently {editingRecipe.quantity} {editingRecipe.quantity_unit}
              {editingRecipe.cost_per_unit > 0
                ? ` · $${editingRecipe.line_cost.toFixed(2)}`
                : " · needs price"}
            </p>

            {!showSwap ? (
              <>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  Amount
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    min="0.01"
                    step="any"
                    autoFocus
                    className="flex-1 px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                  />
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="px-3 py-3 rounded-xl border border-porch-cream-dark bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                  >
                    <option value="g">g</option>
                    <option value="oz">oz</option>
                    <option value="lb">lb</option>
                    <option value="fl oz">fl oz</option>
                    <option value="each">each</option>
                    <option value="half">half</option>
                    <option value="serving">serving</option>
                  </select>
                </div>
                {editQty && parseFloat(editQty) > 0 && editingRecipe.cost_per_unit > 0 && (
                  <p className="text-xs text-porch-brown-light/60 mt-2">
                    New cost: ${(parseFloat(editQty) * editingRecipe.cost_per_unit * unitConversionFactor(editUnit || editingRecipe.quantity_unit, editingRecipe.ingredient_unit || editingRecipe.quantity_unit)).toFixed(2)}
                  </p>
                )}

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => { setEditingRecipe(null); setShowSwap(false); setConfirmDelete(false); }}
                    className="flex-1 py-3 rounded-xl border border-porch-cream-dark text-porch-brown-light font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveQty}
                    disabled={savingQty || !editQty || parseFloat(editQty) <= 0}
                    className="flex-1 py-3 rounded-xl bg-porch-teal text-white font-semibold text-sm disabled:opacity-50"
                  >
                    {savingQty ? "Saving..." : "Save"}
                  </button>
                </div>

                <button
                  onClick={() => { setShowSwap(true); loadIngredients(); }}
                  className="w-full mt-3 py-2.5 text-xs font-medium text-porch-teal border border-porch-teal/30 rounded-xl hover:bg-porch-teal/5"
                >
                  Change to a different ingredient
                </button>

                {/* Delete ingredient */}
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full mt-2 py-2.5 text-xs font-medium text-status-danger border border-status-danger/30 rounded-xl hover:bg-status-danger/5"
                  >
                    Remove from recipe
                  </button>
                ) : (
                  <div className="mt-2 bg-status-danger/5 border border-status-danger/20 rounded-xl p-3">
                    <p className="text-xs text-status-danger font-medium mb-2">
                      Remove {editingRecipe.ingredient_name}?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-2 rounded-lg border border-porch-cream-dark text-porch-brown-light text-xs font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteRecipe}
                        disabled={deletingRecipe}
                        className="flex-1 py-2 rounded-lg bg-status-danger text-white text-xs font-medium disabled:opacity-50"
                      >
                        {deletingRecipe ? "Removing..." : "Yes, remove it"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  Search ingredients
                </label>
                <input
                  type="text"
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                  placeholder="Type to search..."
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                />
                <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-porch-cream-dark/20 border border-porch-cream-dark/30 rounded-xl">
                  {filteredIngredients.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-porch-brown-light/50">
                      {allIngredients.length === 0 ? "Loading..." : "No matches"}
                    </p>
                  ) : (
                    filteredIngredients.slice(0, 20).map((ing) => (
                      <button
                        key={ing.id}
                        onClick={() => handleSwapIngredient(ing.id)}
                        disabled={swapping}
                        className="w-full px-4 py-2.5 text-left hover:bg-porch-cream/30 active:bg-porch-cream/50 disabled:opacity-50"
                      >
                        <p className="text-sm text-foreground">{ing.name}</p>
                        <p className="text-[10px] text-porch-brown-light/50">
                          {ing.cost_per_unit > 0
                            ? `$${formatPrice(ing.cost_per_unit)}/${ing.unit}`
                            : "No price yet"}
                        </p>
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => setShowSwap(false)}
                  className="w-full mt-3 py-3 rounded-xl border border-porch-cream-dark text-porch-brown-light font-medium text-sm"
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
