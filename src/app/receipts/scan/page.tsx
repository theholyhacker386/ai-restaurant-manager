"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ExtractedItem {
  id: string;
  raw_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ReceiptPhoto {
  file: File;
  preview: string;
}

export default function ScanReceiptPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<ReceiptPhoto[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    receipt_id: string;
    supplier: string;
    receipt_date: string;
    total: number;
    items: ExtractedItem[];
    images_processed: number;
    _rawOcrText?: string;
  } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotos((prev) => [
        ...prev,
        { file, preview: ev.target?.result as string },
      ]);
    };
    reader.readAsDataURL(file);

    setError("");
    // Reset input so same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleScan() {
    if (photos.length === 0) {
      setError("Please add at least one photo of the receipt");
      return;
    }

    setScanning(true);
    setError("");

    try {
      const formData = new FormData();
      for (const photo of photos) {
        formData.append("images", photo.file);
      }

      const res = await fetch("/api/receipts/scan", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scanning failed");
      }

      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong scanning the receipt"
      );
    } finally {
      setScanning(false);
    }
  }

  async function handleMatchAndReview() {
    if (!result) return;

    setScanning(true);
    try {
      const res = await fetch(`/api/receipts/${result.receipt_id}/match`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Matching failed");
      }

      router.push(`/receipts/${result.receipt_id}/review`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to match items"
      );
      setScanning(false);
    }
  }

  function updateItem(idx: number, field: keyof ExtractedItem, value: string) {
    if (!result) return;
    const newItems = [...result.items];
    const item = { ...newItems[idx] };

    if (field === "raw_name") {
      item.raw_name = value;
    } else if (field === "quantity") {
      const qty = parseFloat(value) || 0;
      item.quantity = qty;
      // Auto-recalculate total_price when quantity changes
      if (item.unit_price > 0) {
        item.total_price = Math.round(qty * item.unit_price * 100) / 100;
      }
    } else if (field === "unit_price") {
      const price = parseFloat(value) || 0;
      item.unit_price = price;
      item.total_price = Math.round(item.quantity * price * 100) / 100;
    } else if (field === "total_price") {
      item.total_price = parseFloat(value) || 0;
      // Recalculate unit price from total
      if (item.quantity > 0) {
        item.unit_price = Math.round((item.total_price / item.quantity) * 100) / 100;
      }
    }

    newItems[idx] = item;
    setResult({ ...result, items: newItems });
  }

  async function saveItemEdits() {
    if (!result) return;
    // Save updated items to database
    try {
      await fetch(`/api/receipts/${result.receipt_id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: result.items }),
      });
      setEditingIdx(null);
    } catch {
      // Silent fail — items are still updated in local state
      setEditingIdx(null);
    }
  }

  async function handleSaveAsCost() {
    if (!result) return;

    setScanning(true);
    setError("");

    try {
      const res = await fetch(`/api/receipts/${result.receipt_id}/save-cost`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      router.push(`/receipts/${result.receipt_id}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setScanning(false);
    }
  }

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
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Scan Receipt</h1>
            <p className="text-xs text-zinc-500">
              Take photos of your receipt — add more for long ones
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-40">
        {/* Upload Area */}
        {!result && (
          <>
            {/* Photo grid */}
            {photos.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  {photos.length} photo{photos.length !== 1 ? "s" : ""} added
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={photo.preview}
                        alt={`Receipt photo ${i + 1}`}
                        className="w-full aspect-[3/4] object-cover rounded-xl border border-zinc-200"
                      />
                      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                        {i + 1}
                      </div>
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
                      >
                        &times;
                      </button>
                    </div>
                  ))}

                  {/* Add more button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-1 text-zinc-400 hover:border-zinc-400 hover:text-zinc-500 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-[10px] font-medium">Add photo</span>
                  </button>
                </div>

                {photos.length === 1 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    Long receipt? Tap &ldquo;Add photo&rdquo; to capture more sections so nothing gets missed.
                  </p>
                )}
              </div>
            )}

            {/* Empty state — first photo */}
            {photos.length === 0 && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 rounded-2xl p-8 text-center cursor-pointer hover:border-zinc-400 active:bg-zinc-50 transition-colors"
              >
                <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                    />
                  </svg>
                </div>
                <p className="text-base font-medium text-zinc-700 mb-1">
                  Tap to take a photo or choose one
                </p>
                <p className="text-sm text-zinc-400">
                  Get close to the receipt so the numbers are clear.
                  For long receipts, add multiple photos.
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Scan button */}
            {photos.length > 0 && (
              <div className="flex gap-3">
                <button
                  onClick={() => setPhotos([])}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-600 font-medium text-sm hover:bg-zinc-50 transition-colors"
                >
                  Start Over
                </button>
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {scanning ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Reading {photos.length > 1 ? `${photos.length} photos` : "receipt"}...
                    </span>
                  ) : (
                    `Scan Receipt${photos.length > 1 ? ` (${photos.length} photos)` : ""}`
                  )}
                </button>
              </div>
            )}

            {scanning && photos.length === 0 && (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-3 border-zinc-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-zinc-500">
                  AI is reading your receipt...
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  This usually takes about 10 seconds
                </p>
              </div>
            )}
          </>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Receipt Summary */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-bold text-zinc-900 text-lg">
                    {result.supplier || "Unknown Store"}
                  </h2>
                  <p className="text-sm text-zinc-500">
                    {result.receipt_date || "Date not detected"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-zinc-900">
                    ${result.total?.toFixed(2) || "0.00"}
                  </p>
                  <p className="text-xs text-zinc-400">total</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
                Found {result.items.length} items
                {result.images_processed > 1 && ` across ${result.images_processed} photos`}
              </div>
            </div>

            {/* Items List — tap to edit */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-700">
                  Items Found
                </h3>
                <p className="text-[10px] text-zinc-400">Tap any item to edit</p>
              </div>
              <div className="space-y-2">
                {result.items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className={`bg-white rounded-xl border px-4 py-3 transition-colors ${
                      editingIdx === idx ? "border-emerald-300 ring-1 ring-emerald-200" : "border-zinc-200"
                    }`}
                    onClick={() => { if (editingIdx !== idx) setEditingIdx(idx); }}
                  >
                    {editingIdx === idx ? (
                      /* Editing mode */
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={item.raw_name}
                          onChange={(e) => updateItem(idx, "raw_name", e.target.value)}
                          className="w-full text-sm font-medium text-zinc-900 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-zinc-500 uppercase">Qty</label>
                            <input
                              type="number"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                              className="w-full text-sm text-zinc-900 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-500 uppercase">Unit Price</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                              className="w-full text-sm text-zinc-900 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-500 uppercase">Total</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.total_price}
                              onChange={(e) => updateItem(idx, "total_price", e.target.value)}
                              className="w-full text-sm font-bold text-zinc-900 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            />
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveItemEdits(); }}
                          className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      /* Display mode */
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            {item.raw_name}
                          </p>
                          {item.quantity > 1 && (
                            <p className="text-xs text-zinc-400">
                              Qty: {item.quantity} × $
                              {item.unit_price?.toFixed(2)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <p className="text-sm font-bold text-zinc-900">
                            ${item.total_price?.toFixed(2)}
                          </p>
                          <svg className="w-3.5 h-3.5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* What do you want to do? */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                What do you want to do with this receipt?
              </p>

              {/* Option 1: Regular supplier purchase */}
              <button
                onClick={handleMatchAndReview}
                disabled={scanning}
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
                      Match items to ingredients and update prices if they changed
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 2: One-off / non-regular purchase */}
              <button
                onClick={handleSaveAsCost}
                disabled={scanning}
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
                      Not our regular supplier — just record as a food expense, don&apos;t update ingredient prices
                    </p>
                  </div>
                </div>
              </button>

              {/* Scan again */}
              <button
                onClick={() => {
                  setResult(null);
                  setPhotos([]);
                }}
                className="w-full py-2.5 text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                Scan a different receipt
              </button>
            </div>

            {scanning && (
              <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
                <span className="w-4 h-4 border-2 border-zinc-200 border-t-emerald-600 rounded-full animate-spin" />
                Working...
              </div>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
