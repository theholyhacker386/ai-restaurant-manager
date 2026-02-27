import Database from "better-sqlite3";
import { Pool } from "@neondatabase/serverless";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DB_PATH = path.join(process.cwd(), "porch-financial.db");
const NEON_URL = process.env.NEON_DATABASE_URL;

if (!NEON_URL) {
  console.error("NEON_DATABASE_URL not set in .env.local");
  process.exit(1);
}

const db = new Database(DB_PATH);
const pool = new Pool({ connectionString: NEON_URL });

const tables = [
  "menu_categories",
  "menu_items",
  "ingredients",
  "recipes",
  "expense_categories",
  "expenses",
  "daily_sales",
  "item_sales",
  "sub_recipe_ingredients",
  "receipts",
  "receipt_items",
  "ingredient_price_history",
  "daily_labor",
  "labor_shifts",
  "utility_bills",
  "forecast_events",
];

async function migrateTable(tableName: string) {
  try {
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      console.log(`  ${tableName}: 0 rows (empty)`);
      return 0;
    }

    const columns = Object.keys(rows[0]);

    let migrated = 0;
    for (const row of rows) {
      const values = columns.map((col) => {
        const val = row[col];
        // Convert SQLite integer booleans to proper booleans for Postgres
        if (tableName === "menu_items" && col === "is_active") {
          return val === 1 || val === true;
        }
        if (tableName === "expenses" && col === "is_recurring") {
          return val === 1 || val === true;
        }
        if (tableName === "receipt_items" && col === "is_one_off") {
          return val === 1 || val === true;
        }
        return val;
      });

      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = columns.join(", ");

      try {
        await pool.query(`INSERT INTO ${tableName} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
        migrated++;
      } catch (err: any) {
        // Skip rows that fail (e.g., foreign key violations for stale data)
        if (!err.message?.includes("duplicate key")) {
          console.log(`    Skip row in ${tableName}: ${err.message?.substring(0, 80)}`);
        }
      }
    }

    console.log(`  ${tableName}: ${migrated}/${rows.length} rows migrated`);
    return migrated;
  } catch (err: any) {
    console.log(`  ${tableName}: ERROR - ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log("Starting SQLite -> Neon migration...\n");

  // Check if ingredients table has ingredient_type column
  try {
    const colInfo = db.prepare("PRAGMA table_info(ingredients)").all() as any[];
    const hasIngredientType = colInfo.some((c: any) => c.name === "ingredient_type");
    if (!hasIngredientType) {
      console.log("Note: SQLite ingredients table does not have ingredient_type column");
    }
  } catch (e) {
    // ignore
  }

  let totalMigrated = 0;
  for (const table of tables) {
    const count = await migrateTable(table);
    totalMigrated += count;
  }

  console.log(`\nMigration complete! Total rows migrated: ${totalMigrated}`);
  db.close();
  await pool.end();
}

main().catch(console.error);
