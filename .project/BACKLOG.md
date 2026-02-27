# The Porch Health Park - Backlog

## Phase 1: Menu Costing & Foundation (COMPLETE)

### Wave 1 (COMPLETE)
- [x] **UI-1**: Dashboard Home Page & App Layout (Session 1)
- [x] **UI-3**: Ingredient Manager Pages (Session 1)

### Wave 2 (COMPLETE)
- [x] **UI-2**: Menu Items List & Add/Edit Pages (Session 1)

### Wave 3 (COMPLETE)
- [x] **UI-4**: Recipe Builder Page (Session 1)

### Data Entry (COMPLETE)
- [x] **DATA-1**: Packaging recipes for 81 menu items (292 recipes) (Session 2-3)
- [x] **DATA-2**: ingredient_type column (food vs packaging) (Session 3)
- [x] **DATA-3**: API updates for packaging_cost & food_recipe_count (Session 3)
- [x] **FIX-1**: Recipe builder dropdown overflow bug fix (Session 3)
- [x] **UI-5**: Supplier badges on recipe builder (Session 3)

---

## Phase 2: Integrations & Live Data (COMPLETE)

### Receipt Tracker (COMPLETE - Session 4)
- [x] **RECEIPT-1**: Receipt scanner with OpenAI Vision + fuzzy matching
- [x] **RECEIPT-2**: Receipt review UI with 30% price jump alerts
- [x] **RECEIPT-3**: Price history tracking on ingredient detail pages

### Square Integration (COMPLETE - Session 4)
- [x] **LABOR-1**: Square labor/payroll sync + sales page payroll section

### Franchise-Level P&L (COMPLETE - Session 4)
- [x] **PNL-1**: Full P&L with 55+ expense categories across 12 types
- [x] **PNL-2**: KPI dashboard (Prime Cost, RPLH, Break-Even, Food Cost Variance, Avg Ticket)
- [x] **PNL-3**: Expense entry with grouped categories
- [x] **FIX-2**: Revenue fix — use Net Sales (matches Square) + Central timezone fix

### Demo-Ready Features (COMPLETE - Session 5)
- [x] **FIN-5**: Enhanced P&L Dashboard - structured sections with 6 date ranges, drill-down, color-coded margins
- [x] **FIN-12**: Projections Tab - survival score (0-100), monthly forecasts, trend charts, cash flow runway
- [x] **DEPLOY-1**: Deploy to production - LIVE at https://porch-financial.vercel.app
- [x] **ONBOARD-1**: AI onboarding questionnaire - DEPLOYED to Vercel + GitHub
- [x] **FIN-6**: Prime Cost calculation with color-coding
- [x] **FIN-7**: Enhanced KPI metrics dashboard (RPLH, Food Cost %, Labor % with benchmarks)
- [x] **AUTO-10**: Orders dashboard UI (shopping lists by supplier)
- [x] **AUTO-1**: Auto-inventory deduction from sales (Square webhook + manual API)
- [x] **AUTO-2**: Ingredient usage tracking and history page

### Demo Fixes (COMPLETE - Session 5-6)
- [x] **FIX-3**: Migrate database from SQLite to Neon Postgres (all API routes)
- [x] **FIX-1**: Square API 401 fix (lazy-init client, verify Vercel env vars)
- [x] **FIX-2**: Receipt scanner filesystem fix (store images in DB instead of disk)
- [x] **FEAT-ONEOFF**: One-off receipt purchases (track expense without updating standard pricing)

### Banking & Expenses (COMPLETE - Session 6)
- [x] **PLAID-1**: Plaid bank connection + transaction categorization
- [x] **PLAID-2**: Bank statement PDF upload + AI parsing
- [x] **PLAID-3**: Transaction review UI with category rules + learned rules

---

## Phase 3: AI Assistant Manager (COMPLETE - Session 6)

### Phase A: Chat Foundation (COMPLETE)
- [x] **AI-1**: Chat API endpoint with OpenAI function calling + 22 tool definitions + tool executor
- [x] **AI-2**: Chat UI component (floating button, slide-up panel, message bubbles, action cards)

### Phase B: Voice Input (COMPLETE)
- [x] **AI-3**: Speech-to-text integration (Web Speech API, mic button, auto-send)

### Phase C: Intelligence & Operations (COMPLETE)
- [x] **AI-4**: Morning briefing cron (nightly scan after close) + push notifications
- [x] **AI-5**: Smart alerts (food cost, labor cost, low stock)
- [x] **AI-6**: Business status + recommendations engine

### Operations Features (COMPLETE - Session 6)
- [x] **SHOP-1**: Shopping list generator from sales data + recipes (grouped by supplier)
- [x] **SHOP-2**: Shopping list UI with check-off, supplier grouping, cost estimates
- [x] **INV-1**: Inventory check system (conversational stock counts via AI)
- [x] **INV-2**: Low stock alerts + reorder points
- [x] **RECIPE-1**: Sub-recipe system (house-made items with components)
- [x] **RECIPE-2**: House Made Recipes category on recipe cards + print view
- [x] **RECIPE-3**: Sub-recipe data sync (48 rows across 11 sub-recipes)
- [x] **HOUR-1**: Hourly profitability analysis page
- [x] **NAV-1**: Hamburger menu + slim bottom nav redesign
- [x] **TEAM-1**: Team management + role-based access (owner/team)
- [x] **AUDIT-1**: Full site audit (API routes, pages, lib/components, database schema)
- [x] **RECV-1**: Receive Order flow (multi-shipment delivery check-in, inventory updates, reorder flags)

---

## Phase 4: Polish & Security (IN PROGRESS)

### Security & Compliance
- [x] **SEC-1**: Privacy & Security page addressing 11 Plaid questionnaire items
- [ ] **SEC-2**: Plaid security questionnaire completion (Colby)

### Data Cleanup
- [ ] **CLEAN-1**: Remove 177 orphaned recipe records (157 deleted menu items + 20 deleted ingredients)
- [ ] **CLEAN-2**: Fix 3 sub-recipe suppliers to "Homemade" (Chickpea Smash, Tomato Dipping Sauce, Chicken Curry Salad)
- [ ] **CLEAN-3**: Move hardcoded email to environment variable

### Data Entry Needed (Colby)
- [ ] Enter monthly overhead expenses (rent, utilities, insurance, etc.)
- [ ] Scan receipts to auto-update ingredient prices
- [ ] Provide supplier info for remaining unpriced ingredients

---

## Phase 5: SaaS Platform (FUTURE)

- [ ] Multi-tenant database architecture
- [ ] Signup flow + authentication per restaurant
- [ ] AI chatbot onboarding for new customers
- [ ] SaaS pricing + billing (Stripe)
- [ ] Custom domain per restaurant
