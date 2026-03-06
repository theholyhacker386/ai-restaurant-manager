# Decision Log

## 2026-03-05 - Security Attestation Parallel Execution Strategy
**Context**: Need to build 9 security systems + fix Plaid gaps for Plaid's 16 attestation requirements.
**Decision**: Split into 4 builder prompts: PLAID-FIX (fix existing), SEC-A (infrastructure), SEC-B (MFA), SEC-C (compliance/policy).
**Rationale**: SEC-A and SEC-C touch different files and can run in parallel. SEC-B depends on SEC-A (needs rate limiting + audit logging). PLAID-FIX works in existing worktree independently. This gives 3 parallel lanes: PLAID-FIX + SEC-A + SEC-C, then SEC-B after SEC-A.

## 2026-03-05 - Multi-Tenant Security Scoping
**Context**: Porch Financial is single-tenant, restaurant app is multi-tenant.
**Decision**: Every security table (audit_log, consent_records) includes restaurant_id. Audit logging function accepts restaurantId as parameter rather than using getTenantDb() since some events happen pre-auth.
**Rationale**: Consistent with existing app pattern where every query filters by restaurant_id. Pre-auth events (login failures) may not have a restaurant context yet.
