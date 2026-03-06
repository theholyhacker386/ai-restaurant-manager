# OB-2: Post-Onboarding Launch Pad + Assistant Hours Fix

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task
Build the post-onboarding Launch Pad page that guides users to connect their bank, set up their POS, add team members, and start building recipes. Also fix the AI assistant's system prompt to read actual business hours from the database instead of using hardcoded values.

## Context
- Spec: `.project/architect/features/onboarding-upgrade.md`
- OB-1 modifies the onboarding to redirect to `/launch-pad` on completion
- Files to create:
  - `src/app/launch-pad/page.tsx` — New post-onboarding guidance page
- Files to modify:
  - `src/lib/assistant-prompt.ts` — Fix hardcoded business hours in the AI assistant's system prompt
- Reference files:
  - `src/app/onboarding/page.tsx` — For styling patterns (porch-brown, porch-cream, porch-teal)
  - `src/app/bank-connections/page.tsx` — Exists, this is where Plaid Link lives
  - `src/app/settings/page.tsx` — Has team management tab
  - `src/components/HamburgerMenu.tsx` — For navigation patterns

## Implementation Details

### 1. Create Launch Pad Page (`src/app/launch-pad/page.tsx`)

**This is a "use client" page.** It should:

a) **Fetch current state** on mount to know what's already been done:
- GET `/api/settings` — check if business hours exist
- GET `/api/onboarding/complete` — get session data (menu items count, ingredients count, suppliers count, categories count)
- GET `/api/plaid/accounts` — check if any bank accounts connected (catch errors if no accounts)
- GET `/api/team` — check if any team members beyond the owner exist

b) **Show a header** with the restaurant name and a welcome message:
```
🚀 Your Launch Pad
[Restaurant Name] is set up and ready! Complete these steps to get the most out of your platform.
```

c) **Show completed items** (green checkmarks) — what was done during onboarding:
```
✅ Restaurant info configured
✅ [X] menu items added across [Y] categories
✅ [Z] ingredients with costs loaded
✅ Business hours set
✅ Cost targets configured (food: [F]%, labor: [L]%)
```

d) **Show next steps** as actionable cards — each with a button:

```
CONNECT YOUR TOOLS
━━━━━━━━━━━━━━━━━

🏦 Connect Bank Account
Import transactions automatically from your bank.
[Connect Bank →]  → navigates to /bank-connections
Status: "Connected" (green) or "Not connected" (gray)

📱 Connect Square POS
Pull in sales and labor data automatically.
[Coming Soon]  → disabled button
Status: "Coming soon" (gray)

SET UP YOUR TEAM
━━━━━━━━━━━━━━━━

👥 Add Team Members
Create logins for your managers and staff.
[Add Team →]  → navigates to /settings (with team tab)
Status: "[N] team members" or "Just you so far"

BUILD YOUR RECIPES
━━━━━━━━━━━━━━━━━

📋 Link Ingredients to Menu Items
Tell us which ingredients go into each dish so we can track food cost per item.
[Build Recipes →]  → navigates to /recipes (if exists) or /menu (if recipes page doesn't exist)
Status: "[X] of [Y] items have recipes" or "No recipes yet"
```

e) **Show a "Go to Dashboard" button** at the bottom:
```
[Go to Dashboard →]  → navigates to /
```

f) **Styling**: Use the app's existing design system:
- Background: `bg-porch-cream`
- Cards: `bg-white rounded-xl shadow-sm p-4`
- Completed items: green checkmark (`text-green-600`)
- Action buttons: `bg-porch-teal text-white rounded-lg px-4 py-2`
- Coming soon buttons: `bg-gray-200 text-gray-500 rounded-lg px-4 py-2 cursor-not-allowed`
- Header: `bg-porch-brown text-white`

g) **Authentication**: This page requires login. Use the existing auth pattern:
```typescript
import { auth } from "@/lib/auth";
```
If using "use client", check auth on mount and redirect to login if not authenticated.

Actually, since this is client-side and other pages like bank-connections work as "use client", just have it fetch data and handle 401s gracefully.

### 2. Fix AI Assistant Business Hours (`src/lib/assistant-prompt.ts`)

Read the file first. Find where business hours are mentioned in the system prompt. The issue is that hours are hardcoded instead of being read from the database.

**The fix**: The `getAssistantPrompt()` function (or whatever it's called) likely accepts some parameters or context. Modify it to:

a) Accept business hours as a parameter (if it doesn't already):
```typescript
export function getAssistantPrompt(context: { businessHours?: Record<string, { open: string; close: string } | null>; ... }): string {
```

b) In the system prompt string, replace any hardcoded hours with dynamic values:
```typescript
// Format hours for the prompt
function formatHoursForPrompt(hours: Record<string, { open: string; close: string } | null> | undefined): string {
  if (!hours) return "Business hours not set.";
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = hours[String(i)];
    if (day === null || day === undefined) {
      lines.push(`${dayNames[i]}: Closed`);
    } else {
      lines.push(`${dayNames[i]}: ${day.open} - ${day.close}`);
    }
  }
  return lines.join("\n");
}
```

c) Find where the prompt is called (likely in `src/app/api/assistant/route.ts` or similar) and pass the business hours from the database query that already fetches settings.

**NOTE**: Read `assistant-prompt.ts` carefully first. The hours might be embedded as a literal string like:
```
"Business hours: Monday-Friday 8am-6pm, Sunday 12pm-5pm"
```
Replace that entire string with the dynamically formatted version.

If the prompt function is called from an API route that already queries `business_settings`, just pass the `business_hours` field through. If not, add a query:
```typescript
const settings = await sql`SELECT business_hours FROM business_settings WHERE restaurant_id = ${restaurantId} LIMIT 1`;
const hours = settings[0]?.business_hours;
```

### 3. Add Launch Pad to Navigation

Add a link to the Launch Pad in the hamburger menu or bottom nav for easy return access.

Read `src/components/HamburgerMenu.tsx` and add an entry:
```typescript
{ label: "Launch Pad", href: "/launch-pad", icon: "🚀" }
```

Place it near the top of the menu or in a "Setup" section.

## Acceptance Criteria
- [ ] `/launch-pad` page exists and renders correctly
- [ ] Shows completed onboarding steps with green checkmarks and counts
- [ ] "Connect Bank" button navigates to `/bank-connections`
- [ ] "Connect Square" shows as "Coming Soon" (disabled)
- [ ] "Add Team" button navigates to `/settings`
- [ ] "Build Recipes" button navigates to appropriate page
- [ ] "Go to Dashboard" button navigates to `/`
- [ ] Page fetches real data (menu item counts, bank connection status, team count)
- [ ] AI assistant prompt uses real business hours from database (not hardcoded)
- [ ] Launch Pad accessible from hamburger menu
- [ ] Page handles loading and error states gracefully
- [ ] `npm run build` passes with zero errors
