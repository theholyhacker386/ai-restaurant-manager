# LAUNCH-3: Ingredient Sourcing Page

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task

Build an Ingredient Sourcing page where restaurant owners can see ALL their ingredients and assign which supplier they buy each one from. When a supplier is assigned, automatically look up the price.

## Context

- Spec: `.project/architect/features/launch-readiness.md`
- Ingredients API: `src/app/api/ingredients/route.ts` — supports GET (list all) and PUT (update)
- Ingredient page: `src/app/ingredients/page.tsx` — reference for styling
- Supplier directory: `src/app/api/supplier-directory/route.ts` — global supplier list
- Restaurant suppliers: stored in `suppliers` table
- Price engine: `src/lib/supplier-prices.ts` — `lookupPrice(ingredientName, supplierName)` function
- Supplier price API: `src/app/api/supplier-prices/route.ts` — existing endpoint for price lookups
- Database: Neon PostgreSQL via `src/lib/db.ts`
- Auth: `src/lib/auth.ts` exports `getAuthenticatedUser()` → `{ userId, restaurantId }`

## Page: `/ingredients/sourcing/page.tsx`

### Layout

**Top section:**
- Back button → `/launch-pad`
- Title: "Ingredient Suppliers"
- Subtitle: "Tell us where you buy each ingredient so we can track prices and build shopping lists."
- Progress: "45 of 82 ingredients have a supplier assigned"
- Filter tabs: "All" | "Needs Supplier" (default to "Needs Supplier" if there are items missing suppliers, otherwise "All")

**Main section — Ingredient list:**
- Each row shows:
  - Ingredient name
  - Current unit (oz, lb, etc.)
  - Current supplier (if assigned) in a colored badge, OR "No supplier" in gray
  - Current price per unit (if known), OR "No price" in gray
  - Tap to expand → shows supplier picker

**Expanded supplier picker:**
- Dropdown/selector showing the restaurant's suppliers (from `suppliers` table)
- Current supplier pre-selected if one exists
- "None / Homemade" option for items made in-house
- "Add New Supplier" option at bottom of dropdown
- When a supplier is selected:
  1. Update the ingredient's `supplier` field via PUT `/api/ingredients/[id]`
  2. If the ingredient has no price (`cost_per_unit` is null or 0), trigger a price lookup
  3. Show a small loading spinner while looking up price
  4. If price found, update the ingredient's pricing fields and show success
  5. If price not found, show a gentle note: "We couldn't find a price online. You can add it manually on the ingredients page."
- "Save" button confirms the change, collapses the row

### API Interactions

**Load data (on page mount):**
1. GET `/api/ingredients` — all ingredients with supplier + pricing info
2. GET `/api/onboarding/suppliers` or query `suppliers` table — restaurant's supplier list

**Note:** Check how the existing ingredients page loads suppliers for the dropdown. There may already be a suppliers list endpoint. If the restaurant's suppliers aren't available via an existing endpoint, create a simple GET endpoint:
- `GET /api/suppliers` → returns `SELECT name FROM suppliers WHERE restaurant_id = $1 ORDER BY name`

**Update supplier:**
- PUT `/api/ingredients/[id]` with `{ supplier: "Sysco" }`

**Trigger price lookup:**
- GET `/api/supplier-prices?ingredient=[name]&supplier=[supplier]`
- This existing endpoint calls `lookupPrice()` from the price engine
- If it returns a price, update the ingredient via PUT `/api/ingredients/[id]` with the pricing fields

### UX Details

- Mobile-first (restaurant owners use phones)
- Ingredients sorted alphabetically by default
- Search bar at top to filter ingredients by name
- When switching from "Needs Supplier" to "All" tab, maintain scroll position
- Show a summary at the bottom when all suppliers are assigned: "All ingredients have suppliers! Your shopping lists and cost tracking are ready to go."
- Make the supplier badges color-coded (each supplier gets a consistent soft color for quick visual scanning)
- When price lookup is in progress, show a subtle spinner next to the ingredient (don't block the whole page)

### Edge Cases

- Ingredients with `ingredient_type = 'sub_recipe'` should show supplier as "Homemade" and NOT offer the supplier picker (they're made from other ingredients)
- Ingredients with `supplier = 'Homemade'` should be excluded from the "Needs Supplier" count
- If a restaurant has no suppliers saved yet, show a message: "You haven't added any suppliers yet" with a link to add them (could link to onboarding or a simple add-supplier form)

## Acceptance Criteria

- [ ] Page at `/ingredients/sourcing` shows all ingredients
- [ ] Each ingredient shows name, unit, current supplier, current price
- [ ] Progress counter: "X of Y ingredients have a supplier"
- [ ] Filter tabs: "All" and "Needs Supplier"
- [ ] Tapping an ingredient opens supplier picker dropdown
- [ ] Dropdown shows restaurant's saved suppliers
- [ ] Selecting a supplier saves it to the ingredient
- [ ] Auto-triggers price lookup when supplier assigned and no price exists
- [ ] Shows loading state during price lookup
- [ ] Sub-recipe ingredients show as "Homemade" (no supplier picker)
- [ ] Search bar filters ingredients by name
- [ ] Mobile-friendly layout
- [ ] Build passes with no errors
