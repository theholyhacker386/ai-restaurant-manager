# OB-1: Upgrade Onboarding Chat — Add Categories, Business Hours, Fix Branding

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task
Upgrade the onboarding AI chat flow to capture menu categories and business hours — two critical pieces of data that are currently missing. Also fix all "Porch Manager" branding to "AI Restaurant Manager".

## Context
- Spec: `.project/architect/features/onboarding-upgrade.md`
- Main files to modify:
  - `src/app/api/onboarding/chat/route.ts` — The system prompt that drives the AI conversation
  - `src/app/onboarding/page.tsx` — The chat UI, data tag parsing, session data, and completion logic
- Reference for how the app saves data:
  - `src/app/api/settings/route.ts` — PUT endpoint for business_settings (accepts business_hours JSON)
  - `src/app/api/menu-items/route.ts` — POST endpoint for creating menu items (check if it accepts category_id)
- Database context:
  - `menu_categories` table exists with: id, name, sort_order, created_at, updated_at, restaurant_id
  - `menu_items` table has a `category_id` column
  - `business_settings` table has a `business_hours` JSONB column (format: `{"0":{"open":"12:00","close":"17:00"},"1":null,...}` where 0=Sunday, 1=Monday, etc., null=closed)

## Implementation Details

### 1. Update System Prompt (`chat/route.ts`)

**Replace** "Porch Manager" with "AI Restaurant Manager" in the system prompt intro.

**Add two new sections** between current SECTION 5 (Spreadsheets) and current SECTION 6 (Review & Gaps):

**NEW SECTION 6 — MENU CATEGORIES:**
```
SECTION 6 — MENU CATEGORIES:
After menu items have been added, organize them into categories.
- Look at the collected menu items and suggest logical category groupings based on the item names.
- Say something like: "Now let me organize your menu. I see what looks like coffee drinks, smoothies, bowls, and sandwiches. Here's how I'd group them — let me know if you'd change anything."
- Present the groupings clearly so the user can confirm or adjust.
- Common restaurant categories: Coffee, Cold Brew, Specialty Lattes, Smoothies, Bowls, Sandwiches, Salads, Toast, Fresh Juice, Kombucha, Sides, Add-Ons, Desserts, Appetizers, Entrees, Beverages
- Use data tag: [SET_CATEGORIES:[{"name":"Coffee","items":["Latte","Cappuccino","Americano"]},{"name":"Smoothies","items":["Berry Blast","Green Machine"]}]]
- Only do this AFTER menu items have been collected. If no menu items yet, skip and come back.
```

**NEW SECTION 7 — BUSINESS HOURS:**
```
SECTION 7 — BUSINESS HOURS:
Ask what days they're open and their hours.
- "What days is your restaurant open, and what are your hours? For example: Tuesday through Saturday 8am to 6pm, Sunday noon to 5, closed Monday."
- Parse their answer into a day-by-day schedule.
- Confirm back: "Got it — Tue-Sat 8am-6pm, Sun 12pm-5pm, Monday closed. Sound right?"
- Use data tag: [SET_HOURS:{"0":{"open":"12:00","close":"17:00"},"1":null,"2":{"open":"08:00","close":"18:00"},"3":{"open":"08:00","close":"18:00"},"4":{"open":"08:00","close":"18:00"},"5":{"open":"08:00","close":"18:00"},"6":{"open":"08:00","close":"18:00"}}]
- Day numbers: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
- null means closed that day
- Use 24-hour format for open/close times (e.g. "08:00", "18:00", "17:00")
```

**Renumber the remaining sections:**
- Old SECTION 6 (Review & Gaps) → SECTION 8
- Old SECTION 7 (Cost Targets) → SECTION 9
- Old SECTION 8 (PIN Setup) → SECTION 10

**Update PROGRESS percentages** at the bottom of the system prompt:
```
ALWAYS include [PROGRESS:XX] (0-100) based on how far along you are:
- Restaurant info done: 8
- Suppliers done: 15
- Menu items done: 30
- Receipts/invoices done: 45
- Spreadsheets reviewed (optional): 55
- Menu categories organized: 62
- Business hours set: 70
- Review/gaps addressed: 78
- Cost targets set: 88
- PIN set: 95
- Everything complete: 100
```

**Also in the COMPLETION section**, update the summary to include categories and hours:
```
COMPLETION:
- When everything is done, give a summary: "Here's what we set up: [X] suppliers, [Y] menu items organized into [Z] categories, [N] ingredients. Food cost target: [F]%. Your hours are [days/times]."
- Say: "You're all set! Head to your Launch Pad to connect your bank, add team members, and start building recipes."
```

### 2. Update Client-Side (`onboarding/page.tsx`)

**a) Update `SessionData` interface** — add new fields:
```typescript
interface SessionData {
  businessInfo: { name?: string; type?: string; tenure?: string } | null;
  suppliers: string[];
  menuItems: { name: string; selling_price: number }[];
  ingredients: { name: string; package_size?: number | null; package_unit?: string; package_price?: number | null; supplier?: string }[];
  targets: { food_cost: number; labor_cost: number } | null;
  pinSet: boolean;
  pinValue: string;
  progress: number;
  categories: { name: string; items: string[] }[];        // NEW
  businessHours: Record<string, { open: string; close: string } | null> | null;  // NEW
}
```

**b) Update `INITIAL_SESSION`** — add defaults:
```typescript
const INITIAL_SESSION: SessionData = {
  // ... existing fields ...
  categories: [],
  businessHours: null,
};
```

**c) Add parsers in `parseDataTags()`:**

After the existing `targetMatch` block, add:

```typescript
// Categories
const catMatch = text.match(/\[SET_CATEGORIES:(\[[\s\S]*?\])\]/);
if (catMatch) {
  try {
    const cats = JSON.parse(catMatch[1]);
    updated.categories = cats.map((c: any) => ({
      name: c.name || "Uncategorized",
      items: c.items || [],
    }));
  } catch { /* ignore */ }
}

// Business hours
const hoursMatch = text.match(/\[SET_HOURS:(\{[\s\S]*?\})\]/);
if (hoursMatch) {
  try {
    updated.businessHours = JSON.parse(hoursMatch[1]);
  } catch { /* ignore */ }
}
```

**d) Update the cleanText regex section** to strip the new tags:
Add these lines to the chain of `.replace()` calls:
```typescript
.replace(/\[SET_CATEGORIES:\[[\s\S]*?\]]/g, "")
.replace(/\[SET_HOURS:\{[\s\S]*?\}]/g, "")
```

**e) Update `completeOnboarding()`:**

After saving cost targets, ADD category and hours saving logic:

```typescript
// Save menu categories and assign items
if (data.categories.length > 0) {
  for (let i = 0; i < data.categories.length; i++) {
    const cat = data.categories[i];
    try {
      // Create category via API or direct — use the menu-categories pattern
      const catRes = await fetch("/api/menu-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cat.name, sort_order: i + 1 }),
      });
      if (catRes.ok) {
        const catData = await catRes.json();
        const categoryId = catData.id || catData.category?.id;
        // Assign menu items to this category
        if (categoryId && cat.items) {
          for (const itemName of cat.items) {
            // Find matching menu item and update its category
            await fetch("/api/menu-items/assign-category", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemName, categoryId }),
            });
          }
        }
      }
    } catch (err) {
      console.error("Error saving category:", err);
    }
  }
}
```

**IMPORTANT**: Check if `/api/menu-categories` POST endpoint exists. If not, create a simple one:
- Read `src/app/api/menu-categories/route.ts` — if it exists, use its pattern.
- If it doesn't exist, create it: accept `{ name, sort_order }`, insert into `menu_categories` table, return the created record with `id`.

**Also check if `/api/menu-items/assign-category` exists**. If not, create a simple endpoint:
- Accept `{ itemName, categoryId }`
- UPDATE menu_items SET category_id = $categoryId WHERE LOWER(name) = LOWER($itemName) AND restaurant_id = $restaurantId

**Update the settings save** to use real business hours instead of hardcoded ones:
Replace the hardcoded `business_hours` object in the settings PUT with:
```typescript
business_hours: data.businessHours || {
  "0": { open: "12:00", close: "17:00" },
  "1": null,
  "2": { open: "08:00", close: "18:00" },
  "3": { open: "08:00", close: "18:00" },
  "4": { open: "08:00", close: "18:00" },
  "5": { open: "08:00", close: "18:00" },
  "6": { open: "08:00", close: "18:00" },
},
```
(Keep the hardcoded version as fallback only if user somehow skipped the hours question.)

**f) Update the `contextNote` in `chat/route.ts`** to include the new session data:
After existing parts, add:
```typescript
if (sessionData.categories?.length) parts.push(`${sessionData.categories.length} menu categories set`);
if (sessionData.businessHours) parts.push(`Business hours configured`);
```

**g) Update completion redirect:**
Change the completion phase to redirect to `/launch-pad` instead of showing the static "You're All Set" screen:
```typescript
// In the [ONBOARDING_COMPLETE] handler:
if (data.reply.includes("[ONBOARDING_COMPLETE]")) {
  await completeOnboarding(updatedSession, newHistory);
  router.push("/launch-pad");
}
```

**h) Fix ALL "Porch Manager" references** in `onboarding/page.tsx`:
- The checklist header says "Porch Manager" — change to "AI Restaurant Manager"
- The fallback greeting says "Porch Manager" — change to "AI Restaurant Manager"
- Any other instances

### 3. Update Checklist Items

Update `CHECKLIST_OPTIONAL` to add business hours:
```typescript
const CHECKLIST_OPTIONAL = [
  { id: "spreadsheet", icon: "📊", label: "Cost spreadsheet or P&L", desc: "If you track costs in a spreadsheet, have it ready to upload. CSV, Excel, or PDF." },
  { id: "costs", icon: "💰", label: "Monthly overhead costs", desc: "Rent, utilities, insurance amounts. Helpful but not required right now." },
  { id: "pos", icon: "📱", label: "POS system info", desc: "Know which system you use (Square, Toast, Clover, etc.)" },
  { id: "hours", icon: "🕐", label: "Business hours", desc: "Know your open/close times for each day of the week." },
];
```

### 4. Update Session Data in `complete/route.ts` (PUT handler)

The `meta` object needs to include the new fields so they persist across page reloads:
```typescript
const meta = {
  suppliers: sessionData?.suppliers || [],
  targets: sessionData?.targets || null,
  tenure: sessionData?.businessInfo?.tenure || "",
  pinSet: sessionData?.pinSet || false,
  categories: sessionData?.categories || [],           // NEW
  businessHours: sessionData?.businessHours || null,    // NEW
};
```

And in the GET handler, restore them:
```typescript
const sessionData = {
  // ... existing fields ...
  categories: storedMeta.categories || [],
  businessHours: storedMeta.businessHours || null,
};
```

## Acceptance Criteria
- [ ] System prompt includes menu categories section — AI suggests groupings after menu items are collected
- [ ] System prompt includes business hours section — AI asks day-by-day hours
- [ ] `[SET_CATEGORIES:[...]]` data tag parsed correctly on client side
- [ ] `[SET_HOURS:{...}]` data tag parsed correctly on client side
- [ ] Categories saved to `menu_categories` table on completion
- [ ] Menu items assigned to their categories on completion
- [ ] Business hours saved to `business_settings` (not hardcoded defaults)
- [ ] Session data persists across page reloads (categories + hours stored in onboarding_sessions)
- [ ] All "Porch Manager" replaced with "AI Restaurant Manager"
- [ ] Progress percentages updated (8 → 15 → 30 → 45 → 55 → 62 → 70 → 78 → 88 → 95 → 100)
- [ ] Completion redirects to `/launch-pad` (even if page doesn't exist yet — it'll be built by OB-2)
- [ ] `npm run build` passes with zero errors
