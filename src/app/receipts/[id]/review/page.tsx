"use client";

import { useEffect, useState, use, useRef } from "react";
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
  match_confidence: number;
  match_status: string;
  current_package_price: number | null;
  current_package_size: number | null;
  current_package_unit: string | null;
  current_cost_per_unit: number | null;
  item_size: number | null;
  item_size_unit: string | null;
}

interface Ingredient {
  id: string;
  name: string;
}

type ItemAction = "update" | "one_off" | "skip";

export default function ReviewReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  // Track user selections: item_id → { ingredient_id, action, units_per_pack }
  const [selections, setSelections] = useState<
    Record<string, { ingredient_id: string | null; action: ItemAction; units_per_pack?: number }>
  >({});

  // Track which item has the dropdown open
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // "Add New Ingredient" inline form
  const [addingNewFor, setAddingNewFor] = useState<string | null>(null);
  const [newIngName, setNewIngName] = useState("");
  const [newIngUnit, setNewIngUnit] = useState("each");
  const [newIngPackSize, setNewIngPackSize] = useState("");
  const [newIngPackUnit, setNewIngPackUnit] = useState("");
  const [savingNewIng, setSavingNewIng] = useState(false);

  // Smart notes per item (free-text descriptions like "2 loaves per pack")
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});

  // Track which items are "done" (user made a choice)
  const [doneItems, setDoneItems] = useState<Set<string>>(new Set());

  // Refs for scrolling to next item
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    async function load() {
      try {
        const [receiptRes, ingredientsRes] = await Promise.all([
          fetch(`/api/receipts/${id}`),
          fetch("/api/ingredients"),
        ]);

        if (!receiptRes.ok) throw new Error("Receipt not found");

        let receiptData = await receiptRes.json();
        const ingredientData = await ingredientsRes.json();

        setReceipt(receiptData.receipt);
        setIngredients(ingredientData.ingredients || []);

        // Check if there are unmatched items that could benefit from re-matching
        const hasUnmatched = receiptData.items.some(
          (item: ReceiptItem) =>
            !item.ingredient_id ||
            item.match_status === "unmatched" ||
            !item.match_status
        );

        // If there are unmatched items, re-run matching (picks up improved matching logic)
        if (hasUnmatched) {
          const rematchRes = await fetch(
            `/api/receipts/${id}/match?unmatched_only=true`,
            { method: "POST" }
          );
          if (rematchRes.ok) {
            // Reload the receipt data with updated matches
            const freshRes = await fetch(`/api/receipts/${id}`);
            if (freshRes.ok) {
              receiptData = await freshRes.json();
            }
          }
        }

        setItems(receiptData.items);

        // Pre-fill selections from AI matches + auto-detect pack sizes
        const initial: Record<
          string,
          { ingredient_id: string | null; action: ItemAction; units_per_pack?: number }
        > = {};
        const initialDone = new Set<string>();
        for (const item of receiptData.items) {
          // Auto-detect pack size from product description (e.g. "6/Case")
          const detectedPack = detectPackSize(item.raw_name);

          if (
            item.ingredient_id &&
            (item.match_status === "auto_matched" ||
              item.match_status === "manual_matched")
          ) {
            initial[item.id] = {
              ingredient_id: item.ingredient_id,
              action: "update",
              ...(detectedPack && detectedPack > 1 ? { units_per_pack: detectedPack } : {}),
            };
            initialDone.add(item.id);
          } else {
            initial[item.id] = {
              ingredient_id: null,
              action: "skip",
              ...(detectedPack && detectedPack > 1 ? { units_per_pack: detectedPack } : {}),
            };
          }
        }
        setSelections(initial);
        setDoneItems(initialDone);
        setLoading(false);
      } catch {
        setError("Couldn't load this receipt");
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function getPriceChange(item: ReceiptItem) {
    if (!item.current_package_price || !item.total_price) return null;
    const sel = selections[item.id];
    const qty = item.quantity || 1;
    const unitsPerPack = sel?.units_per_pack || 1;
    const totalUnits = qty * unitsPerPack;
    const oldPrice = item.current_package_price;
    // Always divide total_price by totalUnits to get per-package price
    const newPrice = totalUnits > 0 ? item.total_price / totalUnits : item.total_price;
    const changePct = ((newPrice - oldPrice) / oldPrice) * 100;
    return {
      oldPrice,
      newPrice,
      changePct: Math.round(changePct * 10) / 10,
      isIncrease: changePct > 0,
      isBigJump: Math.abs(changePct) > 30,
    };
  }

  function scrollToNextUnfinished(currentItemId: string) {
    const currentIdx = items.findIndex((i) => i.id === currentItemId);
    for (let i = currentIdx + 1; i < items.length; i++) {
      if (!doneItems.has(items[i].id)) {
        const el = itemRefs.current[items[i].id];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
    }
  }

  /**
   * Auto-detect pack/case size from the raw product name.
   * "Ghirardelli Caramel Sauce 64 fl. oz. - 6/Case" → 6
   * "Noble Gloves - Large - 1,000/Case" → 1000
   * "12-pack Soda" → 12
   */
  function detectPackSize(rawName: string): number | null {
    const lower = rawName.toLowerCase();
    // "6/Case" or "6 / Case" or "1,000/Case"
    const caseMatch = rawName.match(/(\d[\d,]*)\s*\/\s*case/i);
    if (caseMatch) return parseInt(caseMatch[1].replace(/,/g, ""));
    // "Case of 6"
    const caseOfMatch = lower.match(/case\s+of\s+(\d+)/);
    if (caseOfMatch) return parseInt(caseOfMatch[1]);
    // "6-pack" or "6 pack" or "12pk"
    const packMatch = lower.match(/(\d+)\s*[-]?\s*(?:pack|pk)\b/);
    if (packMatch) return parseInt(packMatch[1]);
    // "6 per case" or "6 per box"
    const perMatch = lower.match(/(\d+)\s*per\s*(?:case|box|carton)/);
    if (perMatch) return parseInt(perMatch[1]);
    return null;
  }

  // Track AI parsing state per item
  const [aiParsing, setAiParsing] = useState<Record<string, boolean>>({});
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Quick local parser for obvious patterns (instant, no AI needed)
  function quickParse(text: string): number | null {
    const lower = text.toLowerCase().trim();
    if (!lower) return null;
    // "2-pack" / "2 pack" / "2pk"
    const packMatch = lower.match(/(\d+)\s*[-]?\s*(?:pack|pk|ct|count)/);
    if (packMatch) return parseInt(packMatch[1]);
    // "2 per pack"
    const perPackMatch = lower.match(/(\d+)\s*\w*\s*per\s*(?:pack|bag|box|case|bundle|package)/);
    if (perPackMatch) return parseInt(perPackMatch[1]);
    // Just a bare number like "2"
    const bareNum = lower.match(/^(\d+)$/);
    if (bareNum) return parseInt(bareNum[1]);
    // "twin pack" / "triple pack"
    if (/twin\s*pack/.test(lower)) return 2;
    if (/triple\s*pack/.test(lower)) return 3;
    return null;
  }

  // Ask the AI brain to interpret the note
  async function askAiToParseNote(itemId: string, text: string, item: ReceiptItem) {
    setAiParsing((prev) => ({ ...prev, [itemId]: true }));
    try {
      const res = await fetch("/api/receipts/parse-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: text,
          raw_name: item.raw_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        }),
      });
      const data = await res.json();
      if (data.units_per_pack && data.units_per_pack > 0) {
        setSelections((prev) => ({
          ...prev,
          [itemId]: {
            ingredient_id: prev[itemId]?.ingredient_id || null,
            action: prev[itemId]?.action || "update",
            units_per_pack: data.units_per_pack,
          },
        }));
      }
      if (data.explanation) {
        setAiExplanations((prev) => ({ ...prev, [itemId]: data.explanation }));
      }
    } catch {
      // Silent fail — the user can still manually proceed
    } finally {
      setAiParsing((prev) => ({ ...prev, [itemId]: false }));
    }
  }

  // Handle smart note changes — try quick parse first, fall back to AI
  function handleSmartNote(itemId: string, text: string, item: ReceiptItem) {
    setItemNotes((prev) => ({ ...prev, [itemId]: text }));
    setAiExplanations((prev) => ({ ...prev, [itemId]: "" }));

    // Try quick local parse first (instant)
    const quick = quickParse(text);
    if (quick && quick > 0) {
      setSelections((prev) => ({
        ...prev,
        [itemId]: {
          ingredient_id: prev[itemId]?.ingredient_id || null,
          action: prev[itemId]?.action || "update",
          units_per_pack: quick,
        },
      }));
      return; // No need for AI
    }

    // Clear units if text is empty
    if (!text.trim()) {
      setSelections((prev) => ({
        ...prev,
        [itemId]: {
          ingredient_id: prev[itemId]?.ingredient_id || null,
          action: prev[itemId]?.action || "update",
          units_per_pack: undefined,
        },
      }));
      return;
    }

    // Debounce the AI call — wait 800ms after user stops typing
    if (debounceTimers.current[itemId]) {
      clearTimeout(debounceTimers.current[itemId]);
    }
    debounceTimers.current[itemId] = setTimeout(() => {
      askAiToParseNote(itemId, text, item);
    }, 800);
  }

  function selectIngredient(itemId: string, ingredientId: string) {
    setSelections((prev) => ({
      ...prev,
      [itemId]: { ingredient_id: ingredientId, action: "update" },
    }));
    setOpenDropdown(null);
    setSearchTerm("");
    // Mark as done and scroll to next
    setDoneItems((prev) => new Set([...prev, itemId]));
    setTimeout(() => scrollToNextUnfinished(itemId), 200);
  }

  function setAction(itemId: string, action: ItemAction) {
    setSelections((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], action },
    }));
    // Mark as done and scroll to next
    setDoneItems((prev) => new Set([...prev, itemId]));
    setTimeout(() => scrollToNextUnfinished(itemId), 200);
  }

  // Fuzzy search: match search term against ingredient names loosely
  function fuzzyFilterIngredients(term: string): Ingredient[] {
    if (!term || !ingredients) return ingredients || [];
    const words = term.toLowerCase().replace(/[^a-zA-Z\s'-]/g, "").split(/\s+/).filter((w) => w.length > 1);
    if (words.length === 0) return ingredients || [];

    // First try: all words match
    const allMatch = (ingredients || []).filter((ing) => {
      const ingLower = ing.name.toLowerCase();
      return words.every((word) => ingLower.includes(word));
    });

    // If nothing found with all words, try any word matching
    const results = allMatch.length > 0 ? allMatch : (ingredients || []).filter((ing) => {
      const ingLower = ing.name.toLowerCase();
      return words.some((word) => ingLower.includes(word));
    });

    return results.sort((a, b) => {
      const termLower = term.toLowerCase();
      const aStarts = a.name.toLowerCase().startsWith(termLower) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(termLower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      // More matching words = higher priority
      const aMatches = words.filter((w) => a.name.toLowerCase().includes(w)).length;
      const bMatches = words.filter((w) => b.name.toLowerCase().includes(w)).length;
      return bMatches - aMatches;
    });
  }

  // Add new ingredient inline
  async function handleAddNewIngredient(forItemId: string, receiptItem: ReceiptItem) {
    if (!newIngName.trim()) return;
    setSavingNewIng(true);

    try {
      const res = await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newIngName.trim(),
          unit: newIngUnit,
          package_size: newIngPackSize ? parseFloat(newIngPackSize) : 1,
          package_unit: newIngPackUnit || newIngUnit,
          package_price: receiptItem.total_price,
          supplier: (receipt as Record<string, unknown>)?.supplier || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add ingredient");
      }

      const data = await res.json();
      const newIng: Ingredient = { id: data.ingredient.id, name: data.ingredient.name };

      // Add to local ingredient list and select it
      setIngredients((prev) => [...prev, newIng].sort((a, b) => a.name.localeCompare(b.name)));
      selectIngredient(forItemId, newIng.id);

      // Reset form
      setAddingNewFor(null);
      setNewIngName("");
      setNewIngUnit("each");
      setNewIngPackSize("");
      setNewIngPackUnit("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add ingredient");
    } finally {
      setSavingNewIng(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setError("");

    try {
      const confirmItems = Object.entries(selections).map(
        ([item_id, sel]) => ({
          item_id,
          ingredient_id: sel.ingredient_id,
          action: sel.action,
          units_per_pack: sel.units_per_pack || undefined,
        })
      );

      const res = await fetch(`/api/receipts/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: confirmItems }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Confirmation failed");
      }

      router.push(`/receipts/${id}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setConfirming(false);
    }
  }

  const updateCount = Object.values(selections).filter(
    (s) => s.action === "update" && s.ingredient_id
  ).length;
  const oneOffCount = Object.values(selections).filter(
    (s) => s.action === "one_off" && s.ingredient_id
  ).length;
  const skippedCount = Object.values(selections).filter(
    (s) => s.action === "skip" || !s.ingredient_id
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-zinc-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Loading receipt...</p>
        </div>
      </div>
    );
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
            <h1 className="text-lg font-bold text-zinc-900">
              Review Prices
            </h1>
            <p className="text-xs text-zinc-500">
              {(receipt as Record<string, unknown>)?.supplier as string || "Receipt"} — {items.length} items
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-52">
        {/* Match Summary */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-4">
          <div className="flex items-center gap-3">
            <div className="text-center flex-1">
              <p className="text-xl font-bold text-emerald-600">
                {updateCount}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Update</p>
            </div>
            <div className="w-px h-8 bg-zinc-200" />
            <div className="text-center flex-1">
              <p className="text-xl font-bold text-amber-500">
                {oneOffCount}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">One-Time</p>
            </div>
            <div className="w-px h-8 bg-zinc-200" />
            <div className="text-center flex-1">
              <p className="text-xl font-bold text-zinc-400">
                {skippedCount}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Skip</p>
            </div>
            <div className="w-px h-8 bg-zinc-200" />
            <div className="text-center flex-1">
              <p className="text-xl font-bold text-zinc-900">
                {items.length}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</p>
            </div>
          </div>
        </div>

        {/* Items to Review */}
        {items.map((item) => {
          const sel = selections[item.id];
          const currentAction = sel?.action || "skip";
          const isSkipped = currentAction === "skip" || !sel?.ingredient_id;
          const isOneOff = currentAction === "one_off" && sel?.ingredient_id;
          const isDone = doneItems.has(item.id);
          const matchedIngredient = sel?.ingredient_id
            ? ingredients.find((i) => i.id === sel.ingredient_id)
            : null;
          const priceChange =
            matchedIngredient
              ? getPriceChange(item)
              : null;

          return (
            <div
              key={item.id}
              ref={(el) => { itemRefs.current[item.id] = el; }}
              className={`bg-white rounded-2xl border p-4 transition-all ${
                isDone && !isSkipped
                  ? "border-emerald-200 bg-emerald-50/20"
                  : isDone && isSkipped
                  ? "border-zinc-200 opacity-50"
                  : isOneOff
                  ? "border-amber-200"
                  : priceChange?.isBigJump
                  ? "border-red-300 bg-red-50/30"
                  : "border-zinc-200"
              }`}
            >
              {/* Done checkmark */}
              {isDone && !isSkipped && (
                <div className="flex items-center gap-1.5 mb-2">
                  <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-medium text-emerald-600">
                    {currentAction === "update" ? "Will update price" : currentAction === "one_off" ? "One-time buy" : "Done"}
                    {matchedIngredient ? ` → ${matchedIngredient.name}` : ""}
                  </span>
                </div>
              )}

              {/* Receipt item name + price */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-zinc-900 text-sm">
                    {item.raw_name}
                  </p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-zinc-400">
                      Qty: {item.quantity} × ${item.unit_price?.toFixed(2)}
                    </p>
                  )}
                  {item.item_size && item.item_size_unit && (
                    <p className="text-xs text-indigo-600 font-medium mt-0.5">
                      {item.item_size} {item.item_size_unit} package
                    </p>
                  )}
                </div>
                <p className="font-bold text-zinc-900 ml-3">
                  ${item.total_price?.toFixed(2)}
                </p>
              </div>

              {/* Price change alerts — only show for "update" action */}
              {priceChange?.isBigJump && currentAction === "update" && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg
                      className="w-4 h-4 text-red-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-bold text-red-800">
                      Big Price Change
                    </span>
                  </div>
                  <p className="text-sm text-red-700">
                    Was ${priceChange.oldPrice.toFixed(2)} → Now $
                    {priceChange.newPrice.toFixed(2)}{" "}
                    <span className="font-bold">
                      ({priceChange.changePct > 0 ? "+" : ""}
                      {priceChange.changePct}%)
                    </span>
                  </p>
                </div>
              )}

              {/* Normal price change */}
              {priceChange && !priceChange.isBigJump && currentAction === "update" && (
                <div
                  className={`rounded-lg px-3 py-2 mb-3 text-sm ${
                    priceChange.isIncrease
                      ? "bg-amber-50 text-amber-800"
                      : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  Was ${priceChange.oldPrice.toFixed(2)} → Now $
                  {priceChange.newPrice.toFixed(2)}{" "}
                  <span className="font-semibold">
                    ({priceChange.changePct > 0 ? "+" : ""}
                    {priceChange.changePct}%)
                  </span>
                </div>
              )}

              {/* One-off label */}
              {isOneOff && matchedIngredient && (
                <div className="bg-amber-50 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-amber-800">
                    Matched to <span className="font-semibold">{matchedIngredient.name}</span> — price won&apos;t be updated
                  </p>
                </div>
              )}

              {/* Ingredient Match Selector */}
              <div className="relative mb-3">
                <button
                  onClick={() => {
                    setOpenDropdown(
                      openDropdown === item.id ? null : item.id
                    );
                    // Pre-fill search with alphabetic words only (no numbers, codes, abbreviations)
                    const cleanWords = item.raw_name
                      .replace(/[^a-zA-Z\s'-]/g, "")
                      .split(/\s+/)
                      .filter((w) => w.length > 2)
                      .slice(0, 1);
                    setSearchTerm(openDropdown === item.id ? "" : cleanWords.join(" "));
                    setAddingNewFor(null);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                    matchedIngredient
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-zinc-200 bg-zinc-50 text-zinc-500"
                  }`}
                >
                  {matchedIngredient
                    ? matchedIngredient.name
                    : "Tap to match an ingredient..."}
                  {item.match_confidence > 0 &&
                    item.match_confidence < 1 &&
                    matchedIngredient && (
                      <span className="text-xs ml-1 opacity-60">
                        ({Math.round(item.match_confidence * 100)}% match)
                      </span>
                    )}
                </button>

                {/* Dropdown */}
                {openDropdown === item.id && !addingNewFor && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-20 max-h-72 overflow-hidden">
                    <div className="p-2 border-b border-zinc-100">
                      <input
                        type="text"
                        placeholder="Search ingredients..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {fuzzyFilterIngredients(searchTerm).map((ing) => (
                        <button
                          key={ing.id}
                          onClick={() =>
                            selectIngredient(item.id, ing.id)
                          }
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-50 transition-colors ${
                            sel?.ingredient_id === ing.id
                              ? "bg-emerald-50 text-emerald-700 font-medium"
                              : "text-zinc-700"
                          }`}
                        >
                          {ing.name}
                        </button>
                      ))}
                      {fuzzyFilterIngredients(searchTerm).length === 0 && (
                        <p className="px-4 py-3 text-sm text-zinc-400 text-center">
                          No ingredients found
                        </p>
                      )}
                    </div>
                    {/* Add New Ingredient button — always visible */}
                    <div className="border-t border-zinc-100 p-2">
                      <button
                        onClick={() => {
                          setAddingNewFor(item.id);
                          // Pre-fill the name from the receipt item, cleaned up
                          const cleanName = item.raw_name
                            .replace(/\b\d+(\.\d+)?\s*(oz|lb|ct|pk|gal|fl)\b/gi, "")
                            .replace(/\bks\b/gi, "Kirkland")
                            .replace(/\bgv\b/gi, "Great Value")
                            .replace(/\bmm\b/gi, "Members Mark")
                            .replace(/[^a-zA-Z\s'-]/g, "")
                            .replace(/\s+/g, " ")
                            .trim();
                          setNewIngName(cleanName || item.raw_name);
                          setOpenDropdown(null);
                        }}
                        className="w-full py-2.5 rounded-lg bg-porch-teal/10 text-porch-teal text-sm font-semibold hover:bg-porch-teal/20 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add New Ingredient
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline Add New Ingredient Form */}
                {addingNewFor === item.id && (
                  <div className="mt-2 bg-porch-cream/30 border border-porch-cream-dark rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-zinc-700">Add New Ingredient</p>
                    <input
                      type="text"
                      placeholder="Ingredient name"
                      value={newIngName}
                      onChange={(e) => setNewIngName(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Unit</label>
                        <select
                          value={newIngUnit}
                          onChange={(e) => setNewIngUnit(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 text-sm"
                        >
                          <option value="each">each</option>
                          <option value="lb">lb</option>
                          <option value="oz">oz</option>
                          <option value="gal">gallon</option>
                          <option value="loaf">loaf</option>
                          <option value="bag">bag</option>
                          <option value="box">box</option>
                          <option value="pack">pack</option>
                          <option value="can">can</option>
                          <option value="bottle">bottle</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Pack Qty</label>
                        <input
                          type="number"
                          placeholder="1"
                          value={newIngPackSize}
                          onChange={(e) => setNewIngPackSize(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Pack Unit</label>
                        <input
                          type="text"
                          placeholder="loaf, ct..."
                          value={newIngPackUnit}
                          onChange={(e) => setNewIngPackUnit(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      Price: ${item.total_price?.toFixed(2)} (from receipt)
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAddNewIngredient(item.id, item)}
                        disabled={savingNewIng || !newIngName.trim()}
                        className="flex-1 py-2 rounded-lg bg-porch-teal text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {savingNewIng ? "Saving..." : "Add & Match"}
                      </button>
                      <button
                        onClick={() => setAddingNewFor(null)}
                        className="px-4 py-2 rounded-lg border border-zinc-200 text-xs text-zinc-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Smart Unit Breakdown — shows when matched and qty > 1 or user wants to add details */}
              {matchedIngredient && currentAction !== "skip" && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3">
                  <p className="text-xs font-semibold text-blue-900 mb-1">
                    {item.quantity > 1 ? "Tell me about this purchase" : "Any details?"}
                  </p>
                  {item.quantity > 1 && (
                    <p className="text-[10px] text-blue-700 mb-2">
                      Receipt: {item.quantity} × ${item.unit_price?.toFixed(2)} = ${item.total_price?.toFixed(2)}
                    </p>
                  )}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder='e.g. "2 loaves per pack" or "twin pack" or anything'
                      value={itemNotes[item.id] || ""}
                      onChange={(e) => handleSmartNote(item.id, e.target.value, item)}
                      className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white placeholder:text-blue-300 ${
                        aiParsing[item.id] ? "border-blue-400 pr-8" : "border-blue-200"
                      }`}
                    />
                    {aiParsing[item.id] && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {/* AI thinking indicator */}
                  {aiParsing[item.id] && (
                    <p className="text-[10px] text-blue-500 mt-1 animate-pulse">AI is thinking...</p>
                  )}
                  {/* Show the math when we detect a number */}
                  {(sel?.units_per_pack || 0) > 1 && !aiParsing[item.id] && (
                    <div className="mt-2 bg-white/60 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-blue-800">
                          {item.quantity > 1
                            ? <>{item.quantity} × {sel?.units_per_pack} per pack = <span className="font-bold">{item.quantity * (sel?.units_per_pack || 1)} total</span></>
                            : <><span className="font-bold">{sel?.units_per_pack} units</span> in this package</>
                          }
                        </p>
                        <p className="text-sm font-bold text-blue-900">
                          ${(item.total_price / ((item.quantity || 1) * (sel?.units_per_pack || 1))).toFixed(2)} each
                        </p>
                      </div>
                      {aiExplanations[item.id] && (
                        <p className="text-[10px] text-blue-600 mt-1">{aiExplanations[item.id]}</p>
                      )}
                    </div>
                  )}
                  {/* Show AI explanation when it parsed but found no units */}
                  {itemNotes[item.id] && !sel?.units_per_pack && !aiParsing[item.id] && aiExplanations[item.id] && (
                    <p className="text-[10px] text-blue-600 mt-1">{aiExplanations[item.id]}</p>
                  )}
                </div>
              )}

              {/* Action Buttons — 3 choices */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAction(item.id, "update")}
                  disabled={!sel?.ingredient_id}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    currentAction === "update" && sel?.ingredient_id
                      ? "bg-emerald-600 text-white"
                      : sel?.ingredient_id
                      ? "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      : "border border-zinc-200 text-zinc-300 cursor-not-allowed"
                  }`}
                >
                  Update Price
                </button>
                <button
                  onClick={() => setAction(item.id, "one_off")}
                  disabled={!sel?.ingredient_id}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    currentAction === "one_off" && sel?.ingredient_id
                      ? "bg-amber-500 text-white"
                      : sel?.ingredient_id
                      ? "border border-amber-200 text-amber-700 hover:bg-amber-50"
                      : "border border-zinc-200 text-zinc-300 cursor-not-allowed"
                  }`}
                >
                  One-Time Buy
                </button>
                <button
                  onClick={() => setAction(item.id, "skip")}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    currentAction === "skip" || !sel?.ingredient_id
                      ? "bg-zinc-200 text-zinc-600"
                      : "border border-zinc-200 text-zinc-400 hover:bg-zinc-50"
                  }`}
                >
                  Skip
                </button>
              </div>
            </div>
          );
        })}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Sticky Confirm Button — sits above the bottom nav bar */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 bg-white border-t border-zinc-200 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleConfirm}
            disabled={confirming || (updateCount === 0 && oneOffCount === 0)}
            className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold text-base hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {confirming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : updateCount > 0 ? (
              `Confirm ${updateCount} Price Update${updateCount !== 1 ? "s" : ""}${oneOffCount > 0 ? ` + ${oneOffCount} One-Time` : ""}`
            ) : oneOffCount > 0 ? (
              `Save ${oneOffCount} One-Time Purchase${oneOffCount !== 1 ? "s" : ""}`
            ) : (
              "Match at least one item to continue"
            )}
          </button>
          {updateCount === 0 && oneOffCount === 0 && (
            <p className="text-xs text-zinc-400 text-center mt-2">
              Match items above using the ingredient dropdown, then choose Update Price or One-Time Buy
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
