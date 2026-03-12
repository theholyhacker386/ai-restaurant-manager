# LAUNCH-1: Launch Readiness API + Enhanced Launch Pad

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task

Create a Launch Readiness API and update the Launch Pad page with better descriptions, real examples, live progress counts, and a readiness meter.

## Context

- Spec: `.project/architect/features/launch-readiness.md`
- Launch Pad page: `src/app/launch-pad/page.tsx`
- Existing recipe builder: `src/app/menu/[id]/recipe/page.tsx`
- Recipe cards (view only): `src/app/recipes/page.tsx`
- Database: Neon PostgreSQL, connection via `src/lib/db.ts`
- Auth/tenant: `src/lib/auth.ts` exports `getAuthenticatedUser()` which returns `{ userId, restaurantId }`

## Part 1: Launch Readiness API

Create `src/app/api/launch-readiness/route.ts` (GET):

Query the database and return:
```json
{
  "ready": false,
  "score": 65,
  "checks": {
    "recipesComplete": { "pass": false, "done": 12, "total": 68 },
    "suppliersAssigned": { "pass": false, "done": 45, "total": 82 },
    "ingredientsPriced": { "pass": false, "done": 38, "total": 82 },
    "businessHoursSet": { "pass": true },
    "costTargetsSet": { "pass": true },
    "categoriesSet": { "pass": true }
  }
}
```

SQL queries needed:
- `recipesComplete`: Count menu items that have at least one recipe row vs total menu items. Use `SELECT COUNT(DISTINCT menu_item_id) FROM recipes WHERE restaurant_id = $1` vs `SELECT COUNT(*) FROM menu_items WHERE restaurant_id = $1`
- `suppliersAssigned`: Count ingredients where `supplier IS NOT NULL AND supplier != ''` vs total ingredients. Filter `WHERE restaurant_id = $1`
- `ingredientsPriced`: Count ingredients where `cost_per_unit > 0` vs total ingredients
- `businessHoursSet`: Check `business_settings` for non-null business_hours
- `costTargetsSet`: Check `business_settings` for food_cost_target being set
- `categoriesSet`: Check if any rows exist in `menu_categories` for restaurant

Score = weighted average: recipes (40%), suppliers (30%), pricing (20%), other checks (10%)

## Part 2: Enhanced Launch Pad

Update `src/app/launch-pad/page.tsx`:

**A) Replace the static data fetching with a call to `/api/launch-readiness`**

**B) Add a readiness meter at the top** (below the header, above "What You've Completed"):
- Circular or horizontal progress bar showing the score percentage
- Color: red (<40%), yellow (40-75%), green (>75%)
- Label: "Launch Readiness: 65%"

**C) Update the "Build Your Recipes" ActionCard:**
- Title: "Add Your Recipes"
- Description: "Every menu item needs a recipe — even coffee drinks, smoothies, and sauces. For example: a Latte = 9oz milk + 2oz espresso + 0.75oz vanilla syrup. Without this, we can't calculate what each item actually costs you to make."
- Status: "12 of 68 menu items have recipes" (from API)
- Button: "Add Recipes" → links to `/recipes/wizard` (this page won't exist yet, that's fine — it will be built in LAUNCH-2)

**D) Add a NEW ActionCard after recipes: "Tell Us Where You Buy Each Ingredient"**
- Icon: truck or store emoji
- Title: "Assign Ingredient Suppliers"
- Description: "Once we know all your ingredients from your recipes, we need to know where you buy each one — like 'milk from Costco' or 'espresso from a local roaster.' This lets us track prices and build accurate shopping lists."
- Status: "45 of 82 ingredients have a supplier" (from API)
- Button: "Assign Suppliers" → links to `/ingredients/sourcing` (will be built in LAUNCH-3)

**E) Move the "Build Your Recipes" and "Assign Suppliers" cards into a new section:**
- Section title: "Complete Your Setup" (place ABOVE "Connect Your Tools")
- This is the most important section for launch readiness

## Acceptance Criteria

- [ ] GET `/api/launch-readiness` returns correct counts from database
- [ ] Launch Pad shows readiness meter with percentage
- [ ] "Add Your Recipes" card has the latte example in description
- [ ] "Add Your Recipes" card shows live "X of Y" count from API
- [ ] "Add Your Recipes" button links to `/recipes/wizard`
- [ ] New "Assign Ingredient Suppliers" card with description and live count
- [ ] "Assign Suppliers" button links to `/ingredients/sourcing`
- [ ] Both new cards are in a "Complete Your Setup" section above "Connect Your Tools"
- [ ] Build passes with no errors
