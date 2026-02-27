# UI-2: Menu Items List & Add/Edit Pages

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Build the menu items management pages — the list view showing all menu items with their cost status, and the add/edit form for creating new items.

## Context
- Relevant files: Create new files under `src/app/menu/`
- Dependencies: API at `GET/POST /api/menu-items`, `GET/POST /api/categories`
- Database schema: `menu_items` table (id, name, selling_price, category_id, is_active, notes)
- Calculations: `src/lib/calculations.ts` has `calculateMenuItemCost()` and `suggestPrice()`
- Spec: `.project/architect/features/menu-costing.md`

## What to Build

### 1. Menu Items List (`src/app/menu/page.tsx`)
- List of all menu items grouped by category
- Each item shows:
  - Name
  - Selling price (what customer pays)
  - Ingredient cost (if recipe exists)
  - Food cost % with color indicator
  - Profit per item
  - Status badge: Green "Good" / Yellow "Watch" / Red "Too High" / Gray "Add Recipe"
- Filter/sort options: by category, by status (show danger first)
- "Add Item" floating action button
- Tap an item to view/edit its recipe (links to recipe builder page)

### 2. Add Menu Item (`src/app/menu/add/page.tsx`)
- Simple form:
  - Item name (text input)
  - Category (dropdown — populated from /api/categories, with "Add New" option)
  - Selling price (number input with $ prefix)
  - Notes (optional textarea)
- Save button submits to `POST /api/menu-items`
- After save, redirect to the menu list
- Also allow creating a new category inline

### 3. Edit Menu Item (`src/app/menu/[id]/page.tsx`)
- Same form as Add, pre-populated with existing data
- Shows the recipe/cost summary below the form
- "Edit Recipe" button that goes to recipe builder
- Delete option (with confirmation)

### Design Requirements
- Mobile-first: card-based layout
- Status colors are prominent and easy to scan
- Large font for prices and percentages
- Category headers are collapsible sections
- Empty state: friendly message when no items exist yet

## Acceptance Criteria
- [ ] Menu list shows all items with cost status colors
- [ ] Can add a new menu item with name, price, and category
- [ ] Can edit an existing menu item
- [ ] Can create a new category from the add item form
- [ ] Status badges are clearly visible (Green/Yellow/Red/Gray)
- [ ] Food cost % is prominently displayed for each item
- [ ] Suggested price shown for items in warning/danger
- [ ] Works well on mobile with large touch targets
- [ ] Empty state shown when no items exist
