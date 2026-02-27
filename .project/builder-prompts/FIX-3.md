# FIX-3: Dashboard "Couldn't load your menu data" — Migrate SQLite to Neon Postgres

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
The entire app uses `better-sqlite3` (a local file-based database) which does not work on Vercel serverless. Migrate the database layer from SQLite to Neon Postgres so all API routes work in production. A Neon database URL is already configured in `.env.local` as `NEON_DATABASE_URL`, and the `@neondatabase/serverless` package is already installed.

## Root Cause
`src/lib/db.ts` creates a `better-sqlite3` database from a local file `porch-financial.db`. On Vercel:
1. The `.db` file is not included in the serverless function bundle
2. `better-sqlite3` requires native binaries that may not be available
3. Serverless functions are stateless — even `/tmp` writes don't persist

The dashboard calls `GET /api/menu-items`, which calls `getDb()`, which tries to open the missing `.db` file, throws an error, and the dashboard shows "Couldn't load your menu data."

## Context
- Relevant files:
  - `src/lib/db.ts` — Core DB module. Must be rewritten for Neon.
  - `src/app/api/ux-comments/route.ts` — **Working example** of Neon usage (uses `neon()` tagged template)
  - Every file that imports `getDb` from `@/lib/db` — 25+ API route files
  - `.env.local` — Has `NEON_DATABASE_URL` already set
  - `package.json` — Has `@neondatabase/serverless` already installed
- Spec: `.project/architect/features/demo-fixes.md`
- Neon connection string: Already in `.env.local` as `NEON_DATABASE_URL`

**This is the highest-priority and largest fix. Issues 1 and 2 also depend on a working database.**

## Implementation Plan

### Step 1: Create the Neon schema
Use the Neon MCP tools or a migration script to create all tables in the Neon database. Translate the SQLite schema from `src/lib/db.ts` `initializeDb()` function to Postgres:

Key syntax changes from SQLite to Postgres:
| SQLite | Postgres |
|--------|----------|
| `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` (same) |
| `REAL` | `DOUBLE PRECISION` or `NUMERIC` |
| `INTEGER DEFAULT 1` (boolean) | `BOOLEAN DEFAULT TRUE` |
| `datetime('now')` | `NOW()` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `TEXT DEFAULT (datetime('now'))` | `TIMESTAMPTZ DEFAULT NOW()` |

All tables to create:
1. `menu_categories`
2. `menu_items`
3. `ingredients` (note: has `ingredient_type` column not shown in base schema — check existing DB)
4. `recipes`
5. `expense_categories` (with seed data — use `INSERT ... ON CONFLICT DO NOTHING`)
6. `expenses`
7. `daily_sales`
8. `item_sales`
9. `sub_recipe_ingredients`
10. `receipts` (add `image_data TEXT` and `image_mime_type TEXT` columns per FIX-2)
11. `receipt_items` (add `is_one_off BOOLEAN DEFAULT FALSE` per FEAT-ONEOFF)
12. `ingredient_price_history`
13. `daily_labor`
14. `labor_shifts`
15. `utility_bills`
16. `forecast_events`

**IMPORTANT:** The `ingredients` table in the live SQLite database has an `ingredient_type` column (`'food'`, `'packaging'`, `'sub_recipe'`) that is NOT in the base schema in `db.ts`. It was added via ALTER TABLE in a previous session. Make sure to include it in the Postgres schema.

### Step 2: Rewrite `src/lib/db.ts`
Replace the entire file to use `@neondatabase/serverless`:

```ts
import { neon } from "@neondatabase/serverless";

export function getDb() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL is not set");
  return neon(url);
}
```

**CRITICAL DIFFERENCE:** The Neon `neon()` driver returns a tagged template function (`sql`) that is **async**. The old `better-sqlite3` API was **synchronous** with methods like `.prepare().all()`, `.prepare().get()`, `.prepare().run()`.

### Step 3: Convert all API routes from sync SQLite to async Neon

Every API route that uses `getDb()` must be updated. There are 25+ routes. The conversion pattern is:

**Before (SQLite):**
```ts
const db = getDb();
const items = db.prepare("SELECT * FROM menu_items WHERE id = ?").all(id);
const single = db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id);
db.prepare("INSERT INTO menu_items (id, name) VALUES (?, ?)").run(id, name);
```

**After (Neon):**
```ts
const sql = getDb();
const items = await sql`SELECT * FROM menu_items WHERE id = ${id}`;
const [single] = await sql`SELECT * FROM menu_items WHERE id = ${id}`;
await sql`INSERT INTO menu_items (id, name) VALUES (${id}, ${name})`;
```

Key patterns to convert:
- `.prepare(query).all(params)` → `await sql\`query with ${params}\``
- `.prepare(query).get(params)` → `const [row] = await sql\`query with ${params}\``
- `.prepare(query).run(params)` → `await sql\`query with ${params}\``
- `db.transaction(() => { ... })()` → Use `BEGIN`/`COMMIT` or sequential awaits (Neon HTTP driver doesn't support traditional transactions; for multi-statement transactions, use `neon(..., { fullResults: true })` with `sql.transaction([...])` or restructure to individual statements)
- All handler functions that use the DB must be `async`

**Routes to convert (all in `src/app/api/`):**
1. `menu-items/route.ts` (GET, POST)
2. `menu-items/[id]/route.ts` (GET, PUT, DELETE)
3. `ingredients/route.ts` (GET, POST)
4. `ingredients/[id]/route.ts` (GET, PUT, DELETE)
5. `ingredients/[id]/price-history/route.ts` (GET)
6. `recipes/route.ts`
7. `recipe-cards/route.ts`
8. `categories/route.ts`
9. `sales/route.ts` (GET)
10. `square/sync/route.ts` (POST) — has transactions
11. `square/labor/route.ts` (GET, POST)
12. `square/webhook/route.ts`
13. `receipts/route.ts`
14. `receipts/[id]/route.ts`
15. `receipts/scan/route.ts` (POST)
16. `receipts/[id]/match/route.ts` (POST)
17. `receipts/[id]/confirm/route.ts` (POST) — has transactions
18. `receipts/image/route.ts` (GET)
19. `expenses/route.ts`
20. `financials/route.ts`
21. `projections/route.ts`
22. `sub-recipes/route.ts`
23. `kpis/route.ts`
24. `orders/route.ts`
25. `inventory/deduct/route.ts`
26. `labor/analysis/route.ts`
27. `labor/events/route.ts`
28. `labor/forecast/route.ts`
29. `utilities/route.ts`

### Step 4: Handle transactions
Routes that use `db.transaction()`:
- `src/app/api/square/sync/route.ts` — Upserts daily sales + item sales
- `src/app/api/square/labor/route.ts` — Upserts shifts + daily labor
- `src/app/api/receipts/[id]/confirm/route.ts` — Updates prices + records history

For the Neon HTTP driver, convert transactions to `sql.transaction()` or use `neon(..., { fullResults: true })` and batch operations.

Alternatively, use the `@neondatabase/serverless` websocket driver for real transaction support if needed, but the tagged template approach with individual statements should work for this app's scale.

### Step 5: Migrate data from SQLite to Neon
Write a one-time migration script (`src/scripts/migrate-to-neon.ts`) that:
1. Opens the local `porch-financial.db` with `better-sqlite3`
2. Reads all data from each table
3. Inserts it into the Neon database
4. Logs progress and row counts

Run this script locally with `npx tsx src/scripts/migrate-to-neon.ts`.

### Step 6: Remove SQLite dependency
After migration is verified:
- Remove `better-sqlite3` and `@types/better-sqlite3` from `package.json`
- Remove any remaining `import Database from "better-sqlite3"` references
- The `porch-financial.db`, `.db-shm`, `.db-wal` files can be gitignored or removed

### Step 7: Test locally
Run `npm run dev` and verify:
- Dashboard loads and shows menu data
- All pages work (menu, ingredients, recipes, sales, receipts, expenses, etc.)
- Data is being read from and written to Neon

## Acceptance Criteria
- [ ] `src/lib/db.ts` uses `@neondatabase/serverless` instead of `better-sqlite3`
- [ ] All tables are created in Neon Postgres with correct schema
- [ ] All 25+ API routes are converted from sync SQLite to async Neon
- [ ] Dashboard loads and shows menu items on Vercel
- [ ] Data migration script exists and has been run
- [ ] `better-sqlite3` is removed from dependencies
- [ ] Sales sync, receipt scanning, and all other features work with Neon
- [ ] No SQLite-specific SQL syntax remains (no `datetime('now')`, no `INSERT OR IGNORE`, etc.)
