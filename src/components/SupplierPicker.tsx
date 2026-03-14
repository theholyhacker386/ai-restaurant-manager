"use client";

import { useState, useEffect, useRef } from "react";

/* ── Types ─────────────────────────────────────────── */

interface SupplierPickerProps {
  onConfirm: (selected: string[]) => void;
  detectedSuppliers?: string[];
  userId?: string;
}

interface DirectorySupplier {
  id: number;
  name: string;
  website_url: string | null;
  auto_fetchable: boolean;
  usage_count: number;
}

/* ── Popular Suppliers (fallback when no bank data) ── */

const POPULAR_SUPPLIERS = [
  { name: "Walmart", emoji: "\uD83C\uDFEC" },
  { name: "Sam's Club", emoji: "\uD83D\uDED2" },
  { name: "Costco", emoji: "\uD83D\uDCE6" },
  { name: "Restaurant Depot", emoji: "\uD83C\uDF7D\uFE0F" },
  { name: "Sysco", emoji: "\uD83D\uDE9B" },
  { name: "US Foods", emoji: "\uD83C\uDDFA\uD83C\uDDF8" },
  { name: "Gordon Food Service", emoji: "\uD83C\uDFED" },
  { name: "Chef's Warehouse", emoji: "\uD83D\uDC68\u200D\uD83C\uDF73" },
];

/* ── Component ─────────────────────────────────────── */

const NON_SUPPLIER_KEYWORDS = [
  "square", "stripe", "paypal", "venmo", "zelle",
  "irs", "internal revenue", "fla dept revenue", "dept of revenue",
  "insurance", "geico", "progressive", "state farm", "american home shield",
  "at&t", "verizon", "t-mobile", "spectrum", "comcast", "fpl", "duke energy", "utilities",
  "netflix", "spotify", "hulu", "disney", "apple", "google", "amazon prime video", "adobe",
  "facebook", "meta", "instagram",
  "rent", "mortgage", "lease", "pennymac",
  "bank", "chase", "wells fargo", "capital one",
  "seaworld", "universal",
  "adt", "simplisafe",
  "car wash", "auto parts", "o'reilly",
  "kia motors", "mitsubishi", "daytona",
  "openai", "godaddy", "airbnb", "airdna",
  "minutekey", "racetrac", "sunoco", "arco", "marathon", "buc-ee",
];

function extractSuppliersFromBankData(txns: { amount: number; merchant_name?: string; name?: string }[]): string[] {
  const merchantCounts: Record<string, number> = {};
  for (const txn of txns) {
    if (txn.amount <= 0) continue; // Only charges (positive in Plaid = money out)
    const name = txn.merchant_name || txn.name || "";
    if (!name || name.length < 2) continue;
    merchantCounts[name] = (merchantCounts[name] || 0) + 1;
  }

  return Object.entries(merchantCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .filter(name => {
      const lower = name.toLowerCase();
      return !NON_SUPPLIER_KEYWORDS.some(kw => lower.includes(kw));
    })
    .slice(0, 25);
}

export default function SupplierPicker({ onConfirm, detectedSuppliers, userId }: SupplierPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customSuppliers, setCustomSuppliers] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<DirectorySupplier[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [autoDetected, setAutoDetected] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-detect suppliers from bank data if none were passed in
  useEffect(() => {
    if (detectedSuppliers && detectedSuppliers.length > 0) return;
    setDetecting(true);
    fetch(`/api/plaid/accounts${userId ? `?userId=${userId}` : ""}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.transactions?.length > 0) {
          const found = extractSuppliersFromBankData(data.transactions);
          if (found.length > 0) setAutoDetected(found);
        }
      })
      .catch(() => {})
      .finally(() => setDetecting(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allDetected = detectedSuppliers && detectedSuppliers.length > 0 ? detectedSuppliers : autoDetected;
  const hasDetected = allDetected.length > 0;

  // Fetch autocomplete suggestions from the shared directory
  useEffect(() => {
    if (searchInput.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/supplier-directory?q=${encodeURIComponent(searchInput)}`);
        if (res.ok) {
          const data = await res.json();
          const allSelected = new Set([
            ...Array.from(selected),
            ...customSuppliers.map((s) => s.toLowerCase()),
          ]);
          const filtered = (data.suppliers || []).filter(
            (s: DirectorySupplier) => !allSelected.has(s.name.toLowerCase())
          );
          setSuggestions(filtered);
          setShowSuggestions(filtered.length > 0);
        }
      } catch {
        // ignore search errors
      }
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchInput, selected, customSuppliers]);

  function toggleSupplier(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addCustom(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const lowerName = trimmed.toLowerCase();
    if (
      customSuppliers.some((s) => s.toLowerCase() === lowerName) ||
      selected.has(trimmed)
    ) {
      return;
    }

    // Check if it matches any existing supplier in the list
    const allNames = hasDetected ? allDetected : POPULAR_SUPPLIERS.map(s => s.name);
    const match = allNames.find((s) => s.toLowerCase() === lowerName);
    if (match) {
      setSelected((prev) => new Set([...prev, match]));
    } else {
      setCustomSuppliers((prev) => [...prev, trimmed]);
    }

    setSearchInput("");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function removeCustom(name: string) {
    setCustomSuppliers((prev) => prev.filter((s) => s !== name));
  }

  async function handleConfirm() {
    const all = [...Array.from(selected), ...customSuppliers];
    if (all.length === 0) return;

    setConfirmed(true);

    // Save suppliers to the directory for future users
    for (const name of all) {
      try {
        await fetch("/api/supplier-directory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      } catch {
        // non-critical
      }
    }

    onConfirm(all);
  }

  if (confirmed) {
    const all = [...Array.from(selected), ...customSuppliers];
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 my-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-green-600 text-lg">{"\u2713"}</span>
          <span className="text-sm font-medium text-green-800">
            {all.length} supplier{all.length !== 1 ? "s" : ""} selected
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {all.map((name) => (
            <span
              key={name}
              className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const totalSelected = selected.size + customSuppliers.length;

  return (
    <div className="bg-white border border-porch-cream-dark rounded-xl p-4 my-2 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{hasDetected ? "\uD83C\uDFE6" : "\uD83D\uDED2"}</span>
        <span className="text-sm font-semibold text-porch-brown">
          {hasDetected ? "Suppliers found from your bank" : "Where do you buy supplies?"}
        </span>
      </div>
      {hasDetected && (
        <p className="text-xs text-porch-brown-light mb-3 ml-8">
          Check the ones that are food or paper suppliers. Add any we missed at the bottom.
        </p>
      )}

      {/* Loading state */}
      {detecting && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-porch-teal" />
          <span className="text-xs text-porch-brown-light">Checking your bank for suppliers...</span>
        </div>
      )}

      {/* Supplier list */}
      {!detecting && hasDetected ? (
        /* Detected suppliers — vertical checkbox list */
        <div className="space-y-1.5 mb-3 max-h-72 overflow-y-auto">
          {allDetected.map((name) => {
            const isSelected = selected.has(name);
            return (
              <button
                key={name}
                onClick={() => toggleSupplier(name)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                  isSelected
                    ? "border-porch-teal bg-porch-teal/10"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected
                    ? "border-porch-teal bg-porch-teal"
                    : "border-gray-300"
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`flex-1 ${isSelected ? "text-porch-teal font-medium" : "text-porch-brown"}`}>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
      ) : !detecting ? (
        /* Fallback: Popular supplier grid */
        <div className="grid grid-cols-2 gap-2 mb-3">
          {POPULAR_SUPPLIERS.map((supplier) => {
            const isSelected = selected.has(supplier.name);
            return (
              <button
                key={supplier.name}
                onClick={() => toggleSupplier(supplier.name)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                  isSelected
                    ? "border-porch-teal bg-porch-teal/10 text-porch-teal font-medium"
                    : "border-porch-cream-dark hover:border-porch-teal/50 text-porch-brown"
                }`}
              >
                <span className="text-base">{supplier.emoji}</span>
                <span className="flex-1 truncate">{supplier.name}</span>
                {isSelected && (
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Custom suppliers chips */}
      {customSuppliers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {customSuppliers.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 text-xs bg-porch-teal/10 text-porch-teal px-2.5 py-1 rounded-full"
            >
              {name}
              <button
                onClick={() => removeCustom(name)}
                className="hover:text-red-500 ml-0.5"
              >
                {"\u00D7"}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add another input */}
      <div className="relative mb-3">
        <input
          ref={inputRef}
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchInput.trim()) {
              e.preventDefault();
              addCustom(searchInput);
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          placeholder={hasDetected ? "Add a supplier we missed..." : "Add another supplier..."}
          className="w-full px-3 py-2 text-sm border border-porch-cream-dark rounded-lg focus:outline-none focus:border-porch-teal focus:ring-1 focus:ring-porch-teal bg-porch-warm-white"
        />

        {/* Autocomplete dropdown */}
        {showSuggestions && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowSuggestions(false)}
            />
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-porch-cream-dark rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => addCustom(s.name)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-porch-cream flex items-center justify-between"
                >
                  <span className="text-porch-brown">{s.name}</span>
                  <span className="text-xs text-porch-brown-light">
                    {s.usage_count} restaurant{s.usage_count !== 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={totalSelected === 0}
        className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
          totalSelected > 0
            ? "bg-porch-teal text-white hover:bg-porch-teal-light"
            : "bg-porch-cream text-porch-brown-light cursor-not-allowed"
        }`}
      >
        {totalSelected > 0
          ? `Confirm ${totalSelected} Supplier${totalSelected !== 1 ? "s" : ""}`
          : "Select at least one supplier"}
      </button>
    </div>
  );
}
