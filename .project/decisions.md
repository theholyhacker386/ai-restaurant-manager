# Decision Log

## 2026-03-05 - Security Attestation Parallel Execution Strategy
**Context**: Need to build 9 security systems + fix Plaid gaps for Plaid's 16 attestation requirements.
**Decision**: Split into 4 builder prompts: PLAID-FIX (fix existing), SEC-A (infrastructure), SEC-B (MFA), SEC-C (compliance/policy).
**Rationale**: SEC-A and SEC-C touch different files and can run in parallel. SEC-B depends on SEC-A (needs rate limiting + audit logging). PLAID-FIX works in existing worktree independently. This gives 3 parallel lanes: PLAID-FIX + SEC-A + SEC-C, then SEC-B after SEC-A.

## 2026-03-05 - Multi-Tenant Security Scoping
**Context**: Porch Financial is single-tenant, restaurant app is multi-tenant.
**Decision**: Every security table (audit_log, consent_records) includes restaurant_id. Audit logging function accepts restaurantId as parameter rather than using getTenantDb() since some events happen pre-auth.
**Rationale**: Consistent with existing app pattern where every query filters by restaurant_id. Pre-auth events (login failures) may not have a restaurant context yet.

## 2026-03-05 - Onboarding Upgrade: Chat vs. Launch Pad Split
**Context**: Onboarding captures ~35% of data needed for full platform use. Needs menu categories, business hours, recipes, bank/POS connections, and team members.
**Decision**: Add categories + business hours to the AI chat flow. Move bank connection, POS setup, team members, and recipe building to a post-onboarding "Launch Pad" page.
**Rationale**: Categories and hours work well conversationally (simple Q&A). Bank/POS need interactive widgets (OAuth, Plaid Link). Recipes are too complex for chat (68 items × 6 ingredients = 400+ links). The Launch Pad gives clear next-step guidance instead of dumping users on the dashboard with no direction.

## 2026-03-05 - Recipes NOT in Onboarding Chat
**Context**: Porch Financial has 410 recipe links (ingredient→menu item). Could try to capture these during onboarding.
**Decision**: Exclude recipes from onboarding entirely. Add to Launch Pad as a post-onboarding task.
**Rationale**: Conversationally building 400+ recipe links would take hours, exhaust GPT context, and produce errors. A dedicated recipe builder UI (future build) is the right approach. Users can still use the platform for expense tracking and sales without recipes — recipes unlock food cost per item, which is important but not blocking.
