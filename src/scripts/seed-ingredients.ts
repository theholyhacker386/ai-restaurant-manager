/**
 * Seed script: Pre-loads The Porch Health Park ingredients with Walmart prices
 * Run with: npx tsx src/scripts/seed-ingredients.ts
 *
 * Data sources:
 * - Walmart.com prices (February 2026)
 * - Jennifer's daily Walmart ordering checklist
 * - Frozen fruit from What Chefs Want
 * - Coffee beans from Local Roaster
 * - Kombucha & Immunity Shots from Local Brewers
 */
import Database from "better-sqlite3";
import path from "path";
import { v4 as uuid } from "uuid";

const DB_PATH = path.join(process.cwd(), "porch-financial.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Ensure ingredients table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    cost_per_unit REAL NOT NULL DEFAULT 0,
    supplier TEXT DEFAULT 'Walmart',
    package_size REAL,
    package_unit TEXT,
    package_price REAL,
    last_updated TEXT DEFAULT (datetime('now')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Each ingredient: [name, unit, package_size, package_unit, package_price, supplier, notes]
// cost_per_unit is auto-calculated from package_price / package_size
type IngredientRow = [string, string, number, string, number, string, string];

const ingredients: IngredientRow[] = [

  // ============================================================
  // FRUIT (Fresh - from Walmart)
  // ============================================================
  ["Avocado (Fresh)", "each", 1, "each", 0.56, "Walmart", "Hass avocados"],
  ["Bananas (Fresh)", "lb", 1, "lb", 0.53, "Walmart", "About 3 bananas per lb"],
  ["Blueberries (Fresh)", "oz", 11, "oz", 3.17, "Walmart", "1 pint container"],
  ["Strawberries (Fresh)", "oz", 16, "oz", 3.38, "Walmart", "1 lb container"],
  ["Pineapple (Fresh)", "each", 1, "each", 2.18, "Walmart", "Whole pineapple"],
  ["Kiwi", "lb", 1, "lb", 2.43, "Walmart", "1 lb package"],

  // ============================================================
  // FROZEN FRUIT (from What Chefs Want)
  // ============================================================
  ["Frozen Bananas", "oz", 16, "oz", 0, "What Chefs Want", "Price TBD - update when invoice available"],
  ["Frozen Mango", "oz", 16, "oz", 0, "What Chefs Want", "Price TBD - update when invoice available"],
  ["Frozen Pineapple", "oz", 16, "oz", 0, "What Chefs Want", "Price TBD - update when invoice available"],
  ["Frozen Blueberries", "oz", 16, "oz", 0, "What Chefs Want", "Price TBD - update when invoice available"],
  ["Frozen Strawberries", "oz", 16, "oz", 0, "What Chefs Want", "Price TBD - update when invoice available"],

  // ============================================================
  // MILK & DAIRY (from Walmart)
  // ============================================================
  ["Organic Whole Milk", "fl oz", 128, "fl oz", 6.28, "Walmart", "1 gallon"],
  ["Half & Half", "fl oz", 32, "fl oz", 3.48, "Walmart", "1 quart"],
  ["2% Milk", "fl oz", 128, "fl oz", 3.78, "Walmart", "1 gallon"],
  ["Unsweetened Almond Milk", "fl oz", 64, "fl oz", 3.34, "Walmart", "Silk half gallon"],
  ["Almond Milk", "fl oz", 64, "fl oz", 3.34, "Walmart", "Silk Original half gallon"],
  ["Plain Yogurt", "oz", 32, "oz", 2.94, "Walmart", "Great Value Greek Nonfat 32 oz"],
  ["Heavy Whipping Cream", "fl oz", 16, "fl oz", 2.96, "Walmart", "Great Value 16 oz"],

  // ============================================================
  // ACAI TOPPINGS (from Walmart)
  // ============================================================
  ["Mini Chocolate Chips", "oz", 12, "oz", 4.48, "Walmart", "Nestle Toll House Semi-Sweet 12 oz"],
  ["Cacao Nibs", "oz", 8, "oz", 12.29, "Walmart", "Navitas Organics 8 oz"],
  ["Chia Seeds", "oz", 32, "oz", 9.00, "Walmart", "Great Value Organic 32 oz"],
  ["Hemp Seeds", "oz", 16, "oz", 10.97, "Walmart", "Manitoba Harvest Hemp Hearts 16 oz"],
  ["Flax Seeds", "oz", 22, "oz", 6.98, "Walmart", "Great Value Organic Whole 22 oz"],
  ["Goji Berries", "oz", 8, "oz", 11.66, "Walmart", "Navitas Organics 8 oz"],
  ["Oreos", "oz", 14.3, "oz", 4.28, "Walmart", "Oreo Original Cookies"],
  ["Mini M&Ms", "oz", 10, "oz", 4.98, "Walmart", "M&M Milk Chocolate Sharing Size 10 oz"],
  ["Toasted Coconut", "oz", 3.17, "oz", 5.16, "Walmart", "Dang Toasted Coconut Chips 3.17 oz"],
  ["Shredded Coconut", "oz", 14, "oz", 3.92, "Walmart", "Great Value Sweetened Coconut Flakes 14 oz"],
  ["Almond Slivers", "oz", 16, "oz", 8.46, "Walmart", "Great Value Sliced Almonds 16 oz"],
  ["Graham Crackers", "oz", 14.4, "oz", 4.68, "Walmart", "Honey Maid - crushed for Graham Cracker Dust"],
  ["Almond Butter", "oz", 12, "oz", 7.94, "Walmart", "Justin's Classic 12 oz jar"],
  ["Bee Pollen", "oz", 10, "oz", 10.24, "Walmart", "Badia Bee Pollen 10 oz"],
  ["Blue Spirulina", "oz", 3.5, "oz", 14.98, "Walmart", "Powder form - specialty superfood"],
  ["Whipped Cream", "oz", 8, "oz", 2.24, "Walmart", "Cool Whip Original 8 oz tub"],

  // ============================================================
  // SANDWICH/BURRITO - VEGGIES (from Walmart)
  // ============================================================
  ["Tomatoes", "each", 1, "each", 0.23, "Walmart", "Roma tomatoes"],
  ["Spinach", "oz", 10, "oz", 1.84, "Walmart", "Marketside Fresh Spinach 10 oz bag"],
  ["White Onion", "each", 1, "each", 0.88, "Walmart", "Fresh white onion"],
  ["Green Peppers", "each", 1, "each", 0.78, "Walmart", "Fresh green bell pepper"],

  // ============================================================
  // SANDWICH/BURRITO - CHEESE (from Walmart)
  // ============================================================
  ["Sliced Colby Jack", "oz", 16, "oz", 3.58, "Walmart", "Great Value Colby & Monterey Jack 16 oz block"],
  ["Shredded Colby Jack", "oz", 16, "oz", 3.78, "Walmart", "Great Value Shredded Colby Jack 16 oz"],
  ["Feta Cheese Crumbles", "oz", 6, "oz", 4.26, "Walmart", "Athenos Traditional Crumbled Feta 6 oz"],

  // ============================================================
  // SANDWICH/BURRITO - PROTEIN (from Walmart)
  // ============================================================
  ["Chick Peas (Canned)", "oz", 15, "oz", 0.78, "Walmart", "Great Value canned garbanzo beans 15 oz"],

  // ============================================================
  // SANDWICH/BURRITO - DRESSINGS (from Walmart)
  // ============================================================
  ["Mayo", "oz", 30, "oz", 4.28, "Walmart", "Hellmann's Real Mayonnaise 30 oz"],
  ["Vegan Mayo", "oz", 24, "oz", 5.47, "Walmart", "Hellmann's Vegan 24 oz"],
  ["Salsa", "oz", 16, "oz", 2.78, "Walmart", "Great Value Medium Salsa 16 oz"],
  ["Garlic Aioli", "oz", 12, "oz", 3.98, "Walmart", "Store-bought garlic aioli"],
  ["Balsamic Glaze", "fl oz", 12, "fl oz", 3.97, "Walmart", "Colavita Balsamic Glaze 12 fl oz"],
  ["Poppy Seed Dressing", "fl oz", 16, "fl oz", 3.48, "Walmart", "Great Value Poppy Seed Dressing 16 fl oz"],
  ["Raspberry Vinaigrette", "fl oz", 16, "fl oz", 2.98, "Walmart", "Great Value Raspberry Vinaigrette 16 fl oz"],

  // ============================================================
  // SANDWICH/BURRITO - TOPPINGS & SIDES (from Walmart)
  // ============================================================
  ["Candied Nuts", "oz", 8, "oz", 4.48, "Walmart", "Glazed pecans or walnuts"],
  ["Pickle Slices", "oz", 24, "oz", 2.48, "Walmart", "Great Value Hamburger Dill Chips 24 oz"],
  ["Dried Dill", "oz", 0.68, "oz", 3.47, "Walmart", "McCormick Dill Weed 0.68 oz"],
  ["Curry Powder", "oz", 1.75, "oz", 4.36, "Walmart", "McCormick Curry Powder 1.75 oz"],
  ["Raisins", "oz", 20, "oz", 3.97, "Walmart", "Sun-Maid California Raisins 20 oz"],

  // ============================================================
  // BREADS (from Walmart)
  // ============================================================
  ["Gluten-Free Tortillas", "count", 6, "count", 4.98, "Walmart", "Mission GF Tortillas 6 ct"],
  ["Tortillas", "count", 10, "count", 2.98, "Walmart", "Mission Flour Tortillas 10 ct"],

  // ============================================================
  // VEGGIE SOUP INGREDIENTS (from Walmart)
  // ============================================================
  ["Vegetable Soup Base", "oz", 15, "oz", 1.28, "Walmart", "Canned vegetable soup/broth"],
  ["Carrots", "lb", 2, "lb", 1.93, "Walmart", "Fresh Carrots 2 lb bag"],
  ["Celery", "each", 1, "each", 1.97, "Walmart", "Fresh Celery Stalk/bunch"],
  ["Bean Sprouts", "oz", 12, "oz", 2.18, "Walmart", "Fresh bean sprouts"],
  ["Red Peppers", "each", 1, "each", 1.28, "Walmart", "Fresh red bell pepper"],
  ["Kale", "each", 1, "each", 1.48, "Walmart", "Fresh kale bunch"],
  ["Broccoli", "each", 1, "each", 1.48, "Walmart", "Fresh broccoli head"],
  ["Turmeric Powder", "oz", 2.5, "oz", 3.48, "Walmart", "Ground turmeric 2.5 oz"],
  ["Bay Leaves", "oz", 0.12, "oz", 3.97, "Walmart", "McCormick Bay Leaves 0.12 oz"],
  ["Fresh Ginger", "lb", 1, "lb", 3.87, "Walmart", "Fresh ginger root per lb"],

  // ============================================================
  // MISCELLANEOUS (from Walmart)
  // ============================================================
  ["Oatmeal", "oz", 42, "oz", 5.12, "Walmart", "Quaker Old Fashioned Oats 42 oz canister"],
  ["Peanuts", "oz", 16, "oz", 3.48, "Walmart", "Great Value Dry Roasted Peanuts 16 oz"],
  ["Cashews", "oz", 16, "oz", 7.94, "Walmart", "Great Value Whole Cashews 16 oz"],
  ["Olive Oil", "fl oz", 25.5, "fl oz", 5.47, "Walmart", "Great Value Extra Virgin Olive Oil 25.5 fl oz"],
  ["Himalayan Salt", "oz", 26, "oz", 4.97, "Walmart", "Himalayan Pink Salt 26 oz"],
  ["Everything Bagel Seasoning", "oz", 2.6, "oz", 2.38, "Walmart", "Great Value Everything Bagel Seasoning 2.6 oz"],
  ["Maple Syrup", "fl oz", 12.5, "fl oz", 8.97, "Walmart", "Pure maple syrup 12.5 fl oz"],
  ["Butter", "oz", 16, "oz", 3.86, "Walmart", "Great Value Unsalted Butter 16 oz"],
  ["Vegan Butter (Plant Butter)", "oz", 16, "oz", 4.97, "Walmart", "Country Crock Plant Butter 16 oz"],
  ["Brown Sugar", "oz", 32, "oz", 2.44, "Walmart", "Great Value Light Brown Sugar 32 oz"],

  // ============================================================
  // COFFEE BEANS (from Local Roaster)
  // ============================================================
  ["Brazilian Coffee Beans", "lb", 1, "lb", 0, "Local Roaster", "Price TBD - update from roaster invoice"],
  ["Colombian Coffee Beans", "lb", 1, "lb", 0, "Local Roaster", "Price TBD - update from roaster invoice"],
  ["Espresso Beans", "lb", 1, "lb", 0, "Local Roaster", "Price TBD - update from roaster invoice"],
  ["Ethiopian Coffee Beans", "lb", 1, "lb", 0, "Local Roaster", "Price TBD - update from roaster invoice"],
  ["Mayan Decaf Coffee Beans", "lb", 1, "lb", 0, "Local Roaster", "Price TBD - update from roaster invoice"],
  ["Cold Brew Beans", "lb", 1, "lb", 0, "Local Roaster", "Price TBD - update from roaster invoice"],

  // ============================================================
  // LOCAL BREWERS
  // ============================================================
  ["Kombucha", "each", 1, "each", 0, "Local Brewers", "Price TBD - purchased from local brewers"],
  ["Immunity Shots", "each", 1, "each", 0, "Local Brewers", "Price TBD - purchased from local brewers"],
];

// Insert all ingredients
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO ingredients (id, name, unit, cost_per_unit, supplier, package_size, package_unit, package_price, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAll = db.transaction(() => {
  let inserted = 0;
  let skipped = 0;

  for (const [name, unit, pkgSize, pkgUnit, pkgPrice, supplier, notes] of ingredients) {
    const costPerUnit = pkgSize > 0 && pkgPrice > 0
      ? Math.round((pkgPrice / pkgSize) * 10000) / 10000
      : 0;

    const id = uuid();

    // Check if ingredient already exists by name
    const existing = db.prepare("SELECT id FROM ingredients WHERE name = ?").get(name);
    if (existing) {
      skipped++;
      continue;
    }

    insertStmt.run(id, name, unit, costPerUnit, supplier, pkgSize, pkgUnit, pkgPrice, notes);
    inserted++;
  }

  return { inserted, skipped };
});

const result = insertAll();

console.log(`\n✅ Ingredient seeding complete!`);
console.log(`   Inserted: ${result.inserted} ingredients`);
console.log(`   Skipped (already exist): ${result.skipped} ingredients`);
console.log(`   Total in list: ${ingredients.length}`);

// Print summary by supplier
const supplierCounts = db.prepare(`
  SELECT supplier, COUNT(*) as count,
         SUM(CASE WHEN cost_per_unit > 0 THEN 1 ELSE 0 END) as with_price,
         SUM(CASE WHEN cost_per_unit = 0 THEN 1 ELSE 0 END) as needs_price
  FROM ingredients
  GROUP BY supplier
  ORDER BY count DESC
`).all() as { supplier: string; count: number; with_price: number; needs_price: number }[];

console.log(`\n📊 Ingredients by supplier:`);
for (const row of supplierCounts) {
  console.log(`   ${row.supplier}: ${row.count} items (${row.with_price} priced, ${row.needs_price} need price)`);
}

const total = db.prepare("SELECT COUNT(*) as count FROM ingredients").get() as { count: number };
console.log(`\n📦 Total ingredients in database: ${total.count}`);

db.close();
