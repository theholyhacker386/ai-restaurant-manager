# Multi-Tenant SaaS Platform - Epic 4

**Feature ID**: SAAS-PLATFORM
**Owner**: Architect
**Created**: 2026-02-22
**Status**: Planning
**Priority**: 🟢 LOW (but Jennifer wants to expedite)

## Purpose

Turn Porch Manager into a SaaS product for other coffee shops/restaurants. Charge monthly fee to manage for them.

## Why This Matters

AI is moving fast - need to get to market QUICKLY before competitors. Onboarding new restaurants takes 3-4 weeks (data entry), so we need the platform ready NOW so they can start filling it out while we finish building features.

## Tasks

### Phase 4A: Multi-Tenancy Architecture (4 tasks)

**SAAS-1**: Database schema refactor for multi-tenancy
- Add `tenant_id` to all tables
- Row-level security (RLS)
- Migration: Move current data to "the-porch" tenant

**SAAS-2**: Authentication & tenant management
- Sign up flow with tenant creation
- User roles: Owner, Manager, Staff
- Tenant settings (name, logo, branding)

**SAAS-3**: Subscription & billing (Stripe)
- Pricing tiers: Basic ($49/mo), Pro ($99/mo), Enterprise ($199/mo)
- Feature flags per tier

**SAAS-4**: Tenant isolation & security
- Data leakage prevention
- Audit logging
- GDPR compliance

### Phase 4B: AI Chatbot Onboarding (6 tasks)

**SAAS-5**: AI chatbot onboarding flow
- Real-time conversational Q&A
- "What POS system do you use?" → branches based on answer
- Natural language input (not just forms)
- GPT-4 powered

**SAAS-6**: Document upload & parsing
- Upload logo, invoices, receipts, bank statements
- AI extracts: package sizes, supplier info, pricing
- Auto-populates database

**SAAS-7**: Dynamic questionnaire generator
- Questions based on business type (coffee shop vs restaurant vs food truck)
- Conditional logic (if "Square" → ask for Square credentials)
- Progress tracking: "Your account is 60% set up"

**SAAS-8**: Data import wizards
- CSV import for: Menu items, ingredients, suppliers
- Template download
- Validation & error checking

**SAAS-9**: Setup checklist & guided tour
- Checklist: ☑ Menu uploaded, ☐ Suppliers added
- In-app tooltips
- Video tutorials

**SAAS-10**: POS integration marketplace
- Pre-built: Square, Toast, Clover
- OAuth flows
- Sync settings

### Phase 4C: Template Library (3 tasks)

**SAAS-11**: Industry-specific templates
- Coffee shop template (Porch's current setup)
- Restaurant template
- Food truck template
- Bakery template

**SAAS-12**: Expense category templates
- Pre-populated categories per industry
- Customizable

**SAAS-13**: Recipe library marketplace (optional upsell)
- Pre-built recipes
- Users can share recipes
- Premium recipes: $9.99

### Phase 4D: Admin & Support (3 tasks)

**SAAS-14**: Admin dashboard (for Jennifer to manage clients)
- View all tenants
- Usage stats
- Support ticketing
- Impersonate tenant (troubleshooting)

**SAAS-15**: Analytics & reporting (SaaS business metrics)
- MRR, churn rate, LTV
- Most used features
- Tenant health scores

**SAAS-16**: Help center & docs
- Knowledge base
- Video tutorials
- In-app tooltips

## Key Innovation: AI Chatbot Onboarding

Instead of static forms, use conversational AI:

**Example flow:**
```
AI: "Hi! I'm here to help you set up Porch Manager. What type of business do you run?"
User: "I have a coffee shop in Miami"

AI: "Great! Coffee shops typically track ingredients, suppliers, and daily sales.
     Do you use a POS system like Square or Toast?"
User: "Square"

AI: "Perfect! I can auto-sync your Square sales data. Can you upload a screenshot
     of your Square dashboard so I can verify your location ID?"
User: [uploads image]

AI: "Got it! I see you're 'Sunshine Cafe' in Miami. Let me connect to Square now...
     [Connecting...]
     Done! I've imported your last 30 days of sales.

     Next, let's add your menu items. You can either:
     1. Upload a CSV file
     2. Take a photo of your menu
     3. Tell me verbally and I'll create them

     Which would you prefer?"
```

This is MUCH faster than filling out forms and feels magical (AI-powered).

## Acceptance Criteria

- [ ] New user can sign up and create tenant account
- [ ] AI chatbot guides user through onboarding
- [ ] User can upload documents (invoices, menus, logos)
- [ ] AI extracts data from documents automatically
- [ ] Tenant data isolated (can't see other tenants)
- [ ] Stripe subscription active and billing monthly
- [ ] Admin dashboard shows all tenants and metrics
- [ ] User can select industry template (coffee shop, restaurant, etc.)

## Estimated Effort

**16 tasks** - approximately 4-5 weeks

## CRITICAL: Parallel Development Strategy

Jennifer wants this FAST. To expedite:

**Start SAAS-5 to SAAS-10 (chatbot onboarding) IMMEDIATELY in parallel with Epic 1/2**

Why:
- Even if features aren't done, users can START onboarding (entering data)
- By the time they finish data entry (3-4 weeks), features will be ready
- Gets us to market FASTER (AI is moving quickly)

**Phase 1 (NOW)**: Build chatbot + signup + data entry flows
**Phase 2 (while users onboard)**: Finish financial dashboard + automation features
**Phase 3 (when ready)**: Launch publicly with SaaS billing
