# PLAID-FIX: Fix Plaid Integration Gaps

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task
Fix 3 critical gaps in the Plaid bank connection feature that was just built. The builder's worktree is at `/Users/Jennifer/ai-restaurant-manager-builder-20260305-203947` on branch `build/20260305-203947`. You must work in THAT worktree — do NOT create a new one.

## Context

The Plaid integration was built but the builder's self-check identified these gaps:
1. **Missing `/api/plaid/approve` route** — The PlaidLink.tsx UI calls `/api/plaid/approve` (POST for single, PUT for bulk) but the route was never created. Without it, users can see transactions but can't approve them.
2. **Existing table schema mismatch** — The app already has `plaid_transactions` and `plaid_category_rules` tables from the PDF statement upload system. The `CREATE TABLE IF NOT EXISTS` in `plaid.ts` will silently skip them if they already exist but lack `restaurant_id`. Need ALTER TABLE fallback.
3. **No disconnect button in UI** — The `/api/plaid/disconnect` route exists but PlaidLink.tsx has no button to call it.

### Key files to read first:
- `/Users/Jennifer/porch-financial/src/app/api/plaid/approve/route.ts` — The working approve route to adapt
- The builder's worktree files (all under `/Users/Jennifer/ai-restaurant-manager-builder-20260305-203947/`):
  - `src/components/PlaidLink.tsx` — Current UI (lines 122-163 call `/api/plaid/approve`)
  - `src/lib/plaid.ts` — Table creation (needs ALTER TABLE additions)
  - `src/lib/tenant.ts` — For `getTenantDb()` pattern
  - `src/app/api/plaid/categorize/route.ts` — Example of existing route pattern

## Fix 1: Create `/api/plaid/approve/route.ts`

Create at: `src/app/api/plaid/approve/route.ts` (in the worktree)

Adapt from Porch Financial's approve route but with these changes:
- Use `getTenantDb()` instead of `getDb()` — returns `{ sql, restaurantId }`
- ALL queries must filter by `restaurant_id = ${restaurantId}`
- The `plaid_category_rules` unique constraint is `(restaurant_id, merchant_pattern, category_id)` — the ON CONFLICT clause must match
- Remove `is_soft_expense` references (not used in restaurant app)
- Keep the self-learning loop: approve → create expense → learn rule → auto-approve matching merchants
- The auto-approve matching merchants function must also scope by `restaurant_id`

**POST handler** (single approve): Takes `{ transaction_id, category_id, category_name }`
**PUT handler** (bulk approve): Takes `{ approvals: [{ transaction_id, category_id, category_name }] }`

Both should:
1. Mark transaction as approved (set `approved_category_id`, `review_status = 'approved'`)
2. Create/update expense entry in `expenses` table
3. Learn the merchant→category rule in `plaid_category_rules`
4. Auto-approve matching merchants across all months (scoped to restaurant_id)

## Fix 2: Add ALTER TABLE fallback in `plaid.ts`

In `ensurePlaidTables()`, AFTER the CREATE TABLE IF NOT EXISTS statements, add:

```typescript
// Handle existing tables that may lack restaurant_id
try {
  await sql`ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS restaurant_id TEXT`;
  await sql`ALTER TABLE plaid_category_rules ADD COLUMN IF NOT EXISTS restaurant_id TEXT`;
} catch {
  // Column may already exist
}
```

This ensures existing tables get the `restaurant_id` column added if they were created before multi-tenancy was added.

## Fix 3: Add Disconnect button to PlaidLink.tsx

In the connected accounts section of PlaidLink.tsx, add a small "Disconnect" button per account (or per institution). When clicked:
1. Confirm with user ("Are you sure you want to disconnect [bank name]?")
2. Call `POST /api/plaid/disconnect` with `{ item_id }`
3. Refresh the accounts list

Place it as a small text button or icon in the account card area. Keep styling consistent with the app (porch-brown, porch-cream, etc.).

## Acceptance Criteria
- [ ] `/api/plaid/approve` route exists with POST (single) and PUT (bulk) handlers
- [ ] Approve route uses `getTenantDb()` and filters by `restaurant_id`
- [ ] Approve route creates expense entries and learns category rules
- [ ] Auto-approve matching merchants works (scoped to restaurant_id)
- [ ] `ensurePlaidTables()` has ALTER TABLE fallback for restaurant_id on existing tables
- [ ] Disconnect button visible in UI for connected accounts
- [ ] Disconnect button calls the disconnect API and refreshes state
- [ ] `npm run build` passes with zero errors
