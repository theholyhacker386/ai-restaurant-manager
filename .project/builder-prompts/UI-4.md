# UI-4: Recipe Builder Page

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Build the recipe builder — where Jennifer adds ingredients to a menu item and sees the cost build up in real-time. This is the core feature that answers "what does this menu item actually cost me to make?"

## Context
- Relevant files: Create `src/app/menu/[id]/recipe/page.tsx` and related components
- Dependencies: APIs at `GET/POST/DELETE /api/recipes`, `GET /api/ingredients`, `GET /api/menu-items`
- Database: `recipes` table links `menu_items` to `ingredients` with quantities
- Calculations: `src/lib/calculations.ts`
- Spec: `.project/architect/features/menu-costing.md`

## What to Build

### Recipe Builder Page (`src/app/menu/[id]/recipe/page.tsx`)

**Header Section:**
- Menu item name and selling price prominently displayed
- Running cost total and food cost % that update as ingredients are added
- Color-coded status bar (green/yellow/red) based on food cost %

**Ingredient List (Current Recipe):**
- Each ingredient in the recipe shows:
  - Ingredient name
  - Quantity used (e.g., "6 oz")
  - Cost for that amount (e.g., "$1.56")
  - Remove button (X)
- Running total at bottom: "Total ingredient cost: $3.42"
- Food cost calculation: "Food cost: 38% of $8.99 selling price"

**Add Ingredient Section:**
- Searchable dropdown of existing ingredients
- Quantity input with unit selector
- "Add to Recipe" button
- Preview: "6 oz of Chicken Breast = $1.56"
- Option to "Add New Ingredient" if it doesn't exist yet (opens ingredient add form)

**Cost Analysis Panel (bottom):**
- Total ingredient cost
- Selling price
- Profit per item
- Food cost percentage with color indicator
- If status is warning/danger:
  - "Suggested price: $XX.XX (to hit 30% food cost)"
  - "Or reduce ingredient cost by $X.XX"

**Quick Tips:**
- If food cost > 35%: Show friendly message like "This item costs more than it should compared to your selling price. You might want to raise the price or use less of the expensive ingredients."

### Design Requirements
- Real-time updates — no page reload needed when adding/removing ingredients
- The cost analysis should be visible at all times (sticky or always in view)
- Large, clear numbers for costs and percentages
- Swipe-to-delete on ingredient rows (mobile gesture)
- Confirmation before removing an ingredient

## Acceptance Criteria
- [ ] Can add ingredients from existing ingredient list to a recipe
- [ ] Can specify quantity and unit for each ingredient
- [ ] Running cost total updates in real-time
- [ ] Food cost % updates in real-time
- [ ] Color status changes as cost changes
- [ ] Can remove ingredients from recipe
- [ ] Shows suggested price if food cost is too high
- [ ] Shows profit per item
- [ ] Can create a new ingredient inline if needed
- [ ] Works smoothly on mobile with no lag
- [ ] No technical jargon — uses plain language
