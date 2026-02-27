# Financial Dashboard Complete - Epic 1

**Feature ID**: FIN-DASHBOARD
**Owner**: Architect
**Created**: 2026-02-22
**Status**: Planning
**Priority**: 🔴 CRITICAL

## Purpose

Complete the P&L financial dashboard to answer: **"Will The Porch survive or fail?"**

Show real-time profitability, prime cost, cash flow projections, and survival score.

## Business Problem

Jennifer has:
- ✅ 368 days of Square sales data ($260K annual revenue)
- ✅ Square labor/payroll sync
- ✅ Menu items with recipes

But is MISSING:
- ❌ No overhead expenses entered (rent, utilities, insurance = $0)
- ❌ No P&L dashboard
- ❌ No prime cost calculation (COGS + Labor)
- ❌ No projections or survival analysis

**Result**: She doesn't know if the business is profitable or losing money.

## Tasks

### Phase 1A: Overhead & Expense Entry (4 tasks)

**FIN-1**: Recurring expense entry UI
- Add rent, utilities, insurance, subscriptions
- Support one-time vs recurring (monthly, quarterly, annual)
- CSV import for historical year of data

**FIN-2**: Utility integration (FPL or similar)
- Manual CSV upload from utility website
- Track: cost per kWh, usage trends, seasonal patterns

**FIN-3**: Square fees auto-calculation
- Pull transaction fees from Square API
- Auto-categorize as "Payment Processing" expense

**FIN-4**: Subscription tracking dashboard
- List all recurring subscriptions
- Flag upcoming renewals

### Phase 1B: P&L Dashboard & KPIs (4 tasks)

**FIN-5**: Main P&L page (`/dashboard`)
- Revenue, COGS, Gross Profit, Labor, Overhead, Net Profit
- Drill-down by category
- Date range selector (daily, weekly, monthly, YTD)

**FIN-6**: Prime Cost calculation
- Prime Cost = COGS + Labor
- Target: <65% healthy, >70% danger
- Color-coded indicators

**FIN-7**: Key metrics dashboard
- Revenue Per Labor Hour (RPLH): Target >$50
- Food Cost %: Target 28-35%
- Labor %: Target 25-35%
- Break-Even Point
- Profit Margin

**FIN-8**: Historical comparison charts
- This month vs last month vs last year
- Trend lines
- Seasonality detection

### Phase 1C: COGS Automation (3 tasks)

**FIN-9**: Auto-calculate COGS from inventory usage
- Square sale → recipe deduction → sum ingredient costs = COGS
- Daily COGS roll-up to expenses table

**FIN-10**: Packaging cost tracking
- Separate food cost from packaging cost
- Show breakdown

**FIN-11**: Variance analysis
- Expected COGS vs Actual COGS
- Flag: "10% higher than expected - investigate"

### Phase 1D: Projections & Survival Analysis (5 tasks)

**FIN-12**: Projections Tab (Comprehensive Financial Forecasting)

**Purpose**: Answer "What will next month look like financially?" - this is THE demo feature for customers.

**Why "Projections" not "Survival Score"**: Customers aren't failing - they want to plan ahead and see what's coming. Survival score is just one component of the bigger picture.

**What it includes**:

1. **Monthly Revenue Projection**
   - Forecast next month's revenue based on:
     - Last 3 months average
     - Same month last year (seasonality)
     - Growth trend
   - Display: "Next month: $8,500 ± $500 (80% confidence)"
   - Chart: Revenue trend last 6 months + forecasted month

2. **Monthly Expense Projection**
   - Forecast next month's expenses by category:
     - COGS (based on avg % of revenue)
     - Labor (based on staffing levels + seasonal patterns)
     - Overhead (mostly fixed, use current values)
   - Display: "Expected COGS: $2,800, Labor: $2,100, Overhead: $1,650"
   - Show breakdown with confidence ranges

3. **Projected Profit/Loss**
   - Calculate: Projected Revenue - Projected Expenses
   - Display: "Projected profit next month: $1,950 ± $600"
   - Color-coded: Green if positive, Yellow if break-even, Red if loss
   - Compare to this month's actual profit

4. **Survival Score (0-100)** ⭐
   - Prominently displayed as circular gauge
   - Weighted scoring:
     - Cash reserves (30%): Months of runway (>3 months = 30 pts)
     - Profit trend (30%): Last 30 days vs previous 30 (improving = 30 pts)
     - Prime cost (20%): COGS+Labor % (<60% = 20 pts, 60-70% = 10 pts, >70% = 0 pts)
     - Revenue growth (20%): This month vs last month (>10% = 20 pts)
   - Color bands: Green (70-100) "Solid ground ✅", Yellow (40-69) "Caution ⚠️", Red (0-39) "Critical 🚨"
   - Show breakdown: "Cash: 15/30, Profit: 30/30, Prime Cost: 10/20, Growth: 15/20"

5. **Trend Analysis Charts**
   - Revenue trend (last 6 months + forecast)
   - Profit trend (last 6 months + forecast)
   - Prime cost % trend (last 6 months)
   - Interactive: Hover to see exact values

6. **Cash Flow Runway**
   - "At current burn rate, you have X months of runway"
   - Calculate: Current cash / avg monthly expenses
   - Alert if <3 months: "⚠️ Low cash reserves - consider cost cuts or revenue boost"

7. **Actionable Insights**
   Based on the projections, show 2-3 specific recommendations:
   - "📈 Revenue trending up 12% - on track for strong month"
   - "⚠️ Prime cost projected at 68% - watch portion sizes and labor hours"
   - "💰 Projected profit $1,950 - enough to cover new equipment purchase"
   - "🚨 Cash reserves only 2 months - prioritize receivables collection"

**UI Layout**:
```
┌─────────────────────────────────────────┐
│  PROJECTIONS                         📊 │
├─────────────────────────────────────────┤
│  ┌─────────────┐  ┌────────────────────┐│
│  │  SURVIVAL   │  │  NEXT MONTH        ││
│  │   SCORE     │  │  Revenue: $8,500   ││
│  │             │  │  Expenses: $6,550  ││
│  │     78      │  │  Profit: $1,950 ✅ ││
│  │   /100      │  │                    ││
│  │  ✅ Solid   │  │  (±$600 range)     ││
│  └─────────────┘  └────────────────────┘│
│                                          │
│  BREAKDOWN:                              │
│  Cash Reserves:    15/30                 │
│  Profit Trend:     30/30 ✅              │
│  Prime Cost:       10/20 ⚠️              │
│  Revenue Growth:   15/20                 │
│                                          │
│  ═══════════════════════════════════    │
│                                          │
│  TRENDS (Last 6 Months + Forecast)       │
│  [Revenue Chart]                         │
│  [Profit Chart]                          │
│  [Prime Cost % Chart]                    │
│                                          │
│  ═══════════════════════════════════    │
│                                          │
│  💡 INSIGHTS                             │
│  • Revenue trending up 12%               │
│  • Prime cost at 68% - monitor closely   │
│  • Projected profit covers expenses ✅   │
└─────────────────────────────────────────┘
```

**Forecasting Method** (Keep it simple):
- Revenue: 3-month moving average × seasonal factor (if data from last year exists)
- Expenses: Category-based averages (COGS as % of revenue, Labor from schedule, Overhead fixed)
- Confidence interval: Standard deviation of last 3 months × 1.5

**Demo Impact**: This tab shows customers "I can see the future of my business" - way more valuable than just "am I surviving?"

**FIN-13**: Break-even analysis
- How much revenue needed to cover expenses?
- Daily and monthly targets

**FIN-16**: Scenario planning tool (Phase 2 - not critical for initial demos)
- What-if calculator:
  - "If I raise prices 10%, profit increases $X"
  - "If I cut 1 employee, labor drops $X"
  - "If rent increases 15%, I need $X more revenue"

### Phase 1E: Alerts & Recommendations (4 tasks)

**FIN-17**: Financial health alerts
- Daily/weekly/monthly alerts for anomalies
- "Prime cost hit 72% this week (above target)"

**FIN-18**: Actionable recommendations
- "Your labor % is 38% (high). Reduce hours by 10/week to hit 32%."
- AI-generated suggestions

**FIN-19**: Benchmark comparisons
- Compare to coffee shop industry standards
- Flag areas above/below benchmarks

**FIN-20**: Weekly financial summary email
- "This week: Revenue $2,100, Profit $450, Prime Cost 64%"
- Top 3 wins, top 3 concerns
- Recommended actions

## Acceptance Criteria

- [ ] User can enter overhead expenses (rent, utilities, etc.)
- [ ] P&L dashboard shows real-time profit/loss
- [ ] Prime cost calculated and displayed with color-coding
- [ ] Survival score shows 0-100 with explanation
- [ ] Cash flow projection shows 30/60/90 day runway
- [ ] Break-even point calculated and displayed
- [ ] Weekly summary email sent automatically
- [ ] User can run "what-if" scenarios

## Estimated Effort

**20 tasks** - approximately 3-4 weeks if done sequentially, or 2 weeks with 2 builders in parallel.
