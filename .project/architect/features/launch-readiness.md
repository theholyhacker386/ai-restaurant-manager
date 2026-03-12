# Launch Readiness: Recipes + Ingredient Sourcing

## Purpose

The platform cannot accurately calculate food costs, generate shopping lists, or provide real business value unless it knows:
1. **What goes into every menu item** (recipes with exact quantities)
2. **Where each ingredient comes from** (supplier assignment)

Without recipes, the platform only sees menu item names — it can't break them down into actual costs. A "Latte" on the menu means nothing without knowing it's 9oz milk + 2oz espresso + 0.75oz vanilla syrup. A "House Peanut Butter" means nothing without knowing it's peanuts + avocado oil + honey + salt.

This feature ensures restaurants provide ALL the data needed before "going live."

## Current State

### What exists:
- **Recipe builder** at `/menu/[id]/recipe/` — works for one item at a time
- **Recipe cards** at `/recipes` — view/print only, no creation
- **Ingredients** each have a `supplier` text field
- **Launch Pad** at `/launch-pad` — has a "Build Your Recipes" card but links to the view-only `/recipes` page
- **Price engine** in `supplier-prices.ts` — can look up prices per ingredient+supplier

### What's missing:
- No streamlined way to enter recipes for 50+ menu items quickly
- No page to see/manage which ingredient comes from which supplier in bulk
- Launch Pad doesn't explain WHY recipes matter or give examples
- No "readiness check" that blocks/warns when critical data is missing
- The `/recipes` page shows existing recipe cards but doesn't help CREATE new ones

## Design Approach

### Component 1: Enhanced Launch Pad

Update the existing Launch Pad page to:

**A) Better "Build Your Recipes" card with examples:**
- Change title to "Add Your Recipes"
- Add a concrete example: "For example: a Latte = 9oz milk + 2oz espresso + 0.75oz vanilla syrup. We need this for EVERY item — even coffee drinks, sauces, and blends — so we can calculate your true cost per plate."
- Show real-time progress: "12 of 68 menu items have recipes"
- Link to the NEW recipe wizard (not the view-only /recipes page)

**B) New "Assign Ingredient Suppliers" card:**
- Title: "Tell Us Where You Buy Each Ingredient"
- Example: "Once we know all your ingredients from your recipes, we need to know where you buy each one — like 'milk from Costco' or 'espresso beans from your local roaster' — so we can track prices and generate accurate shopping lists."
- Show progress: "45 of 82 ingredients have a supplier assigned"
- Link to new Ingredient Sourcing page

**C) Launch Readiness meter:**
- Visual progress bar or percentage
- Color-coded: red (not ready) → yellow (getting there) → green (ready to go)
- Checklist of what's still needed

### Component 2: Recipe Wizard (`/recipes/wizard`)

A focused page that walks restaurant owners through adding recipes for EVERY menu item, one at a time.

**UX flow:**
1. Shows a list of all menu items, grouped by category
2. Items with recipes get a green checkmark; items without get a yellow "needs recipe" badge
3. Click an item → opens an inline recipe editor (not a separate page)
4. Recipe editor:
   - Search/select from existing ingredients OR type a new ingredient name
   - Enter quantity + unit (oz, lb, g, cups, each, etc.)
   - Add as many ingredients as needed
   - "Save & Next" button jumps to the next item without a recipe
5. Progress bar at the top: "12 of 68 items complete"
6. Quick-add shortcut: type "9oz milk, 2oz espresso, 0.75oz vanilla syrup" and it parses automatically

**Key design decisions:**
- This is NOT the same as the existing `/menu/[id]/recipe/` page — that page requires navigating to each menu item individually. The wizard keeps you in one place and moves through all items.
- When a new ingredient is typed that doesn't exist yet, auto-create it in the ingredients table (name + unit) — the supplier and price can be filled in later on the sourcing page.
- The wizard should feel fast and lightweight — minimal navigation, maximum throughput.

### Component 3: Ingredient Sourcing Page (`/ingredients/sourcing`)

A single-page view of ALL ingredients with their supplier assignments.

**UX:**
- Table/list view: Ingredient Name | Unit | Current Supplier | [Change Supplier dropdown]
- Filter tabs: "All" | "Missing Supplier" | "Has Supplier"
- The supplier dropdown pre-populates from the restaurant's supplier list (from onboarding)
- Option to add a new supplier inline
- Batch mode: "Apply supplier to selected" for bulk assignment
- Visual indicator: ingredients without suppliers show in yellow/warning state
- Count at top: "37 of 82 ingredients have suppliers assigned"

**Data flow:**
- Reads from `ingredients` table (name, unit, supplier)
- Writes back to `ingredients.supplier` field
- Supplier dropdown populated from `suppliers` table (restaurant-specific)

### Component 4: Launch Readiness API (`/api/launch-readiness`)

A single endpoint that checks all launch requirements and returns status:

```json
{
  "ready": false,
  "score": 65,
  "checks": {
    "allMenuItemsHaveRecipes": { "pass": false, "done": 12, "total": 68, "label": "Menu items with recipes" },
    "allIngredientsHaveSuppliers": { "pass": false, "done": 45, "total": 82, "label": "Ingredients with suppliers" },
    "allIngredientsHavePricing": { "pass": false, "done": 38, "total": 82, "label": "Ingredients with pricing" },
    "businessHoursSet": { "pass": true },
    "costTargetsSet": { "pass": true },
    "hasMenuCategories": { "pass": true }
  }
}
```

This powers both the Launch Pad and can be used for a "readiness gate" if desired.

## Key Implementation Details

### Database: No schema changes needed
- `recipes` table already links menu_item_id → ingredient_id with quantity/unit
- `ingredients.supplier` field already exists
- `suppliers` table already holds restaurant-specific supplier list
- `ingredient_price_cache` already caches prices per ingredient+supplier

### Recipe Wizard auto-creates ingredients
When a user types an ingredient that doesn't exist:
1. Create a new row in `ingredients` with name + unit + restaurant_id
2. Leave supplier, cost_per_unit, package info blank
3. The ingredient shows up on the Sourcing page as "needs supplier"
4. Once supplier is assigned, the price engine can look up costs

### Sourcing page triggers price lookups
When a supplier is assigned to an ingredient that has no price:
1. Automatically trigger `lookupPrice(ingredientName, supplierName)` from the price engine
2. If found, update ingredient's cost_per_unit, package_size, package_price
3. If not found, flag for manual entry (user uploads receipt or enters price)

### Launch Pad progress is real-time
- Launch Pad page calls `/api/launch-readiness` on load
- Shows live counts, not cached/stale data
- "Build Recipes" card links to `/recipes/wizard` (not `/recipes`)
- "Assign Suppliers" card links to `/ingredients/sourcing`

## Acceptance Criteria

### Launch Pad
- [ ] "Add Your Recipes" card shows a concrete example (like the latte breakdown)
- [ ] "Add Your Recipes" card shows "X of Y menu items have recipes" live count
- [ ] "Add Your Recipes" card links to recipe wizard
- [ ] NEW "Assign Ingredient Suppliers" card with example and live count
- [ ] Launch readiness score/meter at top of page

### Recipe Wizard
- [ ] Shows all menu items grouped by category
- [ ] Green checkmark for items with recipes, yellow badge for items without
- [ ] Inline recipe editor with ingredient search + quantity entry
- [ ] "Save & Next" moves to next incomplete item
- [ ] Auto-creates new ingredients when typed
- [ ] Progress bar showing completion
- [ ] Unit conversion support (oz, lb, g, cups, each, etc.)

### Ingredient Sourcing
- [ ] Table of all ingredients with supplier column
- [ ] Supplier dropdown populated from restaurant's supplier list
- [ ] Filter for "missing supplier" vs "all"
- [ ] Assigning a supplier triggers automatic price lookup
- [ ] Count of assigned vs unassigned at top

### Launch Readiness API
- [ ] Returns pass/fail + counts for all checks
- [ ] Calculates overall readiness score
- [ ] Used by Launch Pad for live progress display

## Builder Task Breakdown

### LAUNCH-1: Launch Readiness API + Enhanced Launch Pad
- Create `/api/launch-readiness` endpoint
- Update Launch Pad with examples, live counts, readiness meter
- Fix "Build Recipes" link to point to wizard
- Add "Assign Suppliers" card
- ~500 lines, 4-5 files

### LAUNCH-2: Recipe Wizard Page
- Create `/recipes/wizard/page.tsx`
- Category-grouped menu item list with completion status
- Inline recipe editor (ingredient search, quantity, unit)
- Auto-create new ingredients
- Save & Next flow with progress bar
- ~800 lines, 3-4 files (page + API tweaks)

### LAUNCH-3: Ingredient Sourcing Page
- Create `/ingredients/sourcing/page.tsx`
- Ingredient table with supplier dropdowns
- Filter tabs (all / missing supplier)
- Auto-trigger price lookup on supplier assignment
- ~500 lines, 2-3 files (page + API endpoint)

Tasks can run in sequence (LAUNCH-1 → LAUNCH-2 → LAUNCH-3) or LAUNCH-2 and LAUNCH-3 can run in parallel after LAUNCH-1.
