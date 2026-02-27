/**
 * Seed script: Pre-loads The Porch Health Park menu into the database
 * Run with: npx tsx src/scripts/seed-menu.ts
 */
import Database from "better-sqlite3";
import path from "path";
import { v4 as uuid } from "uuid";

const DB_PATH = path.join(process.cwd(), "porch-financial.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize tables first
db.exec(`
  CREATE TABLE IF NOT EXISTS menu_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    name TEXT NOT NULL,
    selling_price REAL NOT NULL DEFAULT 0,
    square_item_id TEXT,
    is_active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES menu_categories(id)
  );
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
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    menu_item_id TEXT NOT NULL,
    ingredient_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    quantity_unit TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
  );
  CREATE TABLE IF NOT EXISTS expense_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'overhead',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    is_recurring INTEGER DEFAULT 0,
    recurring_frequency TEXT,
    source TEXT,
    source_transaction_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES expense_categories(id)
  );
  CREATE TABLE IF NOT EXISTS daily_sales (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    total_revenue REAL NOT NULL DEFAULT 0,
    total_tax REAL NOT NULL DEFAULT 0,
    total_tips REAL NOT NULL DEFAULT 0,
    total_discounts REAL NOT NULL DEFAULT 0,
    net_revenue REAL NOT NULL DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS item_sales (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    menu_item_id TEXT,
    square_item_name TEXT,
    square_item_id TEXT,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    total_revenue REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  );

  INSERT OR IGNORE INTO expense_categories (id, name, type) VALUES
    ('cat-rent', 'Rent', 'overhead'),
    ('cat-utilities', 'Utilities (Electric, Water, Gas)', 'overhead'),
    ('cat-internet', 'Internet/Phone', 'overhead'),
    ('cat-insurance', 'Insurance', 'overhead'),
    ('cat-supplies', 'Supplies (cups, napkins, etc.)', 'cogs'),
    ('cat-ingredients', 'Ingredients/Food', 'cogs'),
    ('cat-equipment', 'Equipment', 'overhead'),
    ('cat-maintenance', 'Repairs/Maintenance', 'overhead'),
    ('cat-marketing', 'Marketing/Advertising', 'overhead'),
    ('cat-software', 'Software/Subscriptions', 'overhead'),
    ('cat-payroll', 'Payroll/Wages', 'labor'),
    ('cat-payroll-tax', 'Payroll Taxes', 'labor'),
    ('cat-loan', 'Loan Payments', 'overhead'),
    ('cat-kombucha', 'Kombucha (from local brewers)', 'cogs'),
    ('cat-immunity', 'Immunity Shots (from local brewers)', 'cogs'),
    ('cat-other', 'Other', 'overhead');
`);

// ============================================
// CATEGORIES
// ============================================
const categories: { id: string; name: string; sort_order: number }[] = [
  { id: "cat-sandwiches", name: "Sandwiches", sort_order: 1 },
  { id: "cat-salads", name: "Salads", sort_order: 2 },
  { id: "cat-signature-bowls", name: "Signature Bowls", sort_order: 3 },
  { id: "cat-byob", name: "Build Your Own Bowl", sort_order: 4 },
  { id: "cat-other-bowls", name: "Other Bowls", sort_order: 5 },
  { id: "cat-toast", name: "Toast", sort_order: 6 },
  { id: "cat-coffee", name: "Coffee", sort_order: 7 },
  { id: "cat-cold-brew", name: "Cold Brew", sort_order: 8 },
  { id: "cat-specialty-lattes", name: "Specialty Lattes", sort_order: 9 },
  { id: "cat-other-lattes", name: "Other Lattes", sort_order: 10 },
  { id: "cat-kombucha", name: "Kombucha", sort_order: 11 },
  { id: "cat-immunity-shots", name: "Fire Immunity Shots", sort_order: 12 },
  { id: "cat-fresh-juice", name: "Fresh Juice", sort_order: 13 },
  { id: "cat-smoothies", name: "Smoothies", sort_order: 14 },
  { id: "cat-add-ons", name: "Add-Ons & Extras", sort_order: 15 },
];

const insertCat = db.prepare(
  `INSERT OR REPLACE INTO menu_categories (id, name, sort_order) VALUES (?, ?, ?)`
);
for (const cat of categories) {
  insertCat.run(cat.id, cat.name, cat.sort_order);
}

// ============================================
// MENU ITEMS
// ============================================
interface MenuItem {
  name: string;
  price: number;
  category_id: string;
  notes?: string;
}

const menuItems: MenuItem[] = [
  // --- SANDWICHES ---
  { name: "Chicken Avo", price: 13.00, category_id: "cat-sandwiches", notes: "Chicken, Avocado, Spinach, Bacon. Served with chips or fruit cup." },
  { name: "Chick-Pea Smash", price: 12.00, category_id: "cat-sandwiches", notes: "Curry Chickpea, Spinach, Tomato. Add Avocado +$2." },
  { name: "Chicken Salad Sandwich", price: 13.00, category_id: "cat-sandwiches", notes: "Shredded Chicken, Apples, Grapes, Celery, Almonds. On Multigrain or Lettuce Wrap." },
  { name: "Caprese Explosion", price: 13.00, category_id: "cat-sandwiches", notes: "Fresh Mozzarella, Tomato, Sun Dried Tomatoes, Balsamic, Basil Pesto, Garlic Aioli. Add Chicken Breast +$3." },
  { name: "Grilled Cheese", price: 8.00, category_id: "cat-sandwiches", notes: "Colby Jack Cheese with a Tomato Dip." },
  { name: "Chicken Curry Sandwich", price: 13.00, category_id: "cat-sandwiches", notes: "Curry Chicken, Spinach, Tomato. On Multigrain or Lettuce Wrap." },
  { name: "Sandwich + Soup Combo", price: 4.00, category_id: "cat-add-ons", notes: "Add a cup of soup to any sandwich." },

  // --- SALADS ---
  { name: "Honey Crack Chicken Salad", price: 16.00, category_id: "cat-salads", notes: "Honey crack chicken wings, half panini, salad on a bed of spinach." },
  { name: "Berry Healthy Salad", price: 14.00, category_id: "cat-salads", notes: "Nuts, dried cranberries, feta cheese. Add chicken breast extra." },

  // --- SIGNATURE BOWLS ---
  { name: "The Protein Bowl", price: 14.20, category_id: "cat-signature-bowls", notes: "Granola or Hot Oatmeal, Peanut Butter, Banana, Blueberry, Strawberry, Goji Berries, Hemp Seeds, Flax Seeds, Chia Seeds, Local Honey. Base: Organic Acai, Pitaya, Blue Pineapple Mango, or Yogurt." },
  { name: "The Porch Bowl", price: 12.90, category_id: "cat-signature-bowls", notes: "Granola or Hot Oatmeal, Banana, Strawberry, Blueberry, Chia Seeds, Local Honey." },
  { name: "Tropical Bowl", price: 12.90, category_id: "cat-signature-bowls", notes: "Granola or Hot Oatmeal, Mango, Pineapple, Banana, Toasted Coconut, Local Honey, Bee Pollen." },
  { name: "Island Time Bowl", price: 12.90, category_id: "cat-signature-bowls", notes: "Granola or Hot Oatmeal, Strawberry, Mango, Pineapple, Shaved Coconut, Coconut Oil, Local Honey." },
  { name: "Cracked Coconut Bowl", price: 12.90, category_id: "cat-signature-bowls", notes: "Coconut Oil, Granola or Hot Oatmeal, Strawberry, Blueberry, Toasted Coconut, Shredded Coconut, Local Honey." },

  // --- BUILD YOUR OWN BOWL ---
  { name: "Build Your Own Bowl", price: 13.00, category_id: "cat-byob", notes: "Pick base + 4 premium toppings + 2 basic toppings. Extra premium +$0.99, extra basic +$0.25." },

  // --- OTHER BOWLS ---
  { name: "Yogurt Parfait", price: 8.98, category_id: "cat-other-bowls", notes: "Greek or Vanilla, topped with Shredded Coconut & Local Honey." },
  { name: "Oat Bowl", price: 6.88, category_id: "cat-other-bowls", notes: "Oatmeal, Blueberries, Almond Sliver & Local Honey." },

  // --- TOAST ---
  { name: "Avocado Toast", price: 8.00, category_id: "cat-toast", notes: "Everything seasoning." },
  { name: "Protein Toast", price: 7.50, category_id: "cat-toast", notes: "" },
  { name: "PB Banana Honey Toast", price: 0, category_id: "cat-toast", notes: "PRICE NEEDED — Peanut butter, banana, honey." },
  { name: "Cinnamon Toast", price: 0, category_id: "cat-toast", notes: "PRICE NEEDED" },

  // --- COFFEE ---
  { name: "Espresso", price: 3.50, category_id: "cat-coffee", notes: "" },
  { name: "Americano", price: 3.75, category_id: "cat-coffee", notes: "" },
  { name: "Cappuccino", price: 5.25, category_id: "cat-coffee", notes: "" },
  { name: "Latte (12oz)", price: 5.25, category_id: "cat-coffee", notes: "" },
  { name: "Latte (16oz)", price: 6.25, category_id: "cat-coffee", notes: "" },
  { name: "Cortado", price: 4.50, category_id: "cat-coffee", notes: "" },
  { name: "Flat White", price: 5.00, category_id: "cat-coffee", notes: "" },
  { name: "French Press", price: 5.00, category_id: "cat-coffee", notes: "" },
  { name: "Coffee Flight", price: 13.00, category_id: "cat-coffee", notes: "" },

  // --- COLD BREW ---
  { name: "Classic Cold Brew (16oz)", price: 4.90, category_id: "cat-cold-brew", notes: "Brewed in house." },
  { name: "Classic Cold Brew (20oz)", price: 6.00, category_id: "cat-cold-brew", notes: "Brewed in house." },
  { name: "Tropical Cold Brew (16oz)", price: 5.90, category_id: "cat-cold-brew", notes: "" },
  { name: "Tropical Cold Brew (20oz)", price: 6.90, category_id: "cat-cold-brew", notes: "" },
  { name: "Salted Creamy Caramel Cold Brew (16oz)", price: 6.20, category_id: "cat-cold-brew", notes: "Vanilla Syrup with Salted Caramel Sweet Cold Foam." },
  { name: "Salted Creamy Caramel Cold Brew (20oz)", price: 6.90, category_id: "cat-cold-brew", notes: "" },
  { name: "Vanilla Sweet Cream Cold Brew (16oz)", price: 5.90, category_id: "cat-cold-brew", notes: "Cold Brew topped with Vanilla Sweet Cold Foam." },
  { name: "Vanilla Sweet Cream Cold Brew (20oz)", price: 6.90, category_id: "cat-cold-brew", notes: "" },

  // --- SPECIALTY LATTES ---
  { name: "Honey & Oats Latte", price: 6.40, category_id: "cat-specialty-lattes", notes: "Local Honey, Oat Milk, & a Dash of Cinnamon." },
  { name: "Brown Sugar Momma", price: 6.20, category_id: "cat-specialty-lattes", notes: "Brown Sugar Whipped Espresso over Milk." },
  { name: "Spring Time Latte", price: 5.50, category_id: "cat-specialty-lattes", notes: "Soothing Lavender Mixed with Rich Vanilla." },
  { name: "White Sugar Daddy", price: 6.40, category_id: "cat-specialty-lattes", notes: "Rich White Mocha & Caramel Sauce." },
  { name: "Mocha", price: 5.50, category_id: "cat-specialty-lattes", notes: "Silky Sweet Chocolate." },
  { name: "Cold Brew Latte", price: 6.40, category_id: "cat-specialty-lattes", notes: "Pick your flavor." },

  // --- OTHER LATTES ---
  { name: "Chai Latte", price: 5.80, category_id: "cat-other-lattes", notes: "Spicy Chai Blend. Add Espresso +$1.50." },
  { name: "Golden Milk", price: 5.80, category_id: "cat-other-lattes", notes: "Turmeric, Cardamom, Ginger, & Pepper. Add Espresso +$1.50." },
  { name: "Matcha Latte", price: 5.50, category_id: "cat-other-lattes", notes: "" },

  // --- KOMBUCHA (purchased from local brewers) ---
  { name: "Kombucha - Raspberry Bliss (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Raspberry Bliss (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Orange Blossom (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Orange Blossom (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Orange Pineapple (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Orange Pineapple (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Strawberry Youpon (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Strawberry Youpon (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Lemongrass (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Lemongrass (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Pineapple Jalapeno (16oz)", price: 12.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Pineapple Jalapeno (Growler)", price: 24.00, category_id: "cat-kombucha", notes: "Growler size. Purchased from local brewer." },
  { name: "Kombucha - Blue Sage (16oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Blue Sage (20oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Pina Colada (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Pina Colada (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Coconut Raspberry (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Coconut Raspberry (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Focus Lemon Lion Mane (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Focus Lemon Lion Mane (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Blueberry Elderflower (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Blueberry Elderflower (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Lemon Ginger (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Lemon Ginger (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Lemon Turmeric (12oz)", price: 5.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },
  { name: "Kombucha - Lemon Turmeric (16oz)", price: 7.00, category_id: "cat-kombucha", notes: "Purchased from local brewer." },

  // --- FIRE IMMUNITY SHOTS (purchased from local brewers) ---
  { name: "Immunity Shot - Hibiscus (2oz)", price: 5.00, category_id: "cat-immunity-shots", notes: "Purchased from local brewer." },
  { name: "Immunity Shot - Spirulina (2oz)", price: 5.00, category_id: "cat-immunity-shots", notes: "Purchased from local brewer." },
  { name: "Immunity Shot - Activated Charcoal (2oz)", price: 5.00, category_id: "cat-immunity-shots", notes: "Purchased from local brewer." },
  { name: "Immunity Shot - Extra Ginger Turmeric (2oz)", price: 5.00, category_id: "cat-immunity-shots", notes: "Purchased from local brewer." },
  { name: "Immunity Shot - Hibiscus (19oz)", price: 35.00, category_id: "cat-immunity-shots", notes: "Bottle. Purchased from local brewer." },
  { name: "Immunity Shot - Spirulina (19oz)", price: 35.00, category_id: "cat-immunity-shots", notes: "Bottle. Purchased from local brewer." },
  { name: "Immunity Shot - Activated Charcoal (19oz)", price: 35.00, category_id: "cat-immunity-shots", notes: "Bottle. Purchased from local brewer." },
  { name: "Immunity Shot - Extra Ginger Turmeric (19oz)", price: 35.00, category_id: "cat-immunity-shots", notes: "Bottle. Purchased from local brewer." },

  // --- FRESH JUICE ---
  { name: "Orange Glow Juice", price: 8.00, category_id: "cat-fresh-juice", notes: "Carrot, Orange, Apple, Lemon, Ginger. Made to order, no added sugar." },
  { name: "Beet Boost Juice", price: 8.00, category_id: "cat-fresh-juice", notes: "Beet, Apple, Lemon, Ginger, Cucumber. Made to order, no added sugar." },
  { name: "Clean + Green Juice", price: 10.00, category_id: "cat-fresh-juice", notes: "Beet, Apple, Lemon, Ginger, Cucumber. Made to order, no added sugar." },

  // --- SMOOTHIES ---
  { name: "Acai & Berries Smoothie", price: 8.00, category_id: "cat-smoothies", notes: "Acai, Strawberry & Blueberry." },
  { name: "Berrynana Smoothie", price: 8.00, category_id: "cat-smoothies", notes: "Strawberry & Bananas." },
  { name: "Paradise Smoothie", price: 8.00, category_id: "cat-smoothies", notes: "Strawberry, Pineapple, Mango." },
  { name: "Nutty Banana Smoothie", price: 8.00, category_id: "cat-smoothies", notes: "Banana & Peanut Butter & Almond Milk." },
  { name: "Nutty Banana 2.0 Smoothie", price: 10.00, category_id: "cat-smoothies", notes: "Banana, Peanut Butter, Cacao Nibs, Chia Seeds, Oats, Honey & Almond Milk." },

  // --- ADD-ONS ---
  { name: "Alt Milk (Oat, Almond, Coconut)", price: 0.50, category_id: "cat-add-ons", notes: "Add to any coffee drink." },
  { name: "Espresso Shot Add-On", price: 1.50, category_id: "cat-add-ons", notes: "Add to Chai Latte or Golden Milk." },
  { name: "Add Avocado (sandwich)", price: 2.00, category_id: "cat-add-ons", notes: "For Chick-Pea Smash." },
  { name: "Add Chicken Breast (sandwich)", price: 3.00, category_id: "cat-add-ons", notes: "For Caprese Explosion." },
  { name: "Organic Plant Protein (smoothie add-in)", price: 0, category_id: "cat-add-ons", notes: "PRICE NEEDED" },
  { name: "Organic Power Greens (smoothie add-in)", price: 0, category_id: "cat-add-ons", notes: "PRICE NEEDED — Rich Blend of 10 Vegetables & Greens." },
  { name: "Peanut Butter (smoothie add-in)", price: 0, category_id: "cat-add-ons", notes: "PRICE NEEDED" },
  { name: "Energy Booster (smoothie add-in)", price: 0, category_id: "cat-add-ons", notes: "PRICE NEEDED" },
];

const insertItem = db.prepare(
  `INSERT OR REPLACE INTO menu_items (id, name, selling_price, category_id, notes, is_active)
   VALUES (?, ?, ?, ?, ?, 1)`
);

let count = 0;
for (const item of menuItems) {
  const id = `mi-${item.category_id.replace("cat-", "")}-${count}`;
  insertItem.run(id, item.name, item.price, item.category_id, item.notes || null);
  count++;
}

console.log(`✅ Loaded ${categories.length} categories`);
console.log(`✅ Loaded ${menuItems.length} menu items`);
console.log(`\n📋 Items needing prices (marked $0):`);
menuItems
  .filter((i) => i.price === 0 && !i.name.includes("Add-"))
  .forEach((i) => console.log(`   - ${i.name}`));
console.log(`\n🎯 Next step: Add ingredients with Walmart prices, then build recipes!`);

db.close();
