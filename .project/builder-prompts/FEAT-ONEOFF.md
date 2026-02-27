# FEAT-ONEOFF: One-Off Receipt Purchases (Track Expense Without Updating Standard Pricing)

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Add a "One-Off" option to the receipt review flow so users can flag individual receipt items as one-time purchases. These items should still be tracked as expenses and linked to ingredients, but should NOT update the ingredient's standard pricing (package_price, cost_per_unit). This is useful for special catering ingredients, bulk-buy exceptions, or items bought from a non-standard supplier.

## Root Cause
Currently the receipt confirmation endpoint (`/api/receipts/[id]/confirm`) only supports two actions per item: `"update"` (update ingredient price) or `"skip"` (ignore the item). There's no middle ground for "track the expense but don't change the standard price."

## Context
- Relevant files:
  - `src/app/api/receipts/[id]/confirm/route.ts` — Confirm logic, processes each item's action
  - `src/app/receipts/[id]/review/page.tsx` — Review UI with match/skip controls
  - `src/app/receipts/[id]/page.tsx` — Receipt detail page (should show one-off badge)
  - `src/app/api/receipts/[id]/route.ts` — Receipt detail API
  - `src/lib/db.ts` — Schema definition (needs `is_one_off` column)
- Spec: `.project/architect/features/demo-fixes.md` — "Feature Request: One-Off Receipt Purchases" section
- **Depends on:** FIX-3 (if DB has been migrated to Neon, schema changes go there)

## Implementation Plan

### Step 1: Add database column
Add `is_one_off` to the `receipt_items` table:

**If SQLite (pre-FIX-3):**
```sql
ALTER TABLE receipt_items ADD COLUMN is_one_off INTEGER DEFAULT 0;
```

**If Postgres (post-FIX-3):**
```sql
ALTER TABLE receipt_items ADD COLUMN is_one_off BOOLEAN DEFAULT FALSE;
```

Also update the CREATE TABLE in the schema definition to include this column for new installs.

### Step 2: Update the confirm API endpoint
In `src/app/api/receipts/[id]/confirm/route.ts`:

1. Update the `ConfirmItem` interface (line 5-8):
```ts
interface ConfirmItem {
  item_id: string;
  ingredient_id: string | null;
  action: "update" | "skip" | "one_off";
}
```

2. Add a new branch in the `for` loop (after the `skip` check, around line 42):
```ts
if (item.action === "one_off" && item.ingredient_id) {
  // Link to ingredient and record in price history, but DON'T update ingredient price

  const receiptItem = db.prepare("SELECT * FROM receipt_items WHERE id = ?").get(item.item_id);
  if (!receiptItem) continue;

  // Update receipt_item with match info + one_off flag
  db.prepare(
    "UPDATE receipt_items SET ingredient_id = ?, match_status = 'manual_matched', is_one_off = 1 WHERE id = ?"
  ).run(item.ingredient_id, item.item_id);

  // Get ingredient info for price history record
  const ingredient = db.prepare("SELECT * FROM ingredients WHERE id = ?").get(item.ingredient_id);
  if (!ingredient) continue;

  // Record in price history with special source
  db.prepare(
    `INSERT INTO ingredient_price_history (id, ingredient_id, package_price, package_size, package_unit, cost_per_unit, source, receipt_id)
     VALUES (?, ?, ?, ?, ?, ?, 'receipt_one_off', ?)`
  ).run(
    uuid(),
    item.ingredient_id,
    receiptItem.total_price,
    ingredient.package_size,
    ingredient.package_unit,
    ingredient.package_size > 0 ? receiptItem.total_price / ingredient.package_size : 0,
    id // receipt id
  );

  // Do NOT update ingredients table — that's the whole point
  continue;
}
```

3. If `action === "one_off"` but no `ingredient_id`, treat it like a skip:
```ts
if (item.action === "one_off" && !item.ingredient_id) {
  db.prepare("UPDATE receipt_items SET match_status = 'skipped', is_one_off = 1 WHERE id = ?").run(item.item_id);
  continue;
}
```

### Step 3: Update the review page UI
In `src/app/receipts/[id]/review/page.tsx`:

1. Update the `selections` state type to include `"one_off"`:
```ts
const [selections, setSelections] = useState<
  Record<string, { ingredient_id: string | null; action: "update" | "skip" | "one_off" }>
>({});
```

2. Add a `toggleOneOff` function (similar to `toggleSkip`):
```ts
function toggleOneOff(itemId: string) {
  setSelections((prev) => {
    const current = prev[itemId];
    if (current?.action === "one_off") {
      // Toggle back to update if ingredient is matched, or skip if not
      return {
        ...prev,
        [itemId]: {
          ...current,
          action: current.ingredient_id ? "update" : "skip",
        },
      };
    }
    return {
      ...prev,
      [itemId]: { ...current, action: "one_off" },
    };
  });
}
```

3. Add a "One-Off" button next to the existing "Skip" button for each item (around line 414-423):
```tsx
{/* One-Off Toggle */}
<button
  onClick={() => toggleOneOff(item.id)}
  className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
    sel?.action === "one_off"
      ? "border-amber-300 bg-amber-100 text-amber-700"
      : "border-zinc-200 text-zinc-400 hover:bg-zinc-50"
  }`}
>
  {sel?.action === "one_off" ? "One-Off" : "1x"}
</button>
```

4. When an item is set to "one_off", show a visual indicator:
```tsx
{sel?.action === "one_off" && (
  <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
    Expense tracked, but won't update standard pricing
  </div>
)}
```

5. Update the match counts at the top to show one-off count:
```ts
const oneOffCount = Object.values(selections).filter(
  (s) => s.action === "one_off"
).length;
```

6. Update the confirm button text to reflect one-off items:
```tsx
{`Confirm ${matchedCount} Match${matchedCount !== 1 ? "es" : ""}${
  oneOffCount > 0 ? ` + ${oneOffCount} One-Off` : ""
}`}
```

### Step 4: Update receipt detail page
In `src/app/receipts/[id]/page.tsx` (and the corresponding API route `src/app/api/receipts/[id]/route.ts`):

- Include `is_one_off` in the query that returns receipt items
- Show a small amber badge "One-Off" next to items where `is_one_off = true`

### Step 5: Ensure one-off items still count toward receipt totals
The receipt's `subtotal`, `tax`, and `total` fields are set during scanning (from the AI extraction) and are not affected by the confirm step. So one-off items are automatically included in expense totals. No changes needed here.

## Acceptance Criteria
- [ ] Review page shows three options per item: Match (green), One-Off (amber), Skip (gray)
- [ ] "One-Off" items are linked to an ingredient and recorded in `ingredient_price_history` with `source = 'receipt_one_off'`
- [ ] "One-Off" items do NOT update `ingredients.package_price` or `ingredients.cost_per_unit`
- [ ] `receipt_items.is_one_off` column exists and is set correctly
- [ ] Receipt detail page shows a "One-Off" badge on flagged items
- [ ] The confirm button shows count of one-off items alongside matched items
- [ ] Receipt total/subtotal still includes one-off items (expense tracking unaffected)
- [ ] Price history page for an ingredient shows one-off entries distinctly (different source value)
