"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const UNITS = [
  { value: "lb", label: "Pounds (lb)" },
  { value: "oz", label: "Ounces (oz)" },
  { value: "each", label: "Each" },
  { value: "gallon", label: "Gallons" },
  { value: "count", label: "Count" },
  { value: "bag", label: "Bags" },
  { value: "box", label: "Boxes" },
  { value: "can", label: "Cans" },
  { value: "bottle", label: "Bottles" },
];

interface Recipe {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  quantity_unit: string;
}

interface PriceHistoryEntry {
  id: string;
  package_price: number;
  package_size: number;
  package_unit: string;
  cost_per_unit: number;
  source: string;
  supplier: string | null;
  receipt_date: string | null;
  recorded_at: string;
}

export default function EditIngredientPage({
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

  const [name, setName] = useState("");
  const [supplier, setSupplier] = useState("Walmart");
  const [customSupplier, setCustomSupplier] = useState("");
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [packageSize, setPackageSize] = useState("");
  const [packageUnit, setPackageUnit] = useState("lb");
  const [packagePrice, setPackagePrice] = useState("");
  const [notes, setNotes] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);

  // Calculate cost per unit in real-time
  const size = parseFloat(packageSize);
  const price = parseFloat(packagePrice);
  const costPerUnit = size > 0 && price > 0 ? price / size : 0;

  useEffect(() => {
    Promise.all([
      fetch(`/api/ingredients/${id}`).then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      }),
      fetch(`/api/ingredients/${id}/price-history`).then((res) =>
        res.ok ? res.json() : { history: [] }
      ),
      fetch("/api/shopping-lists/suppliers").then((res) =>
        res.ok ? res.json() : []
      ),
    ])
      .then(([data, historyData, supplierData]) => {
        const ing = data.ingredient;
        setName(ing.name || "");
        setPackageSize(ing.package_size?.toString() || "");
        setPackageUnit(ing.package_unit || ing.unit || "lb");
        setPackagePrice(ing.package_price?.toString() || "");
        setNotes(ing.notes || "");
        setRecipes(data.recipes || []);
        setPriceHistory(historyData.history || []);

        // Build supplier list from DB
        const supplierNames: string[] = (supplierData as { supplier: string }[])
          .map((s) => s.supplier)
          .filter(Boolean);
        if (!supplierNames.includes("Other")) supplierNames.push("Other");
        setSuppliers(supplierNames);

        // If ingredient's supplier isn't in the list, select "Other" and show it as custom
        const ingSupplier = ing.supplier || "Walmart";
        if (supplierNames.includes(ingSupplier)) {
          setSupplier(ingSupplier);
        } else {
          setSupplier("Other");
          setCustomSupplier(ingSupplier);
        }

        setLoading(false);
      })
      .catch(() => {
        setError("Couldn't find this ingredient");
        setLoading(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please give this ingredient a name");
      return;
    }

    if (!packageSize || !packagePrice) {
      setError("Please fill in the package size and price");
      return;
    }

    setSaving(true);
    try {
      const finalSupplier = supplier === "Other" && customSupplier.trim()
        ? customSupplier.trim()
        : supplier;
      const res = await fetch(`/api/ingredients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          unit: packageUnit,
          package_size: size,
          package_unit: packageUnit,
          package_price: price,
          supplier: finalSupplier,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      router.push("/ingredients");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/ingredients/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      router.push("/ingredients");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <p className="text-zinc-400">Loading ingredient...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link
            href="/ingredients"
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
          >
            <svg
              className="w-5 h-5 text-zinc-600"
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
          <h1 className="text-lg font-bold text-zinc-900">Edit Ingredient</h1>
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="max-w-2xl mx-auto px-4 py-6 space-y-6"
      >
        {/* Recipe Usage Notice */}
        {recipes.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-800 mb-2">
              This ingredient is used in {recipes.length} recipe
              {recipes.length !== 1 ? "s" : ""}:
            </p>
            <ul className="space-y-1">
              {recipes.map((r) => (
                <li key={r.id} className="text-sm text-blue-700">
                  • {r.menu_item_name} ({r.quantity} {r.quantity_unit})
                </li>
              ))}
            </ul>
            <p className="text-xs text-blue-600 mt-2">
              If you change the price, those recipe costs will update
              automatically.
            </p>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-zinc-800 mb-1">
            What do you call this?
          </label>
          <input
            type="text"
            placeholder='e.g., "Chicken Breast" or "Ranch Dressing"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Supplier */}
        <div>
          <label className="block text-sm font-semibold text-zinc-800 mb-1">
            Where do you buy it?
          </label>
          {suppliers.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {suppliers.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSupplier(s); if (s !== "Other") setCustomSupplier(""); }}
                  className={`px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                    supplier === s
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400 py-2">Loading suppliers...</p>
          )}
          {supplier === "Other" && (
            <input
              type="text"
              placeholder="Type supplier name..."
              value={customSupplier}
              onChange={(e) => setCustomSupplier(e.target.value)}
              className="w-full mt-2 px-4 py-3 rounded-xl border border-zinc-200 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          )}
        </div>

        {/* Package Info */}
        <div>
          <label className="block text-sm font-semibold text-zinc-800 mb-1">
            How is it packaged?
          </label>
          <p className="text-xs text-zinc-500 mb-2">
            For example: a bag that has 5 pounds, or a container with 64 ounces
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount"
              value={packageSize}
              onChange={(e) => setPackageSize(e.target.value)}
              min="0"
              step="any"
              className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <select
              value={packageUnit}
              onChange={(e) => setPackageUnit(e.target.value)}
              className="px-4 py-3 rounded-xl border border-zinc-200 text-base bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-semibold text-zinc-800 mb-1">
            How much does the package cost?
          </label>
          <p className="text-xs text-zinc-500 mb-2">
            The total price you pay at the store
          </p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-base">
              $
            </span>
            <input
              type="number"
              placeholder="0.00"
              value={packagePrice}
              onChange={(e) => setPackagePrice(e.target.value)}
              min="0"
              step="0.01"
              className="w-full pl-8 pr-4 py-3 rounded-xl border border-zinc-200 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Cost Preview */}
        {costPerUnit > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm text-emerald-800">
              <span className="font-semibold">
                That means each {packageUnit} costs{" "}
                <span className="text-lg">${costPerUnit.toFixed(2)}</span>
              </span>
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              This is what we&apos;ll use to calculate your recipe costs
            </p>
          </div>
        )}

        {/* Price History */}
        {priceHistory.length > 0 && (
          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-2">
              Price History
            </label>
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              {priceHistory.map((entry, idx) => {
                const prevEntry = priceHistory[idx + 1];
                let changePct: number | null = null;
                if (prevEntry && prevEntry.package_price > 0) {
                  changePct = ((entry.package_price - prevEntry.package_price) / prevEntry.package_price) * 100;
                }
                const date = entry.receipt_date || entry.recorded_at;
                return (
                  <div
                    key={entry.id}
                    className={`px-4 py-3 flex items-center justify-between ${
                      idx < priceHistory.length - 1 ? "border-b border-zinc-100" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        ${entry.package_price?.toFixed(2)}
                        {entry.package_size && entry.package_unit && (
                          <span className="text-zinc-400 font-normal">
                            {" "}/ {entry.package_size} {entry.package_unit}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {date
                          ? new Date(date + (date.includes("T") ? "" : "T12:00:00")).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Unknown date"}
                        {entry.supplier && ` — ${entry.supplier}`}
                        {entry.source === "receipt" && " (from receipt)"}
                      </p>
                    </div>
                    {changePct !== null && (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          Math.abs(changePct) > 30
                            ? "bg-red-100 text-red-700"
                            : changePct > 0
                            ? "bg-amber-100 text-amber-700"
                            : changePct < 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {changePct > 0 ? "+" : ""}
                        {changePct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-zinc-800 mb-1">
            Any notes?{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            placeholder='e.g., "Great Value brand" or "Only available in summer"'
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-base resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold text-base hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        {/* Delete */}
        <div className="pt-4 border-t border-zinc-200">
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 transition-colors"
            >
              Delete this ingredient
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 mb-1">
                Are you sure?
              </p>
              {recipes.length > 0 ? (
                <p className="text-sm text-red-700 mb-3">
                  This ingredient is used in {recipes.length} recipe
                  {recipes.length !== 1 ? "s" : ""}. You&apos;ll need to remove
                  it from those recipes first before deleting.
                </p>
              ) : (
                <p className="text-sm text-red-700 mb-3">
                  This will permanently remove this ingredient. You can always
                  add it again later.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-medium hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                {recipes.length === 0 && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "Deleting..." : "Yes, delete it"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
