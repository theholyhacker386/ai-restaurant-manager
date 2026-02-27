/**
 * Seed Paper Goods / Packaging Ingredients
 *
 * These are the cups, lids, bowls, straws, etc. that go with each menu item.
 * Prices marked "FROM INVOICE" are real prices from Jennifer's Webstaurant orders.
 * Prices marked "ESTIMATE" are industry-standard estimates - update when invoices available.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'porch-financial.db'));

const paperGoods = [
  // ===== HOT CUPS =====
  {
    name: '8oz Hot Cup',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 36.99,
    notes: 'ESTIMATE - Choice 8oz White Paper Hot Cup 1000/Case. For espresso, cortado, cappuccino.',
  },
  {
    name: '12oz Hot Cup',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 44.99,
    notes: 'ESTIMATE - Choice 12oz White Paper Hot Cup 1000/Case. For 12oz lattes, chai, golden milk.',
  },
  {
    name: '16oz Hot Cup',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 54.99,
    notes: 'ESTIMATE - Choice 16oz White Paper Hot Cup 1000/Case. For 16oz lattes, french press.',
  },
  {
    name: 'Hot Cup Lid (8oz)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 22.99,
    notes: 'ESTIMATE - Choice 8oz Hot Cup Travel Lid 1000/Case.',
  },
  {
    name: 'Hot Cup Lid (10-24oz)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 26.99,
    notes: 'ESTIMATE - Choice Black Hot Cup Travel Lid fits 10-24oz 1000/Case.',
  },
  {
    name: 'Cup Sleeve',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 28.99,
    notes: 'ESTIMATE - Traditional Paper Cup Sleeve for 8-12oz 1000/Case.',
  },

  // ===== COLD CUPS =====
  {
    name: '16oz Cold Cup (Clear)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 64.99,
    notes: 'ESTIMATE - Choice 16oz Clear PET Plastic Cold Cup 1000/Case. For 16oz cold brew, iced drinks, kombucha.',
  },
  {
    name: '20oz Cold Cup (Clear)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 600,
    package_unit: 'case',
    package_price: 49.99,
    notes: 'ESTIMATE - Choice 20oz Clear PET Plastic Cold Cup 600/Case. For 20oz cold brew, smoothies, bubble tea.',
  },
  {
    name: 'Cold Cup Flat Lid (16-24oz)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 29.99,
    notes: 'ESTIMATE - Choice Flat Lid with Straw Slot for 16-24oz 1000/Case.',
  },
  {
    name: 'Cold Cup Dome Lid (16-24oz)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 44.99,
    notes: 'ESTIMATE - Choice Dome Lid for 16-24oz cups 1000/Case. For smoothies, blended drinks.',
  },

  // ===== STRAWS =====
  {
    name: 'Regular Straw',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 500,
    package_unit: 'box',
    package_price: 7.99,
    notes: 'ESTIMATE - Choice wrapped straw 500/box. For cold brew, iced coffee, juice.',
  },
  {
    name: 'Wide/Boba Straw',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 500,
    package_unit: 'box',
    package_price: 13.49,
    notes: 'ESTIMATE - Wide straw for smoothies & bubble tea 500/box.',
  },

  // ===== BOWLS & LIDS (Acai / Signature Bowls / Oat Bowl / Yogurt) =====
  {
    name: 'Acai Bowl Container (24oz)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 252,
    package_unit: 'case',
    package_price: 54.99,
    notes: 'ESTIMATE - Dart PresentaBowls 24oz Clear Plastic Bowl 252/Case.',
  },
  {
    name: 'Bowl Dome Lid',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 252,
    package_unit: 'case',
    package_price: 39.99,
    notes: 'ESTIMATE - Dart PresentaBowls Dome Lid 252/Case.',
  },
  {
    name: 'Bowl Spoon',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 15.99,
    notes: 'ESTIMATE - Medium weight disposable spoon 1000/Case.',
  },

  // ===== SANDWICH / TOAST PACKAGING =====
  {
    name: 'Take-Out Container',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 160,
    package_unit: 'case',
    package_price: 43.99,
    notes: 'FROM INVOICE - Choice Black Microwavable Folded Paper #4 Take-Out Container 160/Case. For sandwiches, toast.',
  },

  // ===== SALAD CONTAINERS =====
  {
    name: 'Salad Bowl Container (32oz)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 252,
    package_unit: 'case',
    package_price: 62.99,
    notes: 'ESTIMATE - Clear plastic salad bowl 32oz with lid 252/Case.',
  },
  {
    name: 'Salad Fork',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 14.99,
    notes: 'ESTIMATE - Medium weight disposable fork 1000/Case.',
  },

  // ===== IMMUNITY SHOT CUPS =====
  {
    name: '2oz Portion Cup',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 2500,
    package_unit: 'case',
    package_price: 26.99,
    notes: 'ESTIMATE - Choice 2oz Translucent Portion Cup 2500/Case. For 2oz immunity shots.',
  },
  {
    name: '2oz Portion Cup Lid',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 2500,
    package_unit: 'case',
    package_price: 19.99,
    notes: 'ESTIMATE - Choice Portion Cup Lid fits 1.5-2.5oz 2500/Case.',
  },

  // ===== PLATES =====
  {
    name: '6" Black Plastic Plate',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 120,
    package_unit: 'case',
    package_price: 32.49,
    notes: 'FROM INVOICE - Visions Square 6" Black Plastic Plate 120/Case. For muffins, pastries.',
  },

  // ===== NAPKINS (already have from invoice but adding as paper good) =====
  {
    name: 'Napkin',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 6000,
    package_unit: 'case',
    package_price: 47.49,
    notes: 'FROM INVOICE - Just1 Interfold Dispenser Napkin 6000/Case.',
  },

  // ===== GLOVES =====
  {
    name: 'Vinyl Glove',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 25.99,
    notes: 'FROM INVOICE - Noble Powder-Free Disposable Clear Vinyl Gloves Large 1000/Case. 1 per acai bowl.',
  },

  // ===== JUICE CUPS =====
  {
    name: '16oz Juice Cup (Clear)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 64.99,
    notes: 'ESTIMATE - Same as 16oz Cold Cup. For fresh juices.',
  },

  // ===== KOMBUCHA CUPS =====
  {
    name: '12oz Cold Cup (Clear)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 52.99,
    notes: 'ESTIMATE - Choice 12oz Clear PET Plastic Cold Cup 1000/Case. For 12oz kombucha.',
  },
  {
    name: 'Cold Cup Flat Lid (12-14oz)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 25.99,
    notes: 'ESTIMATE - Choice Flat Lid with Straw Slot for 12-14oz 1000/Case.',
  },

  // ===== COFFEE FLIGHT =====
  {
    name: '4oz Espresso Cup',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 1000,
    package_unit: 'case',
    package_price: 29.99,
    notes: 'ESTIMATE - Choice 4oz White Paper Hot Cup 1000/Case. For coffee flights, espresso.',
  },

  // ===== GROWLER (KOMBUCHA) =====
  {
    name: 'Growler Cup (32oz)',
    unit: 'each',
    supplier: 'Webstaurant',
    package_size: 500,
    package_unit: 'case',
    package_price: 59.99,
    notes: 'ESTIMATE - 32oz Clear PET Cold Cup 500/Case. For kombucha growlers.',
  },
];

// Insert paper goods
const insertStmt = db.prepare(`
  INSERT INTO ingredients (id, name, unit, cost_per_unit, supplier, package_size, package_unit, package_price, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const checkStmt = db.prepare('SELECT id FROM ingredients WHERE name = ?');

let inserted = 0;
let skipped = 0;

for (const item of paperGoods) {
  const existing = checkStmt.get(item.name);
  if (existing) {
    console.log(`  SKIP (exists): ${item.name}`);
    skipped++;
    continue;
  }

  const costPerUnit = item.package_price / item.package_size;

  insertStmt.run(
    randomUUID(),
    item.name,
    item.unit,
    costPerUnit,
    item.supplier,
    item.package_size,
    item.package_unit,
    item.package_price,
    item.notes
  );
  console.log(`  ADDED: ${item.name} - $${costPerUnit.toFixed(4)}/each (${item.package_size}/${item.package_unit} @ $${item.package_price})`);
  inserted++;
}

console.log(`\n=== PAPER GOODS SUMMARY ===`);
console.log(`Added: ${inserted}`);
console.log(`Skipped (already existed): ${skipped}`);

// Show all paper goods with their per-unit costs
console.log(`\n=== ALL PAPER GOODS IN DATABASE ===`);
const allPaper = db.prepare(`
  SELECT name, cost_per_unit, package_size, package_unit, package_price, notes
  FROM ingredients
  WHERE name LIKE '%Cup%' OR name LIKE '%Lid%' OR name LIKE '%Bowl%' OR name LIKE '%Plate%'
    OR name LIKE '%Napkin%' OR name LIKE '%Fork%' OR name LIKE '%Straw%' OR name LIKE '%Sleeve%'
    OR name LIKE '%Container%' OR name LIKE '%Spoon%' OR name LIKE '%Glove%' OR name LIKE '%Growler%'
    OR name LIKE '%Portion%'
  ORDER BY name
`).all() as any[];

for (const item of allPaper) {
  const source = item.notes?.includes('FROM INVOICE') ? '✓ REAL' : '~ EST';
  console.log(`  [${source}] ${item.name}: $${item.cost_per_unit.toFixed(4)}/each (${item.package_size}/${item.package_unit} @ $${item.package_price})`);
}

// Total ingredient count
const total = db.prepare('SELECT COUNT(*) as count FROM ingredients').get() as any;
console.log(`\nTotal ingredients in database: ${total.count}`);

db.close();
