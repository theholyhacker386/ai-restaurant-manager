# Menu Costing System

## Purpose
Allow Jennifer to see exactly what each menu item at The Porch Health Park costs to make, compare it against the selling price, and determine whether prices need to be raised. This is the most urgent feature — she needs to know if her menu pricing is sustainable.

## Design Approach

### Data Model
The system uses three connected concepts:
1. **Menu Items** — What's on the menu (name, selling price, category)
2. **Ingredients** — Individual items purchased from Walmart (chicken, lettuce, cups, etc.) with their costs
3. **Recipes** — Links ingredients to menu items with quantities (e.g., Chicken Salad needs 6oz chicken + 3oz lettuce + 1oz dressing)

### Cost Calculation
For each menu item:
- `Total Cost = SUM(ingredient_quantity × ingredient_cost_per_unit)` for all recipe ingredients
- `Food Cost % = (Total Cost / Selling Price) × 100`
- `Profit Per Item = Selling Price - Total Cost`
- `Suggested Price = Total Cost / 0.30` (targets 30% food cost)

### Status Indicators (Color-Coded)
- **Green (Good)**: Food cost <= 30% — Item is priced well
- **Yellow (Warning)**: Food cost 31-35% — Borderline, consider adjusting
- **Red (Danger)**: Food cost > 35% — Losing money, needs price increase or cheaper ingredients
- **Gray (Needs Input)**: No recipe entered yet

### Ingredient Cost Tracking
Ingredients are entered with package information from Walmart:
- Package size (e.g., 5 lb bag)
- Package price (e.g., $12.99)
- System auto-calculates cost per unit (e.g., $2.60/lb)

This way, when Jennifer says "I buy a 5 lb bag of chicken for $12.99," the system knows chicken costs $2.60 per pound and can calculate how much chicken goes into each menu item.

## Key Implementation Details

### UI Requirements
- **Mobile-first** — Jennifer will use this on her phone
- **Simple input flows** — Big buttons, clear labels, no jargon
- **Real-time calculation** — As she adds ingredients to a recipe, cost updates instantly
- **Summary dashboard** — Overview showing all menu items with their status colors

### Pages/Screens
1. **Menu Items List** — All items with selling price, cost, food cost %, status color
2. **Add/Edit Menu Item** — Name, category, selling price
3. **Ingredients List** — All ingredients with Walmart pricing
4. **Add/Edit Ingredient** — Name, unit, package size, package price, supplier
5. **Recipe Builder** — For a specific menu item: add ingredients with quantities, see running total
6. **Cost Analysis Summary** — Birds-eye view: how many items are green/yellow/red, total menu health

### Navigation
- Bottom tab bar (mobile-friendly): Dashboard | Menu | Ingredients | Expenses

## Acceptance Criteria
- [ ] Can create menu categories (e.g., Sandwiches, Drinks, Salads)
- [ ] Can create menu items with name, selling price, and category
- [ ] Can create ingredients with Walmart package pricing (auto-calculates cost per unit)
- [ ] Can build a recipe: add multiple ingredients to a menu item with quantities
- [ ] Each menu item shows: total cost, food cost %, profit, status color
- [ ] Menu items list shows color-coded status at a glance
- [ ] Suggested price is shown for items that are in warning/danger zone
- [ ] Works well on mobile (thumb-friendly, no tiny buttons)
- [ ] All data persists in SQLite database
