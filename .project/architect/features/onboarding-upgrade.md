# Onboarding Upgrade: 100% Data Capture for Launch Readiness

## Purpose
The current onboarding flow captures ~35% of the data a restaurant needs to fully use the platform. This upgrade ensures every piece of data from a real production restaurant (benchmarked against Porch Financial's 68 menu items, 210 ingredients, 410 recipes, 16 suppliers, custom business hours, team members, and bank/POS connections) gets captured during onboarding — so the user's first login gives them a fully operational system.

## Gap Analysis Summary

### Currently Captured (keep as-is):
1. Restaurant name, type, tenure
2. Supplier names (from conversation)
3. Menu item names + selling prices (from menu photo/PDF/manual)
4. Ingredient names + costs (from receipt/invoice/spreadsheet uploads)
5. Food cost target + labor cost target
6. Login PIN

### NOT Captured (must add):

| # | Gap | Impact | Priority |
|---|-----|--------|----------|
| 1 | **Menu categories** | Items land in unsorted list; no category-based reporting | HIGH |
| 2 | **Recipes** (ingredient→menu item links) | Cannot calculate food cost per item — defeats core value | CRITICAL |
| 3 | **Business hours** | Hardcoded wrong defaults (Mon-Fri); never asked | HIGH |
| 4 | **Team members** | Owner can't add staff during setup; no PINs for crew | MEDIUM |
| 5 | **Bank connection (Plaid)** | User has to find it on their own post-setup | MEDIUM |
| 6 | **Square/POS connection** | Mentioned in checklist but NO implementation exists | HIGH |
| 7 | **Par levels / reorder points** | Inventory alerts don't work without these | LOW (Phase 2) |
| 8 | **Ingredient types** (food/packaging/sub-recipe) | Grouping and sub-recipe support missing | LOW (Phase 2) |
| 9 | **Post-onboarding guidance** | User lands on dashboard with zero direction | HIGH |
| 10 | **Business hours in AI assistant prompt** | Assistant uses hardcoded hours, never reads settings | MEDIUM |

## Design Approach

### Architecture: Extend the Existing Conversational Flow

The current system works well — GPT-4o conversation with data tags parsed client-side. We extend it by:

1. **Adding new sections** to the system prompt (business hours, menu categories, team, recipes)
2. **Adding new data tags** for the new data types
3. **Adding new parsers** on the client side
4. **Updating `completeOnboarding()`** to save the new data to the right tables
5. **Adding a post-onboarding "Launch Pad"** page that guides next steps (bank, POS, etc.)

### What STAYS in the AI Chat:
- Restaurant info (name, type, tenure) — already works
- Suppliers — already works
- Menu items — already works, but **add category assignment**
- Ingredients/receipts — already works
- **NEW: Business hours** — AI asks day-by-day
- **NEW: Menu categories** — AI groups items after menu upload
- Cost targets — already works
- PIN setup — already works

### What Moves to Post-Onboarding "Launch Pad":
These are interactive flows that don't fit a chat conversation:
- **Bank connection** (Plaid Link widget — requires button/modal)
- **Square/POS connection** (OAuth redirect — requires opening Square's auth page)
- **Team member setup** (already has a Settings > Team UI)
- **Recipe building** (too complex for chat — 410 recipes can't be done conversationally)

### Why NOT put recipes in the chat:
A restaurant with 68 items × ~6 ingredients each = 408 recipe links. Doing this conversationally would take hours and the AI would lose context. Instead, we add a recipe builder to the Launch Pad that:
- Shows each menu item
- Suggests ingredients from the ones uploaded
- Lets the user assign quantities quickly
- Can be done over multiple sessions

## Detailed Implementation

### Part 1: System Prompt Upgrade (chat/route.ts)

Add these sections to the system prompt AFTER existing Section 5 (spreadsheets) and BEFORE current Section 6 (review):

**NEW SECTION 6 — MENU CATEGORIES:**
```
After menu items are added, organize them into categories.
- Look at the items and suggest logical groups: "I see drinks, bowls, sandwiches, and salads. Let me organize those into categories."
- Suggest categories based on item names; let user confirm or modify
- Common categories: Coffee, Cold Brew, Smoothies, Bowls, Sandwiches, Salads, Toast, Specialty Lattes, Kombucha, Fresh Juice, Add-Ons
- Use data tag: [SET_CATEGORIES:[{"name":"Coffee","items":["Latte","Cappuccino"]}]]
```

**NEW SECTION 7 — BUSINESS HOURS:**
```
Ask about their business hours.
- "What days are you open, and what are your hours? For example: Mon-Fri 8am-6pm, closed Sundays?"
- Parse into day-by-day format
- Use data tag: [SET_HOURS:{"0":{"open":"12:00","close":"17:00"},"1":null,"2":{"open":"08:00","close":"18:00"},...}]
- Day numbers: 0=Sunday, 1=Monday, 2=Tuesday, etc.
- null means closed that day
```

**Renumber existing sections:**
- Current Section 6 (Review) → Section 8
- Current Section 7 (Cost Targets) → Section 9
- Current Section 8 (PIN) → Section 10

**Update progress percentages:**
```
- Restaurant info: 8
- Suppliers: 15
- Menu items: 30
- Receipts/invoices: 45
- Spreadsheets (optional): 55
- Menu categories organized: 62
- Business hours set: 70
- Review/gaps: 78
- Cost targets: 88
- PIN set: 95
- Complete: 100
```

### New Data Tags to Add:

```
[SET_CATEGORIES:[{"name":"Category Name","items":["Item1","Item2"]}]]
[SET_HOURS:{"0":{"open":"HH:MM","close":"HH:MM"},"1":null,...}]
[ADD_TEAM_MEMBERS:[{"name":"...","role":"manager","email":"..."}]]
```

### Part 2: Client-Side Data Tag Parsing (onboarding/page.tsx)

Update `SessionData` interface:
```typescript
interface SessionData {
  // ... existing fields ...
  categories: { name: string; items: string[] }[];
  businessHours: Record<string, { open: string; close: string } | null>;
  teamMembers: { name: string; role: string; email: string }[];
}
```

Add parsers for `[SET_CATEGORIES:...]`, `[SET_HOURS:...]`, `[ADD_TEAM_MEMBERS:...]`.

Update `parseDataTags()` to handle the new tags.
Update the regex strip section to clean the new tags from display text.

### Part 3: Save New Data on Completion (onboarding/page.tsx)

Update `completeOnboarding()`:

1. **Save menu categories** → POST to `/api/menu-categories` for each category
2. **Assign items to categories** → Update menu_items with category_id
3. **Save business hours** → Include in the settings PUT (replace hardcoded defaults)
4. **Save team members** → POST to `/api/team` for each member (if any added)

### Part 4: Post-Onboarding Launch Pad (NEW page)

Create `src/app/launch-pad/page.tsx`:

A checklist-style page that appears after onboarding completes (instead of just "You're All Set!"). Shows:

```
Your Restaurant is Ready! Here's What to Do Next:

[x] Restaurant info set up
[x] Menu items added (68 items in 15 categories)
[x] Ingredients and costs loaded (210 ingredients)
[x] Business hours configured
[x] Cost targets set

Now let's connect your tools:

[ ] Connect your bank account — Auto-import transactions
    [Connect Bank Account] button → navigates to /bank-connections

[ ] Connect Square POS — Pull in sales data automatically
    [Connect Square] button → starts Square OAuth
    (shows "Coming soon" if Square OAuth not built yet)

[ ] Add team members — Set up PINs for your staff
    [Add Team] button → navigates to /settings (team tab)

[ ] Build recipes — Link ingredients to menu items for food cost tracking
    [Start Building] button → navigates to /recipes (or new recipe builder)

[Go to Dashboard →]
```

### Part 5: Fix App Name

The system prompt and UI currently say "Porch Manager" in multiple places. Replace with "AI Restaurant Manager" or the dynamic restaurant name.

### Part 6: Fix Business Hours in Assistant Prompt

In `src/lib/assistant-prompt.ts`, the AI assistant's system prompt has hardcoded business hours. Update it to read from `business_settings` table and use the actual hours.

## File Changes Summary

| File | Change Type | What Changes |
|------|------------|--------------|
| `src/app/api/onboarding/chat/route.ts` | MODIFY | Add categories, hours, team sections to system prompt; new data tags; update progress % |
| `src/app/onboarding/page.tsx` | MODIFY | Add new SessionData fields, new tag parsers, update completeOnboarding() to save categories/hours, update completion redirect to launch-pad |
| `src/app/launch-pad/page.tsx` | NEW | Post-onboarding guidance page with next-step checklist |
| `src/lib/assistant-prompt.ts` | MODIFY | Read business_hours from settings instead of hardcoded |
| `src/app/api/onboarding/chat/route.ts` | MODIFY | Fix "Porch Manager" → "AI Restaurant Manager" |
| `src/app/onboarding/page.tsx` | MODIFY | Fix "Porch Manager" references |

## What's NOT in This Build (Phase 2)

1. **Square OAuth connection** — Requires Square Developer app credentials and OAuth implementation. The Launch Pad will show a "Coming soon" placeholder for this.
2. **Recipe builder UI** — Complex interactive UI for linking ingredients to menu items. Requires its own spec. The Launch Pad will link to it.
3. **Par levels / reorder points** — Can be added to ingredients later via the ingredient edit screen.
4. **Ingredient types** (food/packaging/sub-recipe) — Low priority, can be added to ingredient management later.
5. **Sub-recipe system** — Requires recipe builder first.

## Acceptance Criteria

- [ ] Onboarding asks for menu categories and assigns items to them
- [ ] Onboarding asks for business hours (day-by-day)
- [ ] Business hours are saved to business_settings (not hardcoded defaults)
- [ ] Menu items are saved with their category assignments
- [ ] Post-onboarding shows Launch Pad with actionable next steps
- [ ] Launch Pad links to bank connections, team settings, and future recipe builder
- [ ] "Porch Manager" replaced with "AI Restaurant Manager" everywhere in onboarding
- [ ] AI assistant prompt reads real business hours from settings
- [ ] Checklist page updated with new items (business hours, categories)
- [ ] `npm run build` passes with zero errors
