/**
 * Add Missing Ingredients
 * These are ingredients needed for menu items that weren't in the database yet.
 * Prices from walmart.com (February 2026).
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'porch-financial.db'));

const checkStmt = db.prepare('SELECT id FROM ingredients WHERE name = ?');
const insertStmt = db.prepare(`
  INSERT INTO ingredients (id, name, unit, cost_per_unit, supplier, package_size, package_unit, package_price, ingredient_type, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'food', ?)
`);

const ingredients = [
  // === CHEESE ===
  { name: 'Fresh Mozzarella', unit: 'oz', pkg_size: 8, pkg_unit: 'ball', pkg_price: 4.14, supplier: 'Walmart', notes: 'BelGioioso Fresh Mozzarella Cheese Ball 8 oz. For Caprese sandwich.' },
  { name: 'Swiss Cheese (Sliced)', unit: 'oz', pkg_size: 8, pkg_unit: 'package', pkg_price: 1.67, supplier: 'Walmart', notes: 'Great Value Swiss Deli Style Sliced Cheese 8oz (12 slices).' },
  { name: 'Provolone Cheese (Sliced)', unit: 'oz', pkg_size: 8, pkg_unit: 'package', pkg_price: 2.24, supplier: 'Walmart', notes: 'Great Value Deli Style Sliced Provolone Cheese 8oz (12 slices).' },

  // === PRODUCE ===
  { name: 'Fresh Basil', unit: 'oz', pkg_size: 0.5, pkg_unit: 'clamshell', pkg_price: 1.78, supplier: 'Walmart', notes: 'Fresh Basil 0.5 oz clamshell. For Caprese sandwich.' },
  { name: 'Spring Mix', unit: 'oz', pkg_size: 5, pkg_unit: 'bag', pkg_price: 2.73, supplier: 'Walmart', notes: 'Marketside Spring Mix Salad Blend 5 oz bag. For salads & sandwiches.' },
  { name: 'Romaine Lettuce', unit: 'oz', pkg_size: 12, pkg_unit: 'head', pkg_price: 1.28, supplier: 'Walmart', notes: 'Fresh Romaine Lettuce 1 head (~12 oz). For sandwiches.' },
  { name: 'Red Onion', unit: 'each', pkg_size: 1, pkg_unit: 'each', pkg_price: 0.99, supplier: 'Walmart', notes: 'Fresh Whole Red Onion, Each (~0.8 lb).' },
  { name: 'Cucumber', unit: 'each', pkg_size: 1, pkg_unit: 'each', pkg_price: 0.76, supplier: 'Walmart', notes: 'Fresh Cucumber, Each.' },
  { name: 'Lemons', unit: 'each', pkg_size: 10, pkg_unit: 'bag', pkg_price: 3.92, supplier: 'Walmart', notes: 'Fresh Lemons 2 lb bag (~10 lemons). For juices & drinks.' },
  { name: 'Oranges', unit: 'each', pkg_size: 8, pkg_unit: 'bag', pkg_price: 3.97, supplier: 'Walmart', notes: 'Fresh Navel Oranges 4 lb bag (~8 oranges). For Orange Glow Juice.' },
  { name: 'Beets', unit: 'each', pkg_size: 3, pkg_unit: 'bunch', pkg_price: 2.57, supplier: 'Walmart', notes: 'Fresh Beets 1 bunch (3 beets). For Beet Boost Juice.' },
  { name: 'Apples', unit: 'each', pkg_size: 1, pkg_unit: 'each', pkg_price: 0.78, supplier: 'Walmart', notes: 'Fresh Apple. For juices.' },

  // === SWEETENERS & SYRUPS ===
  { name: 'Honey', unit: 'fl oz', pkg_size: 16, pkg_unit: 'bottle', pkg_price: 6.27, supplier: 'Walmart', notes: 'Great Value Clover Honey 16 oz. For bowls, Honey & Oats Latte, Honey Crack Chicken Salad.' },

  // === COFFEE/TEA SPECIALTY ===
  { name: 'Matcha Powder', unit: 'oz', pkg_size: 3.5, pkg_unit: 'pouch', pkg_price: 8.64, supplier: 'Walmart', notes: 'Jade Leaf Organic Matcha Latte Mix 3.5 oz. For Matcha Latte.' },

  // === SUPPLEMENTS / ADD-INS ===
  { name: 'Plant Protein Powder', unit: 'oz', pkg_size: 16.32, pkg_unit: 'container', pkg_price: 19.98, supplier: 'Walmart', notes: 'Orgain Organic Vegan Protein Powder 1.02 lb. For smoothie add-in & Protein Bowl.' },
  { name: 'Power Greens Powder', unit: 'oz', pkg_size: 7, pkg_unit: 'container', pkg_price: 35.99, supplier: 'Walmart', notes: 'Power Greens Plant Based Superfood Green Powder 7 oz. For smoothie add-in.' },

  // === DAIRY / ALT MILK ===
  { name: 'Coconut Milk', unit: 'fl oz', pkg_size: 64, pkg_unit: 'carton', pkg_price: 3.98, supplier: 'Walmart', notes: 'Silk Original Coconut Milk 64 fl oz. For drinks & lattes.' },
  { name: 'Coconut Cream', unit: 'fl oz', pkg_size: 13.66, pkg_unit: 'can', pkg_price: 4.68, supplier: 'Walmart', notes: 'Thai Kitchen Coconut Cream 13.66 fl oz. For bowls.' },

  // === SPICES & EXTRACTS ===
  { name: 'Ground Cinnamon', unit: 'oz', pkg_size: 2.5, pkg_unit: 'container', pkg_price: 1.38, supplier: 'Walmart', notes: 'Great Value Ground Cinnamon 2.5 oz.' },
  { name: 'Vanilla Extract', unit: 'fl oz', pkg_size: 2, pkg_unit: 'bottle', pkg_price: 5.72, supplier: 'Walmart', notes: 'Great Value Pure Vanilla Extract 2 fl oz.' },

  // === VINEGAR ===
  { name: 'Apple Cider Vinegar', unit: 'fl oz', pkg_size: 32, pkg_unit: 'bottle', pkg_price: 2.12, supplier: 'Walmart', notes: 'Great Value Apple Cider Vinegar 32 fl oz.' },

  // === DRIED FRUIT / NUTS ===
  { name: 'Dried Cranberries', unit: 'oz', pkg_size: 12, pkg_unit: 'pouch', pkg_price: 3.98, supplier: 'Walmart', notes: 'Ocean Spray Craisins Original Dried Cranberries 12 oz.' },
  { name: 'Pecans', unit: 'oz', pkg_size: 16, pkg_unit: 'bag', pkg_price: 7.98, supplier: 'Walmart', notes: 'Great Value Pecan Halves 16 oz. For salads & bowls.' },

  // === BREAD ===
  { name: 'Sourdough Bread', unit: 'oz', pkg_size: 24, pkg_unit: 'loaf', pkg_price: 3.98, supplier: 'Walmart', notes: 'Freshness Guaranteed Sliced Sourdough Bread 24 oz. For sandwiches & toast.' },

  // === HOMEMADE NUT BUTTERS ===
  { name: 'Cashew Butter (Homemade)', unit: 'oz', pkg_size: 1, pkg_unit: 'oz', pkg_price: 0, supplier: 'Homemade', notes: 'NEEDS REAL PRICE - Made from raw cashews. Cost = raw cashew cost + processing. For bowls.' },
  { name: 'Peanut Butter (Homemade)', unit: 'oz', pkg_size: 1, pkg_unit: 'oz', pkg_price: 0, supplier: 'Homemade', notes: 'NEEDS REAL PRICE - Made from raw peanuts. Cost = raw peanut cost + processing. For smoothies & bowls.' },
];

let added = 0;
let skipped = 0;

for (const ing of ingredients) {
  const existing = checkStmt.get(ing.name);
  if (existing) {
    console.log(`  SKIP (exists): ${ing.name}`);
    skipped++;
    continue;
  }

  const costPerUnit = ing.pkg_price > 0 ? ing.pkg_price / ing.pkg_size : 0;

  insertStmt.run(
    randomUUID(),
    ing.name,
    ing.unit,
    costPerUnit,
    ing.supplier,
    ing.pkg_size,
    ing.pkg_unit,
    ing.pkg_price,
    ing.notes
  );

  const priceStr = costPerUnit > 0 ? `$${costPerUnit.toFixed(4)}/${ing.unit}` : '(needs price)';
  console.log(`  ADDED: ${ing.name} - ${priceStr} (${ing.pkg_size} ${ing.pkg_unit} @ $${ing.pkg_price})`);
  added++;
}

// Summary
const total = (db.prepare('SELECT COUNT(*) as c FROM ingredients').get() as any).c;
const food = (db.prepare("SELECT COUNT(*) as c FROM ingredients WHERE ingredient_type = 'food'").get() as any).c;
const withPrice = (db.prepare('SELECT COUNT(*) as c FROM ingredients WHERE cost_per_unit > 0').get() as any).c;

console.log(`\n=== SUMMARY ===`);
console.log(`Added: ${added} | Skipped: ${skipped}`);
console.log(`Total ingredients: ${total} (${food} food, ${total - food} packaging)`);
console.log(`With prices: ${withPrice} | Needs prices: ${total - withPrice}`);

db.close();
