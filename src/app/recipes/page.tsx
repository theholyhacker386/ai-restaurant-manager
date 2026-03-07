"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface RecipeCard {
  id: string;
  name: string;
  category: string;
  instructions: string;
  ingredients: { name: string; quantity: number; unit: string }[];
}

export default function RecipeCardsPage() {
  const [cards, setCards] = useState<RecipeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInstructions, setEditInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [printSingleId, setPrintSingleId] = useState<string | null>(null);

  function handlePrintSingle(id: string) {
    setPrintSingleId(id);
    setTimeout(() => {
      window.print();
      setPrintSingleId(null);
    }, 100);
  }

  useEffect(() => {
    fetch("/api/recipe-cards")
      .then((res) => res.json())
      .then((data) => {
        setCards(data.cards || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = cards.filter(
    (card) =>
      card.name.toLowerCase().includes(search.toLowerCase()) ||
      card.category.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category — put "House Made Recipes" first
  const grouped = new Map<string, RecipeCard[]>();
  for (const card of filtered) {
    if (!grouped.has(card.category)) grouped.set(card.category, []);
    grouped.get(card.category)!.push(card);
  }
  // Move House Made Recipes to the top if it exists
  if (grouped.has("House Made Recipes")) {
    const houseMade = grouped.get("House Made Recipes")!;
    grouped.delete("House Made Recipes");
    const reordered = new Map<string, RecipeCard[]>();
    reordered.set("House Made Recipes", houseMade);
    for (const [k, v] of grouped) reordered.set(k, v);
    grouped.clear();
    for (const [k, v] of reordered) grouped.set(k, v);
  }

  async function handleSaveInstructions(id: string) {
    setSaving(true);
    try {
      await fetch("/api/recipe-cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          recipe_instructions: editInstructions.trim(),
        }),
      });
      setCards((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, instructions: editInstructions.trim() } : c
        )
      );
      setEditingId(null);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-3 border-porch-cream-dark border-t-porch-teal rounded-full animate-spin" />
        <p className="text-sm text-porch-brown-light/70">
          Loading recipes...
        </p>
      </div>
    );
  }

  // Flat list for printing (respects single-card filter)
  const printCards = printSingleId
    ? cards.filter((c) => c.id === printSingleId)
    : filtered;

  return (
    <>
      {/* ===== SCREEN VIEW ===== */}
      <div className="space-y-4 print:hidden">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-porch-cream active:bg-porch-cream-dark transition-colors"
          >
            <svg className="w-5 h-5 text-porch-brown-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground">Recipe Cards</h2>
            <p className="text-sm text-porch-brown-light/70 mt-0.5">
              {cards.length} recipes — tap the pencil to add prep instructions
            </p>
          </div>
          <button
            onClick={() => { setPrintSingleId(null); setTimeout(() => window.print(), 50); }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-porch-teal text-white rounded-xl font-semibold text-sm hover:bg-porch-teal-light active:scale-95 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print All
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-porch-brown-light/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-porch-cream-dark bg-white text-sm focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
          />
        </div>

        {/* Empty State */}
        {cards.length === 0 && (
          <div className="text-center py-16">
            <p className="text-lg font-medium text-foreground">No recipes yet</p>
            <p className="text-sm text-porch-brown-light/60 mt-1 max-w-md mx-auto">
              Tell us what goes into each menu item — use exact measurements like ounces, grams, or cups so we can calculate your real cost per plate. Once added, your recipes show up here as printable cards.
            </p>
            <Link href="/menu" className="inline-block mt-4 bg-porch-teal text-white px-6 py-3 rounded-xl font-semibold text-sm">
              Go to Menu
            </Link>
          </div>
        )}

        {/* Recipe Cards Grid - Screen */}
        {Array.from(grouped.entries()).map(([category, categoryCards]) => (
          <div key={category} className="mb-6">
            <h3 className="text-sm font-semibold text-porch-brown-light/60 uppercase tracking-wider px-1 mb-3">
              {category}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categoryCards.map((card) => (
                <div key={card.id} className="bg-white rounded-2xl border border-porch-cream-dark/50 overflow-hidden">
                  <div className="px-4 py-3 bg-porch-cream/30 border-b border-porch-cream-dark/30">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-foreground">{card.name}</h4>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePrintSingle(card.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-porch-brown-light/40 hover:text-porch-brown-light hover:bg-porch-cream transition-colors"
                          title="Print this card"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => { setEditingId(card.id); setEditInstructions(card.instructions); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-porch-brown-light/40 hover:text-porch-brown-light hover:bg-porch-cream transition-colors"
                          title="Edit instructions"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {card.instructions ? (
                    <div className="px-4 py-2 border-b border-porch-cream-dark/20">
                      <p className="text-xs text-porch-brown-light/80 italic">{card.instructions}</p>
                    </div>
                  ) : (
                    <div className="px-4 py-2 border-b border-porch-cream-dark/20">
                      <p className="text-xs text-porch-brown-light/30 italic">(Add prep instructions)</p>
                    </div>
                  )}

                  <div className="px-4 py-2">
                    <p className="text-[10px] font-semibold text-porch-brown-light/60 uppercase tracking-wider mb-1.5">Ingredients</p>
                    <ul className="space-y-1">
                      {card.ingredients.map((ing, idx) => (
                        <li key={idx} className="flex items-baseline justify-between text-xs">
                          <span className="text-foreground">{ing.name}</span>
                          <span className="text-porch-brown-light/60 ml-2 shrink-0">{ing.quantity} {ing.unit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ===== PRINT VIEW — completely separate layout ===== */}
      <div className="hidden print:block">
        <div className="recipe-print-grid">
          {printCards.map((card) => (
            <div key={card.id} className="recipe-print-card">
              {/* Card header with name */}
              <div className="recipe-print-header">
                <h2>{card.name}</h2>
                <span className="recipe-print-category">{card.category}</span>
              </div>

              {/* Ingredients */}
              <div className="recipe-print-section">
                <h3>Ingredients</h3>
                <table className="recipe-print-table">
                  <tbody>
                    {card.ingredients.map((ing, idx) => (
                      <tr key={idx}>
                        <td className="recipe-print-ing-name">{ing.name}</td>
                        <td className="recipe-print-ing-qty">{ing.quantity} {ing.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Instructions */}
              <div className="recipe-print-section">
                <h3>Instructions</h3>
                {card.instructions ? (
                  <p className="recipe-print-instructions">{card.instructions}</p>
                ) : (
                  <div className="recipe-print-blank-lines">
                    <div /><div /><div />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Instructions Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 print:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingId(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl p-5 animate-slide-up">
            <h3 className="text-base font-bold text-foreground mb-1">Prep Instructions</h3>
            <p className="text-xs text-porch-brown-light/60 mb-3">
              {cards.find((c) => c.id === editingId)?.name}
            </p>
            <textarea
              value={editInstructions}
              onChange={(e) => setEditInstructions(e.target.value)}
              placeholder='e.g., "Smash half the chickpeas, blend the rest. Mix with lemon juice, salt, and dill..."'
              rows={5}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-porch-cream-dark bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-porch-teal/50 focus:border-porch-teal"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setEditingId(null)}
                className="flex-1 py-3 rounded-xl border border-porch-cream-dark text-porch-brown-light font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveInstructions(editingId)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-porch-teal text-white font-semibold text-sm disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
