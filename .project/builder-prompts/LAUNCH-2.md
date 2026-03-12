# LAUNCH-2: Recipe Wizard Page

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task

Build a Recipe Wizard page that lets restaurant owners quickly add recipes for ALL their menu items from one place, instead of navigating to each item individually.

## Context

- Spec: `.project/architect/features/launch-readiness.md`
- Existing recipe builder (per-item): `src/app/menu/[id]/recipe/page.tsx` — reference this for patterns
- Recipe API: `src/app/api/recipes/route.ts` — existing CRUD for recipe lines
- Ingredient API: `src/app/api/ingredients/route.ts` — existing CRUD for ingredients
- Menu items API: `src/app/api/menu-items/route.ts` — GET returns all menu items
- Database: Neon PostgreSQL via `src/lib/db.ts`
- Auth: `src/lib/auth.ts` exports `getAuthenticatedUser()` → `{ userId, restaurantId }`
- App styling: Uses Tailwind with `porch-brown`, `porch-cream`, `porch-teal` custom colors. Mobile-first.

## Page: `/recipes/wizard/page.tsx`

### Layout

**Top section:**
- Back button → `/launch-pad`
- Title: "Add Your Recipes"
- Subtitle: "Tell us what goes into each menu item — every ingredient and how much. This is how we calculate your real cost per plate."
- Progress bar: "12 of 68 items have recipes" with a visual bar

**Main section — Menu items list:**
- Grouped by category (same grouping as menu page)
- Each item shows:
  - Item name
  - Selling price
  - Green checkmark + ingredient count if recipe exists (e.g., "6 ingredients")
  - Yellow "Needs Recipe" badge if no recipe exists
  - Tap to expand/open the inline editor

**Inline Recipe Editor (expands below the tapped item):**
- Shows existing ingredients if any (with quantity + unit + delete button)
- "Add Ingredient" row at bottom:
  - Text input with autocomplete search against existing ingredients
  - Quantity input (number)
  - Unit dropdown (oz, lb, g, kg, cups, tbsp, tsp, fl oz, each, serving, ml, L)
  - "Add" button
- If the typed ingredient doesn't exist in the database, show: "Create new ingredient: [name]" option in the dropdown
- When creating a new ingredient:
  - POST to `/api/ingredients` with just name + unit + restaurant_id
  - Leave supplier, cost_per_unit blank (will be filled on sourcing page)
  - Then add it to the recipe
- "Save & Next" button:
  - Saves the recipe (POST/PATCH to `/api/recipes`)
  - Collapses this item
  - Auto-scrolls to and expands the next item WITHOUT a recipe
- "Done" button to collapse without moving to next

### API Interactions

**Load data (on page mount):**
1. GET `/api/menu-items` — all menu items with categories
2. GET `/api/ingredients` — all ingredients (for autocomplete)
3. For each menu item, need to know if it has recipes. Either:
   - Fetch all recipes at once: GET `/api/recipes?all=true` (may need to add this param)
   - Or use the launch-readiness data

**If GET `/api/recipes?all=true` doesn't exist, create it:**
- Add support in `src/app/api/recipes/route.ts` for fetching all recipes grouped by menu_item_id
- Return: `{ recipes: { [menu_item_id]: RecipeLine[] } }`

**Add ingredient to recipe:**
- POST `/api/recipes` with `{ menu_item_id, ingredient_id, quantity, quantity_unit }`

**Remove ingredient from recipe:**
- DELETE `/api/recipes?id=[recipe_line_id]`

**Create new ingredient (when it doesn't exist):**
- POST `/api/ingredients` with `{ name, unit }` — the route already supports this

### UX Details

- Mobile-first responsive design (most restaurant owners use phones)
- Autocomplete dropdown should appear after 1+ characters typed
- Show ingredient's existing supplier and unit in the autocomplete results (helps identify the right one)
- When no items need recipes, show a celebratory state: "All recipes complete!" with confetti or green checkmark
- Category sections can be collapsed/expanded
- "Items needing recipes" filter toggle at the top (default ON — show only items without recipes, with option to show all)

## Acceptance Criteria

- [ ] Page at `/recipes/wizard` shows all menu items grouped by category
- [ ] Items with recipes show green checkmark + ingredient count
- [ ] Items without recipes show yellow "Needs Recipe" badge
- [ ] Progress bar shows "X of Y items have recipes"
- [ ] Tapping an item opens inline recipe editor
- [ ] Ingredient autocomplete works against existing ingredients
- [ ] Can add quantity + unit for each ingredient
- [ ] Typing a new ingredient name offers "Create new ingredient" option
- [ ] Creating a new ingredient adds it to DB then to the recipe
- [ ] "Save & Next" saves recipe and moves to next incomplete item
- [ ] Filter toggle to show only items needing recipes
- [ ] Mobile-friendly layout (this is used on phones)
- [ ] Build passes with no errors
