"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
}

export default function AddMenuItemPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [notes, setNotes] = useState("");

  // New category inline creation
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []))
      .catch(() => {});
  }, []);

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create category");
      const data = await res.json();
      setCategories((prev) => [...prev, { id: data.id, name: data.name }]);
      setCategoryId(data.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch {
      setError("Couldn't create the category. Please try again.");
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
      const res = await fetch("/api/menu-items", {
        method: "POST",
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

  return (
    <div className="space-y-4">
      {/* Page Header */}
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
        <h2 className="text-xl font-bold text-foreground">Add Menu Item</h2>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            What&apos;s this item called?
          </label>
          <input
            type="text"
            placeholder='e.g., "Chicken Salad Sandwich"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-base focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
            autoFocus
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            Category
          </label>
          <p className="text-xs text-porch-brown-light/60 mb-2">
            Group similar items together (like Sandwiches, Drinks, etc.)
          </p>

          {!showNewCategory ? (
            <div className="space-y-2">
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
                <option value="">Choose a category...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
                <option value="__new__">+ Create new category</option>
              </select>
            </div>
          ) : (
            <div className="bg-porch-cream/40 border border-porch-cream-dark rounded-xl p-3 space-y-2">
              <input
                type="text"
                placeholder='e.g., "Smoothies" or "Kids Menu"'
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
            How much do you sell it for?
          </label>
          <p className="text-xs text-porch-brown-light/60 mb-2">
            The price your customers pay
          </p>
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
            Any notes?{" "}
            <span className="font-normal text-porch-brown-light/50">
              (optional)
            </span>
          </label>
          <textarea
            placeholder='e.g., "Customer favorite" or "Seasonal item"'
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

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-porch-teal text-white font-semibold text-base hover:bg-porch-teal-light active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? "Saving..." : "Save Menu Item"}
        </button>

        {/* Tip */}
        <p className="text-xs text-porch-brown-light/50 text-center">
          After saving, you can add the recipe to see your food cost
        </p>
      </form>
    </div>
  );
}
