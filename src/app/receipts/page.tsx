"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Receipt {
  id: string;
  supplier: string;
  receipt_date: string;
  total: number;
  status: string;
  item_count: number;
  matched_count: number;
  image_path: string | null;
  item_names: string | null;
  created_at: string;
}

interface PriceAlert {
  raw_name: string;
  ingredient_name: string;
  old_price: number;
  new_price: number;
  receipt_id: string;
  receipt_date: string;
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handleDelete(receiptId: string) {
    setDeleting(receiptId);
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, { method: "DELETE" });
      if (res.ok) {
        setReceipts((prev) => prev.filter((r) => r.id !== receiptId));
      }
    } catch {
      // silent fail
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  useEffect(() => {
    fetch("/api/receipts")
      .then((res) => res.json())
      .then((data) => {
        setReceipts(data.receipts || []);
        setPriceAlerts(data.priceAlerts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = receipts.filter(
    (r) => {
      const q = search.toLowerCase();
      return (
        (r.supplier || "").toLowerCase().includes(q) ||
        (r.receipt_date || "").includes(search) ||
        (r.item_names || "").toLowerCase().includes(q)
      );
    }
  );

  function getStatusBadge(status: string) {
    switch (status) {
      case "confirmed":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
            Confirmed
          </span>
        );
      case "matched":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
            Needs Review
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-600">
            Pending
          </span>
        );
    }
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "Unknown date";
    const date = new Date(dateStr + "T12:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Receipts</h1>
              <p className="text-sm text-zinc-500">
                Your shopping trips and price tracking
              </p>
            </div>
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              Home
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
              placeholder="Search by store, item, or date..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-zinc-400">Loading receipts...</div>
          </div>
        ) : (
          <>
            {/* Price Alerts */}
            {priceAlerts.length > 0 && (
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Price Alerts
                </h2>
                <div className="space-y-2">
                  {priceAlerts.map((alert, idx) => {
                    const changePct =
                      alert.old_price > 0
                        ? (
                            ((alert.new_price - alert.old_price) /
                              alert.old_price) *
                            100
                          ).toFixed(0)
                        : "?";
                    return (
                      <Link
                        key={idx}
                        href={`/receipts/${alert.receipt_id}`}
                        className="block bg-red-50 border border-red-200 rounded-xl p-3"
                      >
                        <p className="text-sm font-medium text-red-800">
                          {alert.ingredient_name}
                        </p>
                        <p className="text-xs text-red-600">
                          ${alert.old_price?.toFixed(2)} → $
                          {alert.new_price?.toFixed(2)} (+{changePct}%)
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Receipt List */}
            {filtered.length === 0 ? (
              <div className="text-center py-20">
                {search ? (
                  <>
                    <p className="text-zinc-500 text-lg">
                      No receipts match &ldquo;{search}&rdquo;
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
                    <div className="text-4xl mb-3">🧾</div>
                    <p className="text-zinc-700 text-lg font-medium">
                      No receipts yet
                    </p>
                    <p className="text-zinc-500 text-sm mt-1">
                      Scan your first receipt to start tracking prices
                    </p>
                    <Link
                      href="/receipts/scan"
                      className="inline-block mt-4 px-6 py-2.5 rounded-full bg-emerald-600 text-white text-sm font-medium"
                    >
                      Scan Receipt
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400 px-1 mb-2">
                  {filtered.length} receipt{filtered.length !== 1 ? "s" : ""}
                </p>
                {filtered.map((r) => (
                  <div key={r.id} className="relative">
                    {/* Delete confirmation overlay */}
                    {confirmDelete === r.id && (
                      <div className="absolute inset-0 z-10 bg-red-50 border border-red-300 rounded-xl flex items-center justify-center gap-3 px-4">
                        <p className="text-sm text-red-800 font-medium">Delete this receipt?</p>
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deleting === r.id}
                          className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                        >
                          {deleting === r.id ? "Deleting..." : "Yes, Delete"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-4 py-1.5 bg-white border border-zinc-200 text-xs text-zinc-600 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    <div className="flex items-stretch gap-0">
                      <Link
                        href={
                          r.status === "matched"
                            ? `/receipts/${r.id}/review`
                            : `/receipts/${r.id}`
                        }
                        className="flex-1 bg-white rounded-l-xl border border-r-0 border-zinc-200 p-4 hover:border-zinc-300 active:bg-zinc-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-zinc-900 truncate">
                                {r.supplier || "Unknown Store"}
                              </h3>
                              {getStatusBadge(r.status)}
                            </div>
                            <p className="text-sm text-zinc-500">
                              {formatDate(r.receipt_date)}
                            </p>
                            <p className="text-xs text-zinc-400 mt-1">
                              {r.item_count} items — {r.matched_count} matched
                            </p>
                          </div>
                          <div className="text-right ml-3">
                            <p className="text-lg font-bold text-zinc-900">
                              ${r.total?.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </Link>
                      <button
                        onClick={() => setConfirmDelete(r.id)}
                        className="flex items-center justify-center w-12 bg-white border border-zinc-200 rounded-r-xl hover:bg-red-50 hover:border-red-200 transition-colors group"
                      >
                        <svg className="w-4 h-4 text-zinc-300 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Scan Button — left side, above the bottom nav */}
      <div className="fixed bottom-24 left-6 z-20">
        <Link
          href="/receipts/scan"
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
              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
            />
          </svg>
          Scan Receipt
        </Link>
      </div>
    </div>
  );
}
