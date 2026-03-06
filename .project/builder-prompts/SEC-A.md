# SEC-A: Audit Logging + Rate Limiting + Security Headers

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task
Build the security infrastructure layer: audit logging system, rate limiting utility, and security headers. These are foundational pieces that other security features (MFA, consent, etc.) will depend on.

**IMPORTANT**: The Plaid integration was built in a worktree. Check if it has been merged to main before starting. If not merged yet, work on main anyway — these features don't conflict with the Plaid files.

## Context
- Spec: `.project/architect/features/plaid-security-attestations.md` (Features 1, 4, 7)
- Reference implementation at `/Users/Jennifer/porch-financial/`:
  - `src/lib/audit.ts` — audit logging utility
  - `src/lib/rate-limit.ts` — rate limiter
  - `src/app/api/audit/route.ts` — audit log API
  - `src/middleware.ts` — security headers in middleware
  - `next.config.ts` — security headers config
- Restaurant app patterns:
  - `src/lib/tenant.ts` — read this for `getTenantDb()` pattern
  - `src/lib/auth.ts` — read this for login flow (add audit logging + rate limiting)
  - `src/middleware.ts` — read this for current middleware (add security headers + access denied logging)
  - `src/app/settings/page.tsx` — read this for settings UI (add Security tab with audit viewer)
  - `src/app/api/settings/route.ts` — add audit logging on settings changes
  - `src/app/api/team/route.ts` — add audit logging on team member create/delete

## Implementation

### Part 1: Rate Limiting Utility (do this first)
Create `src/lib/rate-limit.ts`:
- In-memory rate limiter using Map with auto-cleanup every 5 minutes
- `checkRateLimit(key, maxAttempts, windowMs)` → `{ limited, remaining, retryAfterMs }`
- Adapt from Porch Financial's implementation

### Part 2: Audit Logging System
Create `src/lib/audit.ts`:
- `logAuditEvent({ restaurantId, eventType, userId, userEmail, userRole, ipAddress, userAgent, resource, details })` — fire-and-forget (wrap in try/catch, never throw)
- `getRequestMeta(request)` — extract IP from x-forwarded-for/x-real-ip headers + user agent
- Uses `getDb()` directly (not `getTenantDb()`) since some events happen pre-auth
- Always includes `restaurant_id` in the insert

Create `audit_log` table (in the `logAuditEvent` function or a separate init):
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  event_type TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  user_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  resource TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_restaurant_created ON audit_log(restaurant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
```

Create `GET /api/audit/route.ts` (owner-only):
- Filter by: type, userId, from, to date range
- Paginated: limit (max 200, default 50), offset
- Scoped to restaurant via `getTenantDb()`
- Return `{ entries, limit, offset }`

### Part 3: Security Headers
Update `next.config.ts` — add security headers:
```typescript
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
];
```

### Part 4: Integrate Audit Logging + Rate Limiting
Modify `src/lib/auth.ts`:
- Add rate limiting to email login: `checkRateLimit(email, 10, 15 * 60 * 1000)`
- Add rate limiting to PIN login: `checkRateLimit(pin, 10, 15 * 60 * 1000)`
- Log `login` event on successful login (both email and PIN)
- Log `login_failed` event on failed login with reason in details

Modify `src/middleware.ts`:
- Add security headers to every response
- Log `access_denied` events when role-based access check fails (include IP and resource path)

Modify `src/app/api/settings/route.ts` (if it exists):
- Log `settings_changed` event when settings are saved

Modify `src/app/api/team/route.ts`:
- Log `user_created` on POST
- Log `user_deleted` or `user_deactivated` on DELETE

### Part 5: Security Tab in Settings
Add a "Security" tab to the Settings page (`src/app/settings/page.tsx`):
- Only visible to owners
- Shows audit log entries
- Color-coded cards: green (login), red (failures/denied), blue (user management), yellow (settings)
- Filter dropdown by event type
- Human-readable timestamps ("2 hours ago")
- "Load more" pagination (fetch from `/api/audit`)
- Style consistent with existing settings tabs

## Acceptance Criteria
- [ ] `src/lib/rate-limit.ts` created with `checkRateLimit()` function
- [ ] `src/lib/audit.ts` created with `logAuditEvent()` and `getRequestMeta()`
- [ ] `audit_log` table created on first use
- [ ] `GET /api/audit` route works with filters and pagination
- [ ] Security headers applied in `next.config.ts`
- [ ] Rate limiting applied to email and PIN login in `auth.ts`
- [ ] Audit events logged in auth.ts, middleware.ts, team route, settings route
- [ ] Security tab visible in Settings page with audit log viewer
- [ ] `npm run build` passes with zero errors
