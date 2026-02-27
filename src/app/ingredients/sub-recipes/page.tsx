"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Component {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  quantity_unit: string;
  cost_per_unit: number;
  line_cost: number;
}

interface SubRecipe {
  id: string;
  name: string;
  cost_per_unit: number;
  components: Component[];
  usage_count: number;
  used_by: string[];
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  ingredient_type: string;
}

export default function SubRecipesPage() {
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [components, setComponents] = useState<
    { ingredient_id: string; quantity: string; quantity_unit: string }[]
  >([]);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Edit form
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editComponents, setEditComponents] = useState<
    { ingredient_id: string; ingredient_name: string; quantity: string; quantity_unit: string }[]
  >([]);
  const [editSearch, setEditSearch] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchSubRecipes();
  }, []);

  async function fetchSubRecipes() {
    try {
      const res = await fetch("/api/sub-recipes");
      const data = await res.json();
      setSubRecipes(data.subRecipes || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadIngredients() {
    if (allIngredients.length > 0) return;
    try {
      const res = await fetch("/api/ingredients");
      const data = await res.json();
      // Only show food ingredients (not sub-recipes or packaging)
      setAllIngredients(
        (data.ingredients || []).filter(
          (i: Ingredient) => i.ingredient_type === "food"
        )
      );
    } catch {
      // ignore
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addComponent(ing: Ingredient) {
    // Don't add duplicates
    if (components.some((c) => c.ingredient_id === ing.id)) return;
    setComponents((prev) => [
      ...prev,
      { ingredient_id: ing.id, quantity: "1", quantity_unit: ing.unit },
    ]);
    setIngredientSearch("");
  }

  function removeComponent(ingredientId: string) {
    setComponents((prev) =>
      prev.filter((c) => c.ingredient_id !== ingredientId)
    );
  }

  function updateComponentQty(ingredientId: string, qty: string) {
    setComponents((prev) =>
      prev.map((c) =>
        c.ingredient_id === ingredientId ? { ...c, quantity: qty } : c
      )
    );
  }

  async function handleCreate() {
    if (!newName.trim() || components.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/sub-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          components: components.map((c) => ({
            ingredient_id: c.ingredient_id,
            quantity: parseFloat(c.quantity) || 0,
            quantity_unit: c.quantity_unit,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }
      setNewName("");
      setComponents([]);
      setShowCreate(false);
      await fetchSubRecipes();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(sr: SubRecipe) {
    setEditing(sr.id);
    setEditName(sr.name);
    setEditComponents(
      sr.components.map((c) => ({
        ingredient_id: c.ingredient_id,
        ingredient_name: c.ingredient_name,
        quantity: c.quantity.toString(),
        quantity_unit: c.quantity_unit,
      }))
    );
    setEditSearch("");
    loadIngredients();
  }

  function addEditComponent(ing: Ingredient) {
    if (editComponents.some((c) => c.ingredient_id === ing.id)) return;
    setEditComponents((prev) => [
      ...prev,
      {
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        quantity: "1",
        quantity_unit: ing.unit,
      },
    ]);
    setEditSearch("");
  }

  async function handleSaveEdit() {
    if (!editing || editComponents.length === 0) return;
    setSavingEdit(true);
    setError("");
    try {
      const res = await fetch("/api/sub-recipes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing,
          name: editName.trim() || undefined,
          components: editComponents.map((c) => ({
            ingredient_id: c.ingredient_id,
            quantity: parseFloat(c.quantity) || 0,
            quantity_unit: c.quantity_unit,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setEditing(null);
      await fetchSubRecipes();
    } catch {
      setError("Couldn't save changes. Try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  // Filter available ingredients for search (exclude already-added ones)
  const filteredIngredients = allIngredients.filter(
    (ing) =>
      ing.name.toLowerCase().includes(ingredientSearch.toLowerCase()) &&
      !components.some((c) => c.ingredient_id === ing.id)
  );

  const filteredEditIngredients = allIngredients.filter(
    (ing) =>
      ing.name.toLowerCase().includes(editSearch.toLowerCase()) &&
      !editComponents.some((c) => c.ingredient_id === ing.id)
  );

  function getIngredientName(ingredientId: string) {
    return (
      allIngredients.find((i) => i.id === ingredientId)?.name || ingredientId
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-porch-teal rounded-full animate-spin" />
        <p className="text-sm text-porch-brown-light/70">
          Loading sub-recipes...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/ingredients"
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
          <h2 className="text-xl font-bold text-foreground">Sub-Recipes</h2>
          <p className="text-sm text-porch-brown-light/70 mt-0.5">
            Reusable blends and mixes used across your menu
          </p>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-porch-cream/50 border border-porch-cream-dark/50 rounded-2xl p-4">
        <p className="text-xs text-porch-brown-light/70">
          A sub-recipe is a mix of ingredients that you use in multiple menu
          items. For example, &quot;Acai Blend&quot; combines acai, frozen fruit,
          and water. When you add it to a menu item, it calculates the combined
          cost automatically.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-status-danger/5 border border-status-danger/20 rounded-xl p-3">
          <p className="text-sm text-status-danger">{error}</p>
        </div>
      )}

      {/* Sub-Recipe List */}
      {subRecipes.length === 0 && !showCreate && (
        <div className="text-center py-12">
          <p className="text-lg font-medium text-foreground">
            No sub-recipes yet
          </p>
          <p className="text-sm text-porch-brown-light/60 mt-1">
            Create your first one to simplify your menu recipes
          </p>
          <button
            onClick={() => {
              setShowCreate(true);
              loadIngredients();
            }}
            className="inline-block mt-4 bg-porch-teal text-white px-6 py-3 rounded-xl font-semibold text-sm"
          >
            Create Sub-Recipe
          </button>
        </div>
      )}

      {subRecipes.map((sr) => {
        const isExpanded = expanded.has(sr.id);
        const isEditing = editing === sr.id;

        return (
          <div
            key={sr.id}
            className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => toggleExpand(sr.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-porch-cream/20 active:bg-porch-cream/40 transition-colors"
            >
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">
                  {sr.name}
                </h3>
                <p className="text-xs text-porch-brown-light/60 mt-0.5">
                  {sr.components.length} ingredient
                  {sr.components.length !== 1 ? "s" : ""} · Used in{" "}
                  {sr.usage_count} item{sr.usage_count !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  ${sr.cost_per_unit.toFixed(2)}
                </span>
                <svg
                  className={`w-4 h-4 text-porch-brown-light/40 transition-transform ${
                    isExpanded ? "rotate-90" : ""
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
              </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && !isEditing && (
              <div className="border-t border-porch-cream-dark/30">
                {/* Components */}
                <div className="divide-y divide-porch-cream-dark/20">
                  {sr.components.map((comp) => (
                    <div
                      key={comp.id}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <div>
                        <p className="text-sm text-foreground">
                          {comp.ingredient_name}
                        </p>
                        <p className="text-[10px] text-porch-brown-light/50">
                          {comp.quantity} {comp.quantity_unit}
                          {comp.cost_per_unit > 0
                            ? ` @ $${comp.cost_per_unit.toFixed(2)}/${comp.quantity_unit}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          comp.cost_per_unit === 0
                            ? "text-status-warning"
                            : "text-foreground"
                        }`}
                      >
                        {comp.cost_per_unit > 0
                          ? `$${comp.line_cost.toFixed(4)}`
                          : "$?.??"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-porch-cream/30 border-t border-porch-cream-dark/30">
                  <span className="text-sm font-semibold text-foreground">
                    Total per serving
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    ${sr.cost_per_unit.toFixed(4)}
                  </span>
                </div>

                {/* Used By */}
                {sr.used_by.length > 0 && (
                  <div className="px-4 py-2.5 bg-porch-cream/15 border-t border-porch-cream-dark/20">
                    <p className="text-[10px] font-semibold text-porch-brown-light/60 uppercase tracking-wider mb-1">
                      Used in
                    </p>
                    <p className="text-xs text-porch-brown-light/70">
                      {sr.used_by.join(", ")}
                    </p>
                  </div>
                )}

                {/* Edit Button */}
                <div className="px-4 py-3 border-t border-porch-cream-dark/30">
                  <button
                    onClick={() => startEdit(sr)}
                    className="w-full py-2.5 rounded-xl border border-porch-teal/30 text-porch-teal text-sm font-medium hover:bg-porch-teal/5 transition-colors"
                  >
                    Edit Sub-Recipe
                  </button>
                </div>
              </div>
            )}

            {/* Edit Mode */}
            {isExpanded && isEditing && (
              <div className="border-t border-porch-cream-dark/30 p-4 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                  />
                </div>

                {/* Current Components */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Ingredients
                  </label>
                  <div className="space-y-2">
                    {editComponents.map((comp) => (
                      <div
                        key={comp.ingredient_id}
                        className="flex items-center gap-2 bg-porch-cream/30 rounded-xl p-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {comp.ingredient_name}
                          </p>
                        </div>
                        <input
                          type="number"
                          value={comp.quantity}
                          onChange={(e) =>
                            setEditComponents((prev) =>
                              prev.map((c) =>
                                c.ingredient_id === comp.ingredient_id
                                  ? { ...c, quantity: e.target.value }
                                  : c
                              )
                            )
                          }
                          min="0.01"
                          step="any"
                          className="w-20 px-2 py-1.5 rounded-lg border border-porch-cream-dark bg-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-porch-teal/50"
                        />
                        <span className="text-xs text-porch-brown-light/60 w-8">
                          {comp.quantity_unit}
                        </span>
                        <button
                          onClick={() =>
                            setEditComponents((prev) =>
                              prev.filter(
                                (c) =>
                                  c.ingredient_id !== comp.ingredient_id
                              )
                            )
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-status-danger hover:bg-status-danger/10"
                        >
                          <svg
                            className="w-4 h-4"
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
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Ingredient Search */}
                <div>
                  <input
                    type="text"
                    value={editSearch}
                    onChange={(e) => setEditSearch(e.target.value)}
                    placeholder="Search to add an ingredient..."
                    className="w-full px-4 py-2.5 rounded-xl border border-porch-cream-dark bg-white text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
                  />
                  {editSearch && (
                    <div className="mt-1 max-h-36 overflow-y-auto border border-porch-cream-dark/30 rounded-xl divide-y divide-porch-cream-dark/20">
                      {filteredEditIngredients.length === 0 ? (
                        <p className="px-4 py-2.5 text-sm text-porch-brown-light/50">
                          No matches
                        </p>
                      ) : (
                        filteredEditIngredients.slice(0, 10).map((ing) => (
                          <button
                            key={ing.id}
                            onClick={() => addEditComponent(ing)}
                            className="w-full px-4 py-2 text-left hover:bg-porch-cream/30 text-sm text-foreground"
                          >
                            {ing.name}
                            <span className="text-porch-brown-light/50 ml-1">
                              (${ing.cost_per_unit.toFixed(2)}/{ing.unit})
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Save/Cancel */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditing(null)}
                    className="flex-1 py-3 rounded-xl border border-porch-cream-dark text-porch-brown-light font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit || editComponents.length === 0}
                    className="flex-1 py-3 rounded-xl bg-porch-teal text-white font-semibold text-sm disabled:opacity-50"
                  >
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Create Sub-Recipe Form */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-porch-cream-dark/50 p-4 space-y-4">
          <h3 className="text-base font-bold text-foreground">
            New Sub-Recipe
          </h3>

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder='e.g., "Chicken Curry Base", "Smoothie Mix"'
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
            />
          </div>

          {/* Added Components */}
          {components.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Ingredients ({components.length})
              </label>
              <div className="space-y-2">
                {components.map((comp) => (
                  <div
                    key={comp.ingredient_id}
                    className="flex items-center gap-2 bg-porch-cream/30 rounded-xl p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {getIngredientName(comp.ingredient_id)}
                      </p>
                    </div>
                    <input
                      type="number"
                      value={comp.quantity}
                      onChange={(e) =>
                        updateComponentQty(comp.ingredient_id, e.target.value)
                      }
                      min="0.01"
                      step="any"
                      className="w-20 px-2 py-1.5 rounded-lg border border-porch-cream-dark bg-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-porch-teal/50"
                    />
                    <span className="text-xs text-porch-brown-light/60 w-8">
                      {comp.quantity_unit}
                    </span>
                    <button
                      onClick={() => removeComponent(comp.ingredient_id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-status-danger hover:bg-status-danger/10"
                    >
                      <svg
                        className="w-4 h-4"
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Ingredients to Add */}
          <div>
            <input
              type="text"
              value={ingredientSearch}
              onChange={(e) => setIngredientSearch(e.target.value)}
              placeholder="Search ingredients to add..."
              className="w-full px-4 py-2.5 rounded-xl border border-porch-cream-dark bg-white text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
            />
            {ingredientSearch && (
              <div className="mt-1 max-h-40 overflow-y-auto border border-porch-cream-dark/30 rounded-xl divide-y divide-porch-cream-dark/20">
                {filteredIngredients.length === 0 ? (
                  <p className="px-4 py-2.5 text-sm text-porch-brown-light/50">
                    {allIngredients.length === 0
                      ? "Loading..."
                      : "No matches"}
                  </p>
                ) : (
                  filteredIngredients.slice(0, 10).map((ing) => (
                    <button
                      key={ing.id}
                      onClick={() => addComponent(ing)}
                      className="w-full px-4 py-2 text-left hover:bg-porch-cream/30 text-sm text-foreground"
                    >
                      {ing.name}
                      <span className="text-porch-brown-light/50 ml-1">
                        (${ing.cost_per_unit.toFixed(2)}/{ing.unit})
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Create/Cancel */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowCreate(false);
                setNewName("");
                setComponents([]);
                setIngredientSearch("");
              }}
              className="flex-1 py-3 rounded-xl border border-porch-cream-dark text-porch-brown-light font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || components.length === 0}
              className="flex-1 py-3 rounded-xl bg-porch-teal text-white font-semibold text-sm disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Sub-Recipe"}
            </button>
          </div>
        </div>
      )}

      {/* Floating Add Button (when list has items) */}
      {subRecipes.length > 0 && !showCreate && (
        <div className="fixed bottom-20 right-4 z-30">
          <button
            onClick={() => {
              setShowCreate(true);
              loadIngredients();
            }}
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
            New Sub-Recipe
          </button>
        </div>
      )}
    </div>
  );
}
