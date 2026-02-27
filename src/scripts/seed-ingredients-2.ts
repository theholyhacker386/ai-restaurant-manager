/**
 * Seed script #2: Adds ingredients from Webstaurant, Quantum, Restaurant Depot,
 * and Bubble Tea suppliers. Also fixes supplier assignments from seed #1.
 *
 * Run with: npx tsx src/scripts/seed-ingredients-2.ts
 */
import Database from "better-sqlite3";
import path from "path";
import { v4 as uuid } from "uuid";

const DB_PATH = path.join(process.cwd(), "porch-financial.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ============================================================
// STEP 1: Fix suppliers for items that come from other places
// (not Walmart as originally loaded)
// ============================================================
const supplierFixes: [string, string, string][] = [
  // [ingredient name, correct supplier, notes]
  // Frozen fruit comes from What Chefs Want (already correct from seed-1)
  // These items are actually from Quantum, not Walmart:
];

// Note: Granola, Toasted Coconut, Graham Crackers appear on BOTH
// Walmart and Quantum lists. Jennifer may buy from both.
// We'll keep the Walmart entries and add Quantum versions separately
// for items that are clearly different (bulk/commercial vs retail).

// ============================================================
// STEP 2: Add new ingredients from other suppliers
// ============================================================
type IngredientRow = [string, string, number, string, number, string, string];

const newIngredients: IngredientRow[] = [

  // ============================================================
  // RESTAURANT DEPOT - Proteins & Bulk Items
  // ============================================================
  ["Chicken Breast (Bulk)", "lb", 10, "lb", 0, "Restaurant Depot", "2 bags - bulk frozen chicken breast"],
  ["Bacon (Bulk)", "lb", 5, "lb", 0, "Restaurant Depot", "1 pack - bulk bacon"],
  ["Jumbo Tortillas", "count", 12, "count", 0, "Restaurant Depot", "1 pack jumbo flour tortillas"],
  ["Pesto (Bulk)", "oz", 30, "oz", 0, "Restaurant Depot", "2 containers - bulk basil pesto"],
  ["Roasted Pork", "lb", 5, "lb", 0, "Restaurant Depot", "1 pack - for sandwiches"],
  ["Ham", "lb", 5, "lb", 0, "Restaurant Depot", "1 pack - for sandwiches"],

  // ============================================================
  // QUANTUM - Acai, Smoothie Base, Bulk Toppings
  // ============================================================
  ["Acai Puree (Sweet)", "each", 1, "case", 0, "Quantum", "Sweet acai puree packs - 2 cases"],
  ["Acai Puree (Unsweetened)", "each", 1, "case", 0, "Quantum", "Unsweetened acai puree packs - 1 case"],
  ["Dragon Fruit Puree", "each", 1, "case", 0, "Quantum", "Pitaya/dragon fruit puree packs"],
  ["Granola (Bulk)", "oz", 1, "bag", 0, "Quantum", "Bulk granola - 1 bag"],
  ["Toasted Coconut Chips (Bulk)", "oz", 1, "bag", 0, "Quantum", "Bulk toasted coconut chips"],
  ["Graham Cracker Dust (Bulk)", "oz", 1, "bag", 0, "Quantum", "Pre-ground graham cracker dust"],
  ["Wheat/Seeds Bread", "loaf", 6, "loaf", 0, "Quantum", "Wheat and seeds bread - 6 loaves"],
  ["Kettle Chips", "box", 2, "box", 0, "Quantum", "Kettle chips for sides - 2 boxes"],

  // ============================================================
  // WEBSTAURANT - Bulk Beverages & Sauces
  // ============================================================
  ["Oat Milk (Bulk)", "each", 8, "carton", 0, "Webstaurant", "Oat milk - 8 cartons"],
  ["Almond Milk (Bulk)", "each", 6, "carton", 0, "Webstaurant", "Almond milk - 6 cartons"],
  ["Chai Tea Latte Concentrate", "each", 6, "carton", 0, "Webstaurant", "Chai tea latte concentrate - 6 cartons"],
  ["Nutella (Bulk)", "oz", 1, "container", 0, "Webstaurant", "Large Nutella container"],
  ["Chocolate Sauce", "oz", 1, "container", 0, "Webstaurant", "Chocolate sauce - 1/2 container size"],
  ["White Chocolate Sauce", "oz", 1, "container", 0, "Webstaurant", "White chocolate/mocha sauce"],
  ["Caramel Sauce", "oz", 1, "container", 0, "Webstaurant", "Caramel sauce for drinks"],
  ["Coconut Sauce", "oz", 1, "container", 0, "Webstaurant", "Coconut flavoring sauce"],
  ["Vanilla Sauce", "oz", 1, "container", 0, "Webstaurant", "Vanilla sauce for drinks"],
  ["Mocha Sauce", "oz", 1, "container", 0, "Webstaurant", "Mocha sauce for drinks"],
  ["Lavender Syrup", "fl oz", 1, "bottle", 0, "Webstaurant", "Lavender flavoring syrup"],
  ["Agave", "fl oz", 1, "bottle", 0, "Webstaurant", "Agave sweetener"],

  // ============================================================
  // BUBBLE TEA - Bursting Boba
  // ============================================================
  ["Bursting Boba - Strawberry", "each", 1, "container", 0, "Bubble Tea Supplier", "Strawberry bursting boba pearls"],
  ["Bursting Boba - Peach", "each", 1, "container", 0, "Bubble Tea Supplier", "Peach bursting boba pearls"],
  ["Bursting Boba - Kiwi", "each", 1, "container", 0, "Bubble Tea Supplier", "Kiwi bursting boba pearls"],

  // ============================================================
  // BUBBLE TEA - Powders
  // ============================================================
  ["Taro Powder", "each", 3, "bag", 0, "Bubble Tea Supplier", "Taro bubble tea powder"],
  ["Strawberry Powder", "each", 3, "bag", 0, "Bubble Tea Supplier", "Strawberry bubble tea powder"],
  ["Crème Brûlée Powder", "each", 2, "bag", 0, "Bubble Tea Supplier", "Crème brûlée bubble tea powder"],
  ["Honeydew Powder", "each", 2, "bag", 0, "Bubble Tea Supplier", "Honeydew bubble tea powder"],

  // ============================================================
  // BUBBLE TEA - Flavoring Syrups
  // ============================================================
  ["Strawberry Syrup", "each", 3, "bottle", 0, "Bubble Tea Supplier", "Strawberry flavoring syrup for bubble tea"],
  ["Brown Sugar Syrup", "each", 3, "bottle", 0, "Bubble Tea Supplier", "Brown sugar syrup for bubble tea"],
  ["Mango Syrup", "each", 2, "bottle", 0, "Bubble Tea Supplier", "Mango flavoring syrup for bubble tea"],
  ["Peach Syrup", "each", 2, "bottle", 0, "Bubble Tea Supplier", "Peach flavoring syrup for bubble tea"],
  ["Honeydew Syrup", "each", 2, "bottle", 0, "Bubble Tea Supplier", "Honeydew flavoring syrup for bubble tea"],
  ["Lemon Syrup", "each", 2, "bottle", 0, "Bubble Tea Supplier", "Lemon flavoring syrup for bubble tea"],
  ["Passion Fruit Syrup", "each", 2, "bottle", 0, "Bubble Tea Supplier", "Passion fruit flavoring syrup for bubble tea"],
];

// Insert all new ingredients
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO ingredients (id, name, unit, cost_per_unit, supplier, package_size, package_unit, package_price, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAll = db.transaction(() => {
  let inserted = 0;
  let skipped = 0;

  for (const [name, unit, pkgSize, pkgUnit, pkgPrice, supplier, notes] of newIngredients) {
    const costPerUnit = pkgSize > 0 && pkgPrice > 0
      ? Math.round((pkgPrice / pkgSize) * 10000) / 10000
      : 0;

    // Check if ingredient already exists by name
    const existing = db.prepare("SELECT id FROM ingredients WHERE name = ?").get(name) as { id: string } | undefined;
    if (existing) {
      skipped++;
      continue;
    }

    const id = uuid();
    insertStmt.run(id, name, unit, costPerUnit, supplier, pkgSize, pkgUnit, pkgPrice, notes);
    inserted++;
  }

  return { inserted, skipped };
});

const result = insertAll();

console.log(`\n✅ Additional ingredients seeded!`);
console.log(`   Inserted: ${result.inserted} new ingredients`);
console.log(`   Skipped (already exist): ${result.skipped} ingredients`);

// Print summary by supplier
const supplierCounts = db.prepare(`
  SELECT supplier, COUNT(*) as count,
         SUM(CASE WHEN cost_per_unit > 0 THEN 1 ELSE 0 END) as with_price,
         SUM(CASE WHEN cost_per_unit = 0 THEN 1 ELSE 0 END) as needs_price
  FROM ingredients
  GROUP BY supplier
  ORDER BY count DESC
`).all() as { supplier: string; count: number; with_price: number; needs_price: number }[];

console.log(`\n📊 ALL ingredients by supplier:`);
for (const row of supplierCounts) {
  console.log(`   ${row.supplier}: ${row.count} items (${row.with_price} priced, ${row.needs_price} need price)`);
}

const total = db.prepare("SELECT COUNT(*) as count FROM ingredients").get() as { count: number };
console.log(`\n📦 Total ingredients in database: ${total.count}`);

db.close();
