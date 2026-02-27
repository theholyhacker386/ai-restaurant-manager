# UI-3: Ingredient Manager Pages

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Build the ingredient management pages — where Jennifer enters all the ingredients she buys from Walmart with their package prices, so the system can calculate per-unit costs.

## Context
- Relevant files: Create new files under `src/app/ingredients/`
- Dependencies: API at `GET/POST /api/ingredients`
- Database schema: `ingredients` table (id, name, unit, cost_per_unit, package_size, package_unit, package_price, supplier, notes)
- Spec: `.project/architect/features/menu-costing.md`

## What to Build

### 1. Ingredients List (`src/app/ingredients/page.tsx`)
- List of all ingredients sorted alphabetically
- Each ingredient shows:
  - Name (e.g., "Chicken Breast")
  - Supplier (e.g., "Walmart")
  - Package info (e.g., "5 lb bag — $12.99")
  - Cost per unit (e.g., "$2.60/lb") — calculated automatically
  - How many recipes use this ingredient
- Search bar at top to filter ingredients
- "Add Ingredient" floating action button
- Tap an ingredient to edit it

### 2. Add Ingredient (`src/app/ingredients/add/page.tsx`)
- User-friendly form with clear labels and examples:
  - **Ingredient name**: "What do you call this?" (e.g., "Chicken Breast")
  - **Where do you buy it?**: Dropdown (Walmart, Sam's Club, Restaurant Depot, Other)
  - **How is it packaged?**: Two fields
    - Package size (number) + unit dropdown (lb, oz, each, gallon, count, bag)
    - Example helper text: "e.g., a bag that has 5 lbs"
  - **How much does the package cost?**: Dollar input
    - System shows: "That means each lb costs $X.XX"
  - **Notes**: Optional
- Auto-preview: Shows calculated cost-per-unit as they type
- Save button submits to `POST /api/ingredients`

### 3. Edit Ingredient (`src/app/ingredients/[id]/page.tsx`)
- Same form as Add, pre-populated
- Shows which menu items use this ingredient
- "If you update the price, it will automatically update the cost of all recipes that use this ingredient"
- Delete option (with warning if used in recipes)

### Design Requirements
- Mobile-first
- The package-to-unit calculation should be visible and clear
- Use everyday language: "How much does the bag cost?" not "Enter package price"
- Helper text with examples throughout
- Unit dropdown should have common café units

## Acceptance Criteria
- [ ] Can add ingredients with package information from Walmart
- [ ] Cost per unit is auto-calculated from package size and price
- [ ] Cost per unit preview updates in real-time as user types
- [ ] Can search/filter the ingredient list
- [ ] Can edit ingredients (price updates cascade to recipes)
- [ ] Shows which recipes use each ingredient
- [ ] Everyday language throughout — no technical jargon
- [ ] Works well on mobile
