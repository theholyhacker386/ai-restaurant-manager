# Demo-Blocking Fixes & One-Off Receipt Feature

## Overview

Three bugs are blocking the live demo at https://porch-financial.vercel.app, and one feature request needs design. All three bugs share a common theme: the app was built for local development (SQLite file database, local filesystem) and has not been fully adapted for Vercel's serverless environment.

---

## Issue 1: Sales Page — Square API 401 Error

### Symptoms
When the user taps "Sync Now" on the Sales page, the app calls `/api/square/sync` and `/api/square/labor`, both of which call the Square SDK. The response is a 401 (authentication) error from Square.

### Root Cause
The Square access token in `.env.local` (`SQUARE_ACCESS_TOKEN`) is either expired, revoked, or was never added to Vercel's environment variables. Square personal access tokens can expire, and the production deploy on Vercel must have the token set in Vercel's project settings (Dashboard > Settings > Environment Variables).

Additionally, the Sales page's "initial load" path (`GET /api/sales`) reads from the local SQLite database. On Vercel, SQLite is not available (see Issue 3). But the 401 specifically fires when "Sync Now" is tapped because that path calls Square's API directly.

The code in `src/lib/square.ts` creates the `SquareClient` at module level:
```ts
const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN || "",
  environment: ...
});
```
If the env var is missing on Vercel, the token is `""`, which causes 401.

### Key Files
- `src/lib/square.ts` — Square client initialization
- `src/app/api/square/sync/route.ts` — Sales sync endpoint
- `src/app/api/square/labor/route.ts` — Labor sync endpoint
- `src/app/sales/page.tsx` — Sales page frontend
- `.env.local` — Local environment variables

### Design Approach
1. **Verify the Square token is set in Vercel environment variables.** This is a configuration step, not a code change. The token from `.env.local` must be added to Vercel's environment settings.
2. **Add a guard in `/api/square/sync` and `/api/square/labor`** that checks if `SQUARE_ACCESS_TOKEN` is set before attempting API calls, and returns a clear error message like "Square API key not configured" rather than a raw 401.
3. **Consider lazy-initializing the Square client** (like the OpenAI client in `src/lib/openai.ts` already does) so the token is read at call time, not at module-load time. This prevents stale token issues from module caching.

### Acceptance Criteria
- [ ] `SQUARE_ACCESS_TOKEN` is set in Vercel environment variables
- [ ] Tapping "Sync Now" on the Sales page either succeeds or shows a clear, helpful error message (not "Status code: 401")
- [ ] Square client is lazily initialized (not at module level)
- [ ] If token is missing, API routes return a 503 with message "Square API not configured" instead of crashing

---

## Issue 2: Receipt Scanner — Read-Only Filesystem on Vercel

### Symptoms
Scanning a receipt throws:
```
ENOENT: no such file or directory, mkdir '/var/task/data/receipts'
```

### Root Cause
The receipt scan endpoint (`src/app/api/receipts/scan/route.ts`) saves uploaded images to the local filesystem at `data/receipts/` using `fs.writeFileSync`. On Vercel's serverless functions, the filesystem is **read-only** — you cannot create directories or write files.

The image-serving endpoint (`src/app/api/receipts/image/route.ts`) also reads from `data/receipts/` using `fs.readFileSync`, which would similarly fail even if the write succeeded.

### Key Files
- `src/app/api/receipts/scan/route.ts` — Lines 26-34: `fs.mkdirSync` and `fs.writeFileSync`
- `src/app/api/receipts/image/route.ts` — Lines 27-36: `fs.readFileSync`
- `src/lib/db.ts` — Database also uses local file, related issue

### Design Approach
**Option A (Recommended): Store receipt images as base64 in the database**
- Instead of saving to disk, store the base64-encoded image directly in the `receipts` table (add an `image_data` column of type TEXT, and a `image_mime_type` column).
- Remove the `image_path` filesystem write entirely.
- Update the image-serving endpoint to read from the database and return the image bytes.
- Pros: Simple, no external service needed, works on Vercel. Receipt images are small (~100KB-500KB), so base64 storage is practical.
- Cons: Database size grows with images, but for a single-restaurant app this is fine.

**Option B: Use Vercel Blob Storage**
- Upload receipt images to Vercel Blob (requires `@vercel/blob` package).
- Store the blob URL in `image_path`.
- Pros: More scalable, images served from CDN.
- Cons: Requires additional package, Vercel Blob billing, more code changes.

**Recommendation: Option A** for demo speed. The base64 approach requires minimal changes and no new dependencies.

### Acceptance Criteria
- [ ] Receipt scanning works on Vercel without filesystem errors
- [ ] Uploaded receipt images are stored in the database (not on disk)
- [ ] Receipt images can be viewed after scanning (image endpoint works)
- [ ] The `fs` import and all filesystem read/write calls are removed from receipt routes
- [ ] Existing `image_path` column is kept for backward compatibility but new receipts use `image_data`

---

## Issue 3: Dashboard Home — "Couldn't load your menu data"

### Symptoms
The main dashboard page shows "Couldn't load your menu data. Pull down to try again." This error comes from the catch block in `src/app/page.tsx` line 69-74, which calls `GET /api/menu-items`.

### Root Cause
The entire database layer uses `better-sqlite3`, a native SQLite library that reads/writes a local file (`porch-financial.db`). On Vercel:
1. **The `.db` file is not deployed** — it's a local file that doesn't ship with the serverless function bundle.
2. **`better-sqlite3` requires native binaries** — it may fail to load on Vercel's serverless environment.
3. **Even if the file existed, serverless functions are stateless** — data written by one invocation is gone on the next.

The `.env.local` already has a `NEON_DATABASE_URL` configured, and `@neondatabase/serverless` is already in `package.json`. The `ux-comments` route (`src/app/api/ux-comments/route.ts`) already demonstrates using Neon as its database. But the main `getDb()` in `src/lib/db.ts` still uses `better-sqlite3`.

### Key Files
- `src/lib/db.ts` — Core database module; uses `better-sqlite3` and local file
- `src/app/api/menu-items/route.ts` — Called by dashboard; uses `getDb()`
- `src/app/page.tsx` — Dashboard frontend that shows the error
- `src/app/api/ux-comments/route.ts` — Working example of Neon usage
- Every file that imports `getDb` from `@/lib/db` (25+ API routes)

### Design Approach
**Migrate from SQLite to Neon Postgres.** This is the largest fix and blocks everything else.

Steps:
1. **Replace `src/lib/db.ts`** to use `@neondatabase/serverless` (the `neon` HTTP driver) instead of `better-sqlite3`.
2. **Convert all SQL syntax from SQLite to Postgres:**
   - `datetime('now')` becomes `NOW()` or `CURRENT_TIMESTAMP`
   - `INTEGER` booleans become `BOOLEAN`
   - `TEXT PRIMARY KEY` with UUIDs stays the same (Postgres supports this)
   - `INSERT OR IGNORE` becomes `INSERT ... ON CONFLICT DO NOTHING`
   - `ON CONFLICT(col) DO UPDATE SET` syntax is compatible
   - Table creation uses Postgres types
3. **Create the schema in Neon** using either a migration script or the Neon MCP tools.
4. **Migrate existing data** from the local SQLite file to Neon (one-time script).
5. **Update all 25+ API routes** that use the synchronous `db.prepare(...).all()` / `.get()` / `.run()` pattern to use async `sql` tagged templates (the Neon driver is async).

**Important:** This is a significant refactor. Every API route changes from synchronous SQLite to async Postgres. The builder should:
- Create a new `src/lib/db.ts` that exports an async-compatible interface
- Consider creating a thin wrapper that mimics the `prepare/all/get/run` pattern but uses Neon under the hood, to minimize changes in each route
- Or, convert each route one by one to use the `neon` tagged template syntax

### Acceptance Criteria
- [ ] Dashboard loads successfully on Vercel (no "Couldn't load your menu data" error)
- [ ] All API routes work with Neon Postgres instead of SQLite
- [ ] Schema is created in Neon with all tables from the current SQLite schema
- [ ] Existing data (menu items, ingredients, recipes, etc.) is migrated to Neon
- [ ] Local development still works (can use the same Neon database or env-based switching)
- [ ] `better-sqlite3` dependency can be removed from `package.json`

---

## Feature Request: One-Off Receipt Purchases

### Context
When Jennifer scans a receipt and confirms matches, the app automatically updates ingredient prices. But sometimes she buys something as a one-time expense (e.g., a special ingredient for a catering order, or a bulk buy she won't repeat). She wants to flag those as "one-off" so the expense is tracked but it does NOT change the standard ingredient price used for food cost calculations.

### Current Flow
1. Scan receipt (`/api/receipts/scan`) — AI extracts items
2. Fuzzy-match items to ingredients (`/api/receipts/[id]/match`)
3. Review matches on review page (`/receipts/[id]/review`)
4. Confirm matches (`/api/receipts/[id]/confirm`) — this updates `ingredients.package_price` and `ingredients.cost_per_unit`, and records price history

### Design Approach
Add a third action type for receipt items: `"one_off"` alongside the existing `"update"` and `"skip"`.

**Database changes:**
- Add `is_one_off` boolean column to `receipt_items` table (default false)
- The `ingredient_price_history` table already has a `source` column; add a new source value `'receipt_one_off'` to distinguish these entries

**API changes (`/api/receipts/[id]/confirm`):**
- Accept `action: "update" | "skip" | "one_off"` in the `ConfirmItem` interface
- When action is `"one_off"`:
  - Still record the price in `ingredient_price_history` (with `source = 'receipt_one_off'`)
  - Still link the receipt item to the ingredient (`ingredient_id`, `match_status`)
  - Do NOT update `ingredients.package_price` or `ingredients.cost_per_unit`
  - Set `receipt_items.is_one_off = true`

**UI changes (Review page `receipts/[id]/review`):**
- Add a third button/toggle next to "Skip": a "One-Off" option
- When "One-Off" is selected, show the item as tracked but with a visual indicator (e.g., a tag/badge saying "one-off, won't update pricing")
- The confirm button text should reflect: "Confirm X Matches (Y one-off)"

### Key Files
- `src/app/api/receipts/[id]/confirm/route.ts` — Confirm logic
- `src/app/receipts/[id]/review/page.tsx` — Review UI
- `src/lib/db.ts` — Schema (add `is_one_off` column to `receipt_items`)

### Acceptance Criteria
- [ ] Review page shows a "One-Off" toggle/button for each receipt item (alongside Match and Skip)
- [ ] One-off items are linked to ingredients and recorded in price history with source `'receipt_one_off'`
- [ ] One-off items do NOT update the ingredient's current `package_price` or `cost_per_unit`
- [ ] The receipt detail page (`/receipts/[id]`) shows which items were one-off
- [ ] Expense tracking still counts one-off items toward total receipt cost
