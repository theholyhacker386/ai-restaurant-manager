/**
 * BUILD RECIPES - Links packaging & ingredients to menu items
 *
 * Part 1: Update syrups transitioning to Holy Kakao (real prices from baristaunderground.com)
 * Part 2: Add raw cashews & peanuts (Jennifer makes her own nut butters)
 * Part 3: Create ALL packaging recipes (cups, lids, straws, bowls, etc.)
 *
 * NOTE: Only PACKAGING quantities are added here (these are factual: 1 cup per drink, etc.)
 * Food ingredient quantities (how many oz of acai per bowl, etc.) need Jennifer's confirmation.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'porch-financial.db'));

// ============================================================
// PART 1: UPDATE SYRUPS TO HOLY KAKAO
// Prices from baristaunderground.com - REAL listed prices
// Holy Kakao syrups: $22.99 per 750mL bottle (25.36 fl oz)
// Holy Kakao Chocolate Sauce: $36.26 per 64oz bottle
// ============================================================
console.log('=== PART 1: UPDATING SYRUPS TO HOLY KAKAO ===\n');

const holyKakaoSyrupPrice = 22.99; // per 750mL bottle
const holyKakaoSyrupSize = 25.36; // 750mL in fl oz
const holyKakaoChocSaucePrice = 36.26; // per 64oz bottle
const holyKakaoChocSauceSize = 64; // fl oz

// Syrups transitioning to Holy Kakao (coffee/drink syrups, NOT bubble tea Bossen syrups)
const syrupUpdates = [
  {
    name: 'Lavender Syrup',
    package_price: holyKakaoSyrupPrice,
    package_size: holyKakaoSyrupSize,
    supplier: 'Barista Underground',
    notes: 'Holy Kakao Lavender Syrup 750mL - from baristaunderground.com ($22.99/bottle)',
  },
  {
    name: 'Mocha Sauce',
    package_price: holyKakaoChocSaucePrice,
    package_size: holyKakaoChocSauceSize,
    supplier: 'Barista Underground',
    unit: 'fl oz',
    notes: 'Holy Kakao Chocolate Sauce 64 fl oz - used for Mocha drinks. From baristaunderground.com ($36.26/bottle)',
  },
];

const updateSyrupStmt = db.prepare(`
  UPDATE ingredients
  SET supplier = ?, package_price = ?, package_size = ?, cost_per_unit = ?, unit = COALESCE(?, unit), notes = ?, updated_at = datetime('now')
  WHERE name = ?
`);

for (const s of syrupUpdates) {
  const costPerUnit = s.package_price / s.package_size;
  updateSyrupStmt.run(s.supplier, s.package_price, s.package_size, costPerUnit, s.unit || null, s.notes, s.name);
  console.log(`  Updated: ${s.name} → Holy Kakao $${costPerUnit.toFixed(4)}/fl oz ($${s.package_price}/${s.package_size} fl oz)`);
}

// Update bubble tea syrups to note they're Bossen brand (still from Webstaurant)
const bossenSyrups = ['Lemon Syrup', 'Mango Syrup', 'Passion Fruit Syrup', 'Peach Syrup'];
const updateBossenStmt = db.prepare(`
  UPDATE ingredients SET notes = ?, unit = 'fl oz', updated_at = datetime('now') WHERE name = ?
`);
for (const name of bossenSyrups) {
  updateBossenStmt.run(`NEEDS REAL PRICE - Bossen ${name.replace(' Syrup', '')} Concentrated Syrup 64 fl oz. Bought from Webstaurant.`, name);
  console.log(`  Noted: ${name} → Bossen brand (needs invoice price)`);
}

console.log('');

// ============================================================
// PART 2: ADD RAW CASHEWS & PEANUTS
// Jennifer makes her own cashew butter and peanut butter from raw nuts
// ============================================================
console.log('=== PART 2: ADDING RAW NUTS FOR HOMEMADE NUT BUTTERS ===\n');

const checkIngredient = db.prepare('SELECT id FROM ingredients WHERE name = ?');
const insertIngredient = db.prepare(`
  INSERT INTO ingredients (id, name, unit, cost_per_unit, supplier, package_size, package_unit, package_price, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const newIngredients = [
  {
    name: 'Raw Cashews',
    unit: 'oz',
    supplier: 'Walmart',
    package_size: 1,
    package_unit: 'bag',
    package_price: 0,
    notes: 'NEEDS REAL PRICE - Raw cashews from Walmart. Jennifer makes homemade cashew butter.',
  },
  {
    name: 'Raw Peanuts',
    unit: 'oz',
    supplier: 'Walmart',
    package_size: 1,
    package_unit: 'bag',
    package_price: 0,
    notes: 'NEEDS REAL PRICE - Raw peanuts from Walmart. Jennifer makes homemade peanut butter.',
  },
];

for (const ing of newIngredients) {
  const existing = checkIngredient.get(ing.name);
  if (existing) {
    console.log(`  SKIP (exists): ${ing.name}`);
  } else {
    insertIngredient.run(randomUUID(), ing.name, ing.unit, 0, ing.supplier, ing.package_size, ing.package_unit, ing.package_price, ing.notes);
    console.log(`  ADDED: ${ing.name} (needs receipt price from Walmart)`);
  }
}

console.log('');

// ============================================================
// PART 3: BUILD PACKAGING RECIPES
// Links every menu item to its packaging (cups, lids, straws, etc.)
// These are FACTS: every 16oz cold drink gets 1 cup, 1 lid, etc.
// ============================================================
console.log('=== PART 3: BUILDING PACKAGING RECIPES ===\n');

// Helper: get ingredient ID by name
const ingredientCache: Record<string, string> = {};
function getIngId(name: string): string {
  if (ingredientCache[name]) return ingredientCache[name];
  const row = db.prepare('SELECT id FROM ingredients WHERE name = ?').get(name) as any;
  if (!row) {
    console.log(`  WARNING: Ingredient not found: "${name}"`);
    return '';
  }
  ingredientCache[name] = row.id;
  return row.id;
}

// Recipe insert statement
const insertRecipe = db.prepare(`
  INSERT INTO recipes (id, menu_item_id, ingredient_id, quantity, quantity_unit, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Clear existing recipes first (fresh start)
db.prepare('DELETE FROM recipes').run();
console.log('  Cleared existing recipes (fresh start)\n');

let recipeCount = 0;

function addRecipe(menuItemId: string, ingredientName: string, qty: number, unit: string, notes: string = '') {
  const ingId = getIngId(ingredientName);
  if (!ingId) return;
  insertRecipe.run(randomUUID(), menuItemId, ingId, qty, unit, notes);
  recipeCount++;
}

// ─────────────────────────────────────────
// SANDWICHES - 6 items
// Packaging: Take-Out Container (50%), 3 Napkins
// ─────────────────────────────────────────
const sandwichIds = [
  'mi-sandwiches-0', // Chicken Avo
  'mi-sandwiches-1', // Chick-Pea Smash
  'mi-sandwiches-2', // Chicken Salad Sandwich
  'mi-sandwiches-3', // Caprese Explosion
  'mi-sandwiches-4', // Grilled Cheese
  'mi-sandwiches-5', // Chicken Curry Sandwich
];

for (const id of sandwichIds) {
  addRecipe(id, 'Take-Out Container', 0.5, 'each', '~50% of customers take out');
  addRecipe(id, 'Napkin', 3, 'each', '2-3 napkins per customer');
}
console.log(`  Sandwiches: 6 items × 2 packaging items = ${sandwichIds.length * 2} recipes`);

// ─────────────────────────────────────────
// SALADS - 2 items
// Packaging: 24oz Bowl + Dome Lid + Spoon + 3 Napkins
// ─────────────────────────────────────────
const saladIds = [
  'mi-salads-7', // Honey Crack Chicken Salad
  'mi-salads-8', // Berry Healthy Salad
];

for (const id of saladIds) {
  addRecipe(id, '24oz Bowl Container', 1, 'each', '');
  addRecipe(id, 'Bowl Dome Lid', 1, 'each', '');
  addRecipe(id, 'Bowl Spoon', 1, 'each', '');
  addRecipe(id, 'Napkin', 3, 'each', '');
}
console.log(`  Salads: 2 items × 4 packaging items = ${saladIds.length * 4} recipes`);

// ─────────────────────────────────────────
// SIGNATURE BOWLS - 5 items (all acai-based)
// Packaging: 16oz Acai Bowl + Dome Lid + Spoon + 1 Glove + 3 Napkins
// ─────────────────────────────────────────
const signatureBowlIds = [
  'mi-signature-bowls-9',  // The Protein Bowl
  'mi-signature-bowls-10', // The Porch Bowl
  'mi-signature-bowls-11', // Tropical Bowl
  'mi-signature-bowls-12', // Island Time Bowl
  'mi-signature-bowls-13', // Cracked Coconut Bowl
];

for (const id of signatureBowlIds) {
  addRecipe(id, '16oz Acai Bowl Container', 1, 'each', '');
  addRecipe(id, 'Bowl Dome Lid', 1, 'each', '');
  addRecipe(id, 'Bowl Spoon', 1, 'each', '');
  addRecipe(id, 'Vinyl Glove', 1, 'each', '1 glove per acai bowl');
  addRecipe(id, 'Napkin', 3, 'each', '');
}
console.log(`  Signature Bowls: 5 items × 5 packaging items = ${signatureBowlIds.length * 5} recipes`);

// ─────────────────────────────────────────
// BUILD YOUR OWN BOWL - 1 item (acai-based)
// Packaging: same as signature bowls
// ─────────────────────────────────────────
const byobId = 'mi-byob-14';
addRecipe(byobId, '16oz Acai Bowl Container', 1, 'each', '');
addRecipe(byobId, 'Bowl Dome Lid', 1, 'each', '');
addRecipe(byobId, 'Bowl Spoon', 1, 'each', '');
addRecipe(byobId, 'Vinyl Glove', 1, 'each', '1 glove per acai bowl');
addRecipe(byobId, 'Napkin', 3, 'each', '');
console.log(`  Build Your Own Bowl: 1 item × 5 packaging items = 5 recipes`);

// ─────────────────────────────────────────
// OTHER BOWLS - 2 items (NOT acai-based, no glove)
// Packaging: 16oz Bowl + Dome Lid + Spoon + 2 Napkins
// ─────────────────────────────────────────
const otherBowlIds = [
  'mi-other-bowls-15', // Yogurt Parfait
  'mi-other-bowls-16', // Oat Bowl
];

for (const id of otherBowlIds) {
  addRecipe(id, '16oz Acai Bowl Container', 1, 'each', 'Using same 16oz bowl');
  addRecipe(id, 'Bowl Dome Lid', 1, 'each', '');
  addRecipe(id, 'Bowl Spoon', 1, 'each', '');
  addRecipe(id, 'Napkin', 2, 'each', '');
}
console.log(`  Other Bowls: 2 items × 4 packaging items = ${otherBowlIds.length * 4} recipes`);

// ─────────────────────────────────────────
// TOAST - 2 items
// Packaging: Take-Out Container (50%), 2 Napkins
// ─────────────────────────────────────────
const toastIds = [
  'mi-toast-17', // Avocado Toast
  'mi-toast-18', // Protein Toast
];

for (const id of toastIds) {
  addRecipe(id, 'Take-Out Container', 0.5, 'each', '~50% takeout');
  addRecipe(id, 'Napkin', 2, 'each', '');
}
console.log(`  Toast: 2 items × 2 packaging items = ${toastIds.length * 2} recipes`);

// ─────────────────────────────────────────
// COFFEE - 9 items (various cup sizes)
// Espresso & Cortado: ceramic mugs (no disposable packaging)
// ─────────────────────────────────────────

// Espresso (ceramic only - just napkin)
addRecipe('mi-coffee-21', 'Napkin', 1, 'each', 'Served in ceramic mug');
// Americano (12oz hot)
addRecipe('mi-coffee-22', '12oz Hot Cup', 1, 'each', '');
addRecipe('mi-coffee-22', 'Hot Cup Lid (10-24oz)', 1, 'each', '');
addRecipe('mi-coffee-22', 'Cup Sleeve', 0.5, 'each', '~50% of customers use sleeve');
addRecipe('mi-coffee-22', 'Napkin', 1, 'each', '');
// Cappuccino (8oz hot)
addRecipe('mi-coffee-23', '8oz Hot Cup', 1, 'each', '');
addRecipe('mi-coffee-23', 'Hot Cup Lid (8oz)', 1, 'each', '');
addRecipe('mi-coffee-23', 'Napkin', 1, 'each', '');
// Latte 12oz
addRecipe('mi-coffee-24', '12oz Hot Cup', 1, 'each', '');
addRecipe('mi-coffee-24', 'Hot Cup Lid (10-24oz)', 1, 'each', '');
addRecipe('mi-coffee-24', 'Cup Sleeve', 0.5, 'each', '~50% of customers use sleeve');
addRecipe('mi-coffee-24', 'Napkin', 1, 'each', '');
// Latte 16oz
addRecipe('mi-coffee-25', '16oz Hot Cup', 1, 'each', '');
addRecipe('mi-coffee-25', 'Hot Cup Lid (10-24oz)', 1, 'each', '');
addRecipe('mi-coffee-25', 'Cup Sleeve', 0.5, 'each', '~50% of customers use sleeve');
addRecipe('mi-coffee-25', 'Napkin', 1, 'each', '');
// Cortado (ceramic only - just napkin)
addRecipe('mi-coffee-26', 'Napkin', 1, 'each', 'Served in ceramic mug');
// Flat White (8oz hot)
addRecipe('mi-coffee-27', '8oz Hot Cup', 1, 'each', '');
addRecipe('mi-coffee-27', 'Hot Cup Lid (8oz)', 1, 'each', '');
addRecipe('mi-coffee-27', 'Napkin', 1, 'each', '');
// French Press (16oz hot cup for pouring)
addRecipe('mi-coffee-28', '16oz Hot Cup', 1, 'each', 'For pouring from french press');
addRecipe('mi-coffee-28', 'Hot Cup Lid (10-24oz)', 1, 'each', '');
addRecipe('mi-coffee-28', 'Cup Sleeve', 0.5, 'each', '~50% of customers use sleeve');
addRecipe('mi-coffee-28', 'Napkin', 1, 'each', '');
// Coffee Flight - SKIPPED (need to confirm cup count with Jennifer)

console.log(`  Coffee: 8 items with packaging (Coffee Flight skipped - need cup count)`);

// ─────────────────────────────────────────
// COLD BREW - 8 items
// 16oz: 16oz Cold Cup + Flat Lid + Straw (or no straw for cold foam)
// 20oz: 20oz Cold Cup + Flat Lid + Straw (or no straw for cold foam)
// ─────────────────────────────────────────

// Classic Cold Brew - 16oz (with straw)
addRecipe('mi-cold-brew-30', '16oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-cold-brew-30', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', '');
addRecipe('mi-cold-brew-30', 'Regular Straw', 1, 'each', '');
addRecipe('mi-cold-brew-30', 'Napkin', 1, 'each', '');
// Classic Cold Brew - 20oz (with straw)
addRecipe('mi-cold-brew-31', '20oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-cold-brew-31', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', '');
addRecipe('mi-cold-brew-31', 'Regular Straw', 1, 'each', '');
addRecipe('mi-cold-brew-31', 'Napkin', 1, 'each', '');
// Tropical Cold Brew - 16oz (with straw)
addRecipe('mi-cold-brew-32', '16oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-cold-brew-32', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', '');
addRecipe('mi-cold-brew-32', 'Regular Straw', 1, 'each', '');
addRecipe('mi-cold-brew-32', 'Napkin', 1, 'each', '');
// Tropical Cold Brew - 20oz (with straw)
addRecipe('mi-cold-brew-33', '20oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-cold-brew-33', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', '');
addRecipe('mi-cold-brew-33', 'Regular Straw', 1, 'each', '');
addRecipe('mi-cold-brew-33', 'Napkin', 1, 'each', '');
// Salted Creamy Caramel - 16oz (sip-through lid, NO straw - cold foam)
addRecipe('mi-cold-brew-34', '16oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-cold-brew-34', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', 'Sip-through for cold foam');
addRecipe('mi-cold-brew-34', 'Napkin', 1, 'each', '');
// Salted Creamy Caramel - 20oz (sip-through lid, NO straw - cold foam)
addRecipe('mi-cold-brew-35', '20oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-cold-brew-35', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', 'Sip-through for cold foam');
addRecipe('mi-cold-brew-35', 'Napkin', 1, 'each', '');
// Vanilla Sweet Cream - 16oz (sip-through lid, NO straw - cold foam)
addRecipe('mi-cold-brew-36', '16oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-cold-brew-36', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', 'Sip-through for cold foam');
addRecipe('mi-cold-brew-36', 'Napkin', 1, 'each', '');
// Vanilla Sweet Cream - 20oz (sip-through lid, NO straw - cold foam)
addRecipe('mi-cold-brew-37', '20oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-cold-brew-37', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', 'Sip-through for cold foam');
addRecipe('mi-cold-brew-37', 'Napkin', 1, 'each', '');

console.log(`  Cold Brew: 8 items with packaging`);

// ─────────────────────────────────────────
// SPECIALTY LATTES - 6 items
// Default: 12oz hot cup (hot version). Cold Brew Latte = 16oz cold cup.
// Note: When ordered iced, packaging changes to cold cup + lid + straw
// ─────────────────────────────────────────
const hotSpecialtyLatteIds = [
  'mi-specialty-lattes-38', // Honey & Oats
  'mi-specialty-lattes-39', // Brown Sugar Momma
  'mi-specialty-lattes-40', // Spring Time
  'mi-specialty-lattes-41', // White Sugar Daddy
  'mi-specialty-lattes-42', // Mocha
];

for (const id of hotSpecialtyLatteIds) {
  addRecipe(id, '12oz Hot Cup', 1, 'each', 'Hot default. If iced: use 16oz cold cup + cold lid + straw instead.');
  addRecipe(id, 'Hot Cup Lid (10-24oz)', 1, 'each', '');
  addRecipe(id, 'Cup Sleeve', 0.5, 'each', '~50% of customers use sleeve');
  addRecipe(id, 'Napkin', 1, 'each', '');
}

// Cold Brew Latte (always iced - cold brew based)
addRecipe('mi-specialty-lattes-43', '16oz Cold Cup (Clear)', 1, 'each', 'Always iced (cold brew based)');
addRecipe('mi-specialty-lattes-43', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', '');
addRecipe('mi-specialty-lattes-43', 'Regular Straw', 1, 'each', '');
addRecipe('mi-specialty-lattes-43', 'Napkin', 1, 'each', '');

console.log(`  Specialty Lattes: 6 items with packaging`);

// ─────────────────────────────────────────
// OTHER LATTES - 3 items (Chai, Golden Milk, Matcha)
// Default: 12oz hot cup
// ─────────────────────────────────────────
const otherLatteIds = [
  'mi-other-lattes-44', // Chai Latte
  'mi-other-lattes-45', // Golden Milk
  'mi-other-lattes-46', // Matcha Latte
];

for (const id of otherLatteIds) {
  addRecipe(id, '12oz Hot Cup', 1, 'each', 'Hot default. If iced: use 16oz cold cup + cold lid + straw instead.');
  addRecipe(id, 'Hot Cup Lid (10-24oz)', 1, 'each', '');
  addRecipe(id, 'Cup Sleeve', 0.5, 'each', '~50% of customers use sleeve');
  addRecipe(id, 'Napkin', 1, 'each', '');
}
console.log(`  Other Lattes: 3 items with packaging`);

// ─────────────────────────────────────────
// KOMBUCHA - 25 items (12oz, 16oz, 20oz, and Growler sizes)
// 12oz: 12oz Cold Cup + Flat Lid (12-14oz) + Regular Straw
// 16oz: 16oz Cold Cup + Flat Lid (16-24oz) + Regular Straw
// 20oz: 20oz Cold Cup + Flat Lid (16-24oz) + Regular Straw
// Growler: 32oz Glass Growler + Metal Lid
// ─────────────────────────────────────────
const kombucha12ozIds = [
  'mi-kombucha-47', // Raspberry Bliss 12oz
  'mi-kombucha-49', // Orange Blossom 12oz
  'mi-kombucha-51', // Orange Pineapple 12oz
  'mi-kombucha-53', // Strawberry Youpon 12oz
  'mi-kombucha-55', // Lemongrass 12oz
  'mi-kombucha-61', // Pina Colada 12oz
  'mi-kombucha-63', // Coconut Raspberry 12oz
  'mi-kombucha-65', // Focus Lemon Lion Mane 12oz
  'mi-kombucha-67', // Blueberry Elderflower 12oz
  'mi-kombucha-69', // Lemon Ginger 12oz
  'mi-kombucha-71', // Lemon Turmeric 12oz
];

for (const id of kombucha12ozIds) {
  addRecipe(id, '12oz Cold Cup (Clear)', 1, 'each', '');
  addRecipe(id, 'Cold Cup Flat Lid (12-14oz)', 1, 'each', '');
  addRecipe(id, 'Regular Straw', 1, 'each', '');
  addRecipe(id, 'Napkin', 1, 'each', '');
}

const kombucha16ozIds = [
  'mi-kombucha-48', // Raspberry Bliss 16oz
  'mi-kombucha-50', // Orange Blossom 16oz
  'mi-kombucha-52', // Orange Pineapple 16oz
  'mi-kombucha-54', // Strawberry Youpon 16oz
  'mi-kombucha-56', // Lemongrass 16oz
  'mi-kombucha-57', // Pineapple Jalapeno 16oz
  'mi-kombucha-59', // Blue Sage 16oz
  'mi-kombucha-62', // Pina Colada 16oz
  'mi-kombucha-64', // Coconut Raspberry 16oz
  'mi-kombucha-66', // Focus Lemon Lion Mane 16oz
  'mi-kombucha-68', // Blueberry Elderflower 16oz
  'mi-kombucha-70', // Lemon Ginger 16oz
  'mi-kombucha-72', // Lemon Turmeric 16oz
];

for (const id of kombucha16ozIds) {
  addRecipe(id, '16oz Cold Cup (Clear)', 1, 'each', '');
  addRecipe(id, 'Cold Cup Flat Lid (16-24oz)', 1, 'each', '');
  addRecipe(id, 'Regular Straw', 1, 'each', '');
  addRecipe(id, 'Napkin', 1, 'each', '');
}

// Blue Sage 20oz
addRecipe('mi-kombucha-60', '20oz Cold Cup (Clear)', 1, 'each', '');
addRecipe('mi-kombucha-60', 'Cold Cup Flat Lid (16-24oz)', 1, 'each', '');
addRecipe('mi-kombucha-60', 'Regular Straw', 1, 'each', '');
addRecipe('mi-kombucha-60', 'Napkin', 1, 'each', '');

// Pineapple Jalapeno Growler
addRecipe('mi-kombucha-58', '32oz Glass Growler', 1, 'each', 'Customer keeps growler. Sold for $5, fill 32oz = $12');
addRecipe('mi-kombucha-58', 'Growler Metal Lid', 1, 'each', '');

console.log(`  Kombucha: ${kombucha12ozIds.length} × 12oz + ${kombucha16ozIds.length} × 16oz + 1 × 20oz + 1 Growler`);

// ─────────────────────────────────────────
// IMMUNITY SHOTS - 8 items
// 2oz: Portion Cup + Lid (Jennifer said "we use 4oz cups filled halfway to 2oz")
// 19oz: Bottled (packaging included from brewer)
// ─────────────────────────────────────────
const immunityShot2ozIds = [
  'mi-immunity-shots-73', // Hibiscus 2oz
  'mi-immunity-shots-74', // Spirulina 2oz
  'mi-immunity-shots-75', // Activated Charcoal 2oz
  'mi-immunity-shots-76', // Extra Ginger Turmeric 2oz
];

for (const id of immunityShot2ozIds) {
  addRecipe(id, '4oz Portion Cup', 1, 'each', 'Filled halfway to ~2oz');
  addRecipe(id, 'Napkin', 1, 'each', '');
}

// 19oz bottles: no additional packaging needed (bottled by brewer)
const immunityShot19ozIds = [
  'mi-immunity-shots-77', // Hibiscus 19oz
  'mi-immunity-shots-78', // Spirulina 19oz
  'mi-immunity-shots-79', // Activated Charcoal 19oz
  'mi-immunity-shots-80', // Extra Ginger Turmeric 19oz
];
// No packaging added for 19oz - it comes pre-bottled

console.log(`  Immunity Shots: 4 × 2oz (portion cup) + 4 × 19oz (pre-bottled, no packaging)`);

// ─────────────────────────────────────────
// FRESH JUICE - 3 items
// 16oz Cold Cup + Flat Lid + Regular Straw
// ─────────────────────────────────────────
const juiceIds = [
  'mi-fresh-juice-81', // Orange Glow
  'mi-fresh-juice-82', // Beet Boost
  'mi-fresh-juice-83', // Clean + Green
];

for (const id of juiceIds) {
  addRecipe(id, '16oz Cold Cup (Clear)', 1, 'each', '');
  addRecipe(id, 'Cold Cup Flat Lid (16-24oz)', 1, 'each', '');
  addRecipe(id, 'Regular Straw', 1, 'each', '');
  addRecipe(id, 'Napkin', 1, 'each', '');
}
console.log(`  Fresh Juice: 3 items with packaging`);

// ─────────────────────────────────────────
// SMOOTHIES - 5 items
// 20oz Cold Cup + Dome Lid + Wide/Boba Straw
// ─────────────────────────────────────────
const smoothieIds = [
  'mi-smoothies-84', // Acai & Berries
  'mi-smoothies-85', // Berrynana
  'mi-smoothies-86', // Paradise
  'mi-smoothies-87', // Nutty Banana
  'mi-smoothies-88', // Nutty Banana 2.0
];

for (const id of smoothieIds) {
  addRecipe(id, '20oz Cold Cup (Clear)', 1, 'each', '');
  addRecipe(id, 'Cold Cup Dome Lid (16-24oz)', 1, 'each', '');
  addRecipe(id, 'Wide/Boba Straw', 1, 'each', '');
  addRecipe(id, 'Napkin', 1, 'each', '');
}
console.log(`  Smoothies: 5 items with packaging`);

// ─────────────────────────────────────────
// ADD-ONS - mostly no packaging (they go into existing items)
// Exception: Alt Milk, Espresso Shot - no additional packaging
// ─────────────────────────────────────────
// No packaging recipes needed for add-ons
console.log(`  Add-Ons: No additional packaging needed`);

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`RECIPE BUILD COMPLETE`);
console.log(`${'='.repeat(50)}`);
console.log(`Total packaging recipes created: ${recipeCount}`);

// Show items NOT covered (need more info from Jennifer)
console.log(`\n--- ITEMS SKIPPED (need info from Jennifer) ---`);
console.log(`  - Coffee Flight: How many cups per flight? What size?`);
console.log(`  - Immunity Shot 19oz bottles: Packaging included from brewer`);
console.log(`  - Sandwich + Soup Combo: What packaging for soup?`);
console.log(`  - Pineapple Jalapeno Growler: Using 32oz growler - confirm correct`);

console.log(`\n--- NEXT STEPS ---`);
console.log(`  1. Add FOOD INGREDIENT quantities (how many oz of each ingredient per menu item)`);
console.log(`  2. Get missing prices from Jennifer (51 items still at $0)`);
console.log(`  3. Confirm hot/iced split for lattes (currently defaulting to hot packaging)`);

// Show a sample cost breakdown
console.log(`\n--- SAMPLE PACKAGING COST: Classic Cold Brew 16oz ---`);
const sampleRecipes = db.prepare(`
  SELECT i.name, r.quantity, i.cost_per_unit, (r.quantity * i.cost_per_unit) as line_cost
  FROM recipes r
  JOIN ingredients i ON r.ingredient_id = i.id
  WHERE r.menu_item_id = 'mi-cold-brew-30'
`).all() as any[];

let sampleTotal = 0;
for (const r of sampleRecipes) {
  const cost = r.line_cost.toFixed(4);
  sampleTotal += r.line_cost;
  const priceNote = r.cost_per_unit > 0 ? `$${cost}` : '$?.???? (needs price)';
  console.log(`  ${r.quantity}x ${r.name}: ${priceNote}`);
}
console.log(`  TOTAL packaging cost: $${sampleTotal.toFixed(4)}`);

console.log(`\n--- SAMPLE PACKAGING COST: The Porch Bowl ---`);
const sampleBowl = db.prepare(`
  SELECT i.name, r.quantity, i.cost_per_unit, (r.quantity * i.cost_per_unit) as line_cost
  FROM recipes r
  JOIN ingredients i ON r.ingredient_id = i.id
  WHERE r.menu_item_id = 'mi-signature-bowls-10'
`).all() as any[];

let bowlTotal = 0;
for (const r of sampleBowl) {
  const cost = r.line_cost.toFixed(4);
  bowlTotal += r.line_cost;
  const priceNote = r.cost_per_unit > 0 ? `$${cost}` : '$?.???? (needs price)';
  console.log(`  ${r.quantity}x ${r.name}: ${priceNote}`);
}
console.log(`  TOTAL packaging cost: $${bowlTotal.toFixed(4)}`);

// Final ingredient/recipe counts
const totalIngredients = (db.prepare('SELECT COUNT(*) as c FROM ingredients').get() as any).c;
const totalRecipes = (db.prepare('SELECT COUNT(*) as c FROM recipes').get() as any).c;
const withPrice = (db.prepare('SELECT COUNT(*) as c FROM ingredients WHERE cost_per_unit > 0').get() as any).c;
const needsPrice = (db.prepare('SELECT COUNT(*) as c FROM ingredients WHERE cost_per_unit = 0').get() as any).c;

console.log(`\n--- DATABASE STATUS ---`);
console.log(`  Total ingredients: ${totalIngredients} (${withPrice} with prices, ${needsPrice} need prices)`);
console.log(`  Total recipes: ${totalRecipes}`);
console.log(`  Menu items with packaging: ${(db.prepare('SELECT COUNT(DISTINCT menu_item_id) as cnt FROM recipes').get() as any)?.cnt}`);

db.close();
