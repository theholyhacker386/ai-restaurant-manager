# UI-1: Dashboard Home Page & App Layout

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Build the main app layout and dashboard home page for The Porch Health Park financial dashboard. This is a mobile-first web app for a café owner to manage her business finances.

## Context
- Relevant files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Dependencies: The API routes already exist at `src/app/api/` for menu-items, ingredients, recipes, and categories
- Database: SQLite via `src/lib/db.ts` (already built)
- Spec: `.project/architect/features/dashboard-home.md`

## What to Build

### 1. App Layout (`src/app/layout.tsx`)
- Mobile-first layout with bottom tab navigation bar
- Tabs: Dashboard (home icon) | Menu (utensils icon) | Ingredients (shopping cart icon) | Expenses (dollar icon)
- Warm, professional color scheme (earth tones, not corporate/cold)
- Use Tailwind CSS for all styling
- Header: "The Porch Health Park" with subtitle "Financial Dashboard"

### 2. Dashboard Home Page (`src/app/page.tsx`)
- Quick stats cards showing:
  - Total menu items count
  - Items needing attention (danger/warning status)
  - Average food cost % across all costed items
- Menu health summary (how many green/yellow/red/gray items)
- Quick action buttons: "Add Menu Item", "Add Ingredient"
- Fetch data from `GET /api/menu-items`

### 3. Global Styles (`src/app/globals.css`)
- Warm café color palette
- Mobile-friendly base styles
- Custom color variables for status indicators (green, yellow, red)

### Design Requirements
- Mobile-first: designed for iPhone in hand
- Large touch targets (min 44px)
- Warm color scheme: browns, creams, teal accents
- Status colors: green (#22c55e), amber (#f59e0b), red (#ef4444), gray (#9ca3af)
- Clean, simple — no clutter. This user is non-technical.
- Bottom nav bar is fixed to the bottom of the screen

## Acceptance Criteria
- [ ] App has a warm, professional look appropriate for a café business
- [ ] Bottom tab navigation with 4 tabs, fixed to screen bottom
- [ ] Dashboard shows summary stats from the API
- [ ] Quick action buttons are large and thumb-friendly
- [ ] Layout works well on mobile (375px width and up)
- [ ] No technical jargon visible to the user
- [ ] Uses Tailwind CSS exclusively for styling
