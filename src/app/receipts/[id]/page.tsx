"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ReceiptItem {
  id: string;
  raw_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  ingredient_id: string | null;
  ingredient_name: string | null;
  match_status: string;
  match_confidence: number;
  item_size: number | null;
  item_size_unit: string | null;
}

interface Receipt {
  id: string;
  supplier: string;
  receipt_date: string;
  subtotal: number;
  tax: number;
  total: number;
  image_path: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export default function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/receipts/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        setReceipt(data.receipt);
        setItems(data.items);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/receipts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/receipts");
    } catch {
      setDeleting(false);
    }
  }

  async function handleMatchAndReview() {
    setSaving(true);
    try {
      const res = await fetch(`/api/receipts/${id}/match`, { method: "POST" });
      if (!res.ok) throw new Error("Matching failed");
      router.push(`/receipts/${id}/review`);
    } catch {
      setSaving(false);
    }
  }

  async function handleSaveAsCost() {
    setSaving(true);
    try {
      const res = await fetch(`/api/receipts/${id}/save-cost`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to save");
      router.refresh();
      setSaving(false);
      // Reload to show updated status
      window.location.reload();
    } catch {
      setSaving(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "confirmed":
        return (
          <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-100 text-emerald-700">
            Confirmed
          </span>
        );
      case "matched":
        return (
          <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-amber-100 text-amber-700">
            Needs Review
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-zinc-100 text-zinc-600">
            Pending
          </span>
        );
    }
  }

  function getMatchBadge(item: ReceiptItem) {
    switch (item.match_status) {
      case "auto_matched":
      case "manual_matched":
        return (
          <span className="text-xs text-emerald-600 font-medium">
            → {item.ingredient_name}
          </span>
        );
      case "one_off":
        return (
          <span className="text-xs text-amber-600 font-medium">Cost tracked</span>
        );
      case "skipped":
        return (
          <span className="text-xs text-zinc-400">Skipped</span>
        );
      default:
        return (
          <span className="text-xs text-zinc-400">Unmatched</span>
        );
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <p className="text-zinc-400">Loading receipt...</p>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500 text-lg mb-2">Receipt not found</p>
          <Link
            href="/receipts"
            className="text-emerald-600 text-sm font-medium"
          >
            Back to receipts
          </Link>
        </div>
      </div>
    );
  }

  const matchedItems = items.filter(
    (i) =>
      i.match_status === "auto_matched" || i.match_status === "manual_matched"
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link
            href="/receipts"
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
          <div className="flex-1">
            <h1 className="text-lg font-bold text-zinc-900">
              Receipt Details
            </h1>
          </div>
          {getStatusBadge(receipt.status)}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-24">
        {/* Receipt Summary Card */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-bold text-zinc-900 text-xl">
                {receipt.supplier || "Unknown Store"}
              </h2>
              <p className="text-sm text-zinc-500">
                {receipt.receipt_date
                  ? new Date(receipt.receipt_date + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "Date unknown"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="text-center bg-zinc-50 rounded-xl py-3">
              <p className="text-lg font-bold text-zinc-900">
                ${receipt.subtotal?.toFixed(2) || "0.00"}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase">Subtotal</p>
            </div>
            <div className="text-center bg-zinc-50 rounded-xl py-3">
              <p className="text-lg font-bold text-zinc-900">
                ${receipt.tax?.toFixed(2) || "0.00"}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase">Tax</p>
            </div>
            <div className="text-center bg-emerald-50 rounded-xl py-3">
              <p className="text-lg font-bold text-emerald-700">
                ${receipt.total?.toFixed(2) || "0.00"}
              </p>
              <p className="text-[10px] text-emerald-600 uppercase">Total</p>
            </div>
          </div>

          {/* Receipt Image */}
          <div className="mt-4">
            <img
              src={`/api/receipts/image?id=${id}`}
              alt="Receipt photo"
              className="w-full max-h-64 object-contain rounded-xl bg-zinc-100 cursor-pointer"
              onClick={(e) => {
                const img = e.currentTarget;
                if (img.classList.contains("max-h-64")) {
                  img.classList.remove("max-h-64");
                  img.classList.add("max-h-none");
                } else {
                  img.classList.remove("max-h-none");
                  img.classList.add("max-h-64");
                }
              }}
            />
            <p className="text-[10px] text-zinc-400 text-center mt-1">Tap image to expand</p>
          </div>
        </div>

        {/* Action buttons for unconfirmed receipts */}
        {receipt.status !== "confirmed" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              What do you want to do with this receipt?
            </p>

            {/* Review & match ingredients */}
            {receipt.status === "matched" ? (
              <Link
                href={`/receipts/${id}/review`}
                className="block w-full text-left bg-white border border-zinc-200 rounded-2xl p-4 hover:border-emerald-300 hover:bg-emerald-50/30 active:bg-emerald-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900 text-sm">Review & Match Ingredients</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Match items to your ingredients and update prices if they changed
                    </p>
                  </div>
                </div>
              </Link>
            ) : (
              <button
                onClick={handleMatchAndReview}
                disabled={saving}
                className="w-full text-left bg-white border border-zinc-200 rounded-2xl p-4 hover:border-emerald-300 hover:bg-emerald-50/30 active:bg-emerald-50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900 text-sm">Regular Supplier Purchase</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Match items to your ingredients and update prices if they changed
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* Just track the cost */}
            <button
              onClick={handleSaveAsCost}
              disabled={saving}
              className="w-full text-left bg-white border border-zinc-200 rounded-2xl p-4 hover:border-amber-300 hover:bg-amber-50/30 active:bg-amber-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-zinc-900 text-sm">Just Track the Cost</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Not a regular supplier — just record as a food expense, don&apos;t update ingredient prices
                  </p>
                </div>
              </div>
            </button>

            {saving && (
              <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
                <span className="w-4 h-4 border-2 border-zinc-200 border-t-emerald-600 rounded-full animate-spin" />
                Working...
              </div>
            )}
          </div>
        )}

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-700">
              Line Items
            </h3>
            <span className="text-xs text-zinc-400">
              {matchedItems.length}/{items.length} matched
            </span>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-zinc-200 px-4 py-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {item.raw_name}
                    </p>
                    {item.item_size && item.item_size_unit && (
                      <p className="text-[11px] text-indigo-600 font-medium">
                        {item.item_size} {item.item_size_unit}
                      </p>
                    )}
                    {getMatchBadge(item)}
                  </div>
                  <p className="text-sm font-bold text-zinc-900 ml-3">
                    ${item.total_price?.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Delete Section */}
        <div className="pt-4 border-t border-zinc-200">
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 transition-colors"
            >
              Delete this receipt
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 mb-1">
                Are you sure?
              </p>
              <p className="text-sm text-red-700 mb-3">
                This will delete the receipt and its photo. Price history records will stay.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting..." : "Yes, delete it"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
