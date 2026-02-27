# FIX-1: Square API 401 Authentication Error on Sales Page

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Fix the Square API 401 error that occurs when users tap "Sync Now" on the Sales page. The Square SDK client is initialized at module level with a potentially empty token, and the token may not be set in Vercel's environment variables.

## Root Cause
1. The `SquareClient` in `src/lib/square.ts` is created at **module load time** (line 3-9). If `SQUARE_ACCESS_TOKEN` is not set or is empty, the client silently initializes with `token: ""`, then every API call returns 401.
2. The token from `.env.local` may not have been added to Vercel's project environment variables.
3. There are no guard checks in the sync/labor API routes to give a helpful error when the token is missing.

## Context
- Relevant files:
  - `src/lib/square.ts` — Square client initialization (lines 1-11)
  - `src/app/api/square/sync/route.ts` — Sales data sync (calls `fetchOrders`)
  - `src/app/api/square/labor/route.ts` — Labor data sync (calls `fetchLaborData`)
  - `src/app/sales/page.tsx` — Sales page frontend
- Spec: `.project/architect/features/demo-fixes.md`
- Reference for lazy init pattern: `src/lib/openai.ts` (lines 4-13) already does lazy initialization correctly

## Implementation Plan

### Step 1: Lazy-initialize the Square client
In `src/lib/square.ts`, change from eager module-level instantiation to a lazy getter (matching the pattern in `src/lib/openai.ts`):

```ts
import { SquareClient, SquareEnvironment } from "square";

let squareClient: SquareClient | null = null;

export function getSquareClient(): SquareClient {
  if (!squareClient) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) {
      throw new Error("SQUARE_ACCESS_TOKEN is not configured");
    }
    squareClient = new SquareClient({
      token,
      environment:
        process.env.SQUARE_ENVIRONMENT === "production"
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
    });
  }
  return squareClient;
}
```

### Step 2: Update all Square client usages
The functions `fetchOrders`, `fetchLaborData`, and `fetchCatalogItems` in `src/lib/square.ts` reference the module-level `squareClient`. Change them to call `getSquareClient()` instead.

Also update the named export: instead of `export { squareClient }`, export `getSquareClient`. Search for any other files importing `squareClient` directly and update them.

### Step 3: Add guard checks in API routes
In both `src/app/api/square/sync/route.ts` and `src/app/api/square/labor/route.ts`, wrap the Square calls in a try/catch that specifically handles the "not configured" error and returns a 503:

```ts
} catch (error: any) {
  if (error.message?.includes("not configured")) {
    return NextResponse.json(
      { error: "Square API is not configured. Please set your Square access token." },
      { status: 503 }
    );
  }
  // ... existing error handling
}
```

### Step 4: Verify Vercel env vars
Use the Vercel CLI or dashboard to confirm `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT`, and `SQUARE_LOCATION_ID` are set in the Vercel project's environment variables. The values should match what's in `.env.local`.

## Acceptance Criteria
- [ ] Square client is lazily initialized (not at module level)
- [ ] If `SQUARE_ACCESS_TOKEN` is missing, API routes return 503 with message "Square API is not configured" (not a raw 401)
- [ ] If token IS set, "Sync Now" on Sales page works and pulls data from Square
- [ ] No other files break from the `squareClient` export change (check all imports)
- [ ] `src/lib/openai.ts` pattern is matched for consistency
