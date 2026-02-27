"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  package_size: number | null;
  package_unit: string | null;
  package_price: number | null;
  supplier: string;
  notes: string | null;
  recipe_count: number;
}

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ingredients")
      .then((res) => res.json())
      .then((data) => {
        setIngredients(data.ingredients || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = ingredients.filter(
    (ing) =>
      ing.name.toLowerCase().includes(search.toLowerCase()) ||
      (ing.supplier || "").toLowerCase().includes(search.toLowerCase())
  );

  function formatPackageInfo(ing: Ingredient) {
    if (!ing.package_size || !ing.package_price) return null;
    const unitLabel = ing.package_unit || ing.unit;
    return `${ing.package_size} ${unitLabel} — $${ing.package_price.toFixed(2)}`;
  }

  function formatCostPerUnit(ing: Ingredient) {
    if (!ing.cost_per_unit) return "No price yet";
    return `$${ing.cost_per_unit.toFixed(2)}/${ing.unit}`;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-zinc-900">
                My Ingredients
              </h1>
              <p className="text-sm text-zinc-500">
                Everything you buy to make your menu items
              </p>
            </div>
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              Home
            </Link>
          </div>

          {/* Quick Links */}
          <div className="flex gap-2 mb-3">
            <Link
              href="/ingredients/sub-recipes"
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-porch-cream border border-porch-cream-dark text-porch-brown-light hover:border-porch-brown-light/30 transition-colors"
            >
              Sub-Recipes
            </Link>
            <Link
              href="/recipes"
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-porch-cream border border-porch-cream-dark text-porch-brown-light hover:border-porch-brown-light/30 transition-colors"
            >
              Recipe Cards
            </Link>
            <Link
              href="/receipts"
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-porch-cream border border-porch-cream-dark text-porch-brown-light hover:border-porch-brown-light/30 transition-colors"
            >
              Receipts
            </Link>
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

      {/* Ingredients List */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-zinc-400">Loading your ingredients...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
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
            ) : (
              <>
                <div className="text-4xl mb-3">🛒</div>
                <p className="text-zinc-700 text-lg font-medium">
                  No ingredients yet
                </p>
                <p className="text-zinc-500 text-sm mt-1">
                  Start by adding the things you buy to make your food
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400 px-1 mb-2">
              {filtered.length} ingredient{filtered.length !== 1 ? "s" : ""}
            </p>
            {filtered.map((ing) => (
              <Link
                key={ing.id}
                href={`/ingredients/${ing.id}`}
                className="block bg-white rounded-xl border border-zinc-200 p-4 hover:border-zinc-300 active:bg-zinc-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-zinc-900 truncate">
                      {ing.name}
                    </h3>
                    <p className="text-sm text-zinc-500 mt-0.5">
                      {ing.supplier}
                    </p>
                    {formatPackageInfo(ing) && (
                      <p className="text-sm text-zinc-400 mt-1">
                        📦 {formatPackageInfo(ing)}
                      </p>
                    )}
                    {ing.recipe_count > 0 && (
                      <p className="text-xs text-zinc-400 mt-1">
                        Used in {ing.recipe_count} recipe
                        {ing.recipe_count !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <span className="text-lg font-bold text-emerald-700">
                      {formatCostPerUnit(ing)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <div className="fixed bottom-6 right-6 z-20">
        <Link
          href="/ingredients/add"
          className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-3.5 rounded-full shadow-lg hover:bg-emerald-700 active:bg-emerald-800 transition-colors font-medium text-sm"
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
          Add Ingredient
        </Link>
      </div>
    </div>
  );
}
