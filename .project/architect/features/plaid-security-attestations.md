# Plaid Security Attestations — Full Implementation Spec

## Purpose
Satisfy all 16 of Plaid's required security attestations (due 08/25/2026) for the AI Restaurant Manager platform. This is a multi-tenant platform where multiple restaurants use the same app, so all security features must scope by `restaurant_id`.

## Reference Implementation
Porch Financial at `/Users/Jennifer/porch-financial` has a complete, production-tested implementation of all features described here. All code should be adapted from there unless noted otherwise.

## Platform Details
- **Framework**: Next.js 16.1.6 with App Router
- **Auth**: NextAuth v5 beta (next-auth@5.0.0-beta.30)
- **Database**: Neon PostgreSQL via `@neondatabase/serverless`
- **Tenant pattern**: `getTenantDb()` returns `{ sql, restaurantId }`
- **Roles**: `owner` (full access) and `manager` (limited staff access)
- **Auth modes**: Email+password login AND PIN-only login (for staff)
- **Deploy**: Vercel

## Multi-Tenant Consideration (CRITICAL)
Unlike Porch Financial (single-tenant), this platform serves multiple restaurants. Every database table, query, and audit event MUST include `restaurant_id`. The `getTenantDb()` function enforces this — always use it.

---

## Feature 1: Audit Logging System
**Covers attestations**: #1 (access control), #4 (access reviews), #15 (RBAC)

### Database: `audit_log` table
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| restaurant_id | TEXT NOT NULL | Multi-tenant scope |
| event_type | TEXT NOT NULL | See event types below |
| user_id | TEXT | Nullable (pre-auth events) |
| user_email | TEXT | |
| user_role | TEXT | |
| ip_address | TEXT | |
| user_agent | TEXT | |
| resource | TEXT | URL path or resource name |
| details | JSONB | Event-specific data |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

Indexes: `(restaurant_id, created_at)`, `(user_id)`, `(event_type)`

### Event types
`login`, `login_failed`, `logout`, `access_denied`, `user_created`, `user_deleted`, `user_deactivated`, `settings_changed`, `password_changed`, `plaid_connected`, `plaid_disconnected`, `consent_granted`, `consent_revoked`, `mfa_enabled`, `mfa_disabled`, `mfa_failed`, `data_exported`, `data_deleted`, `role_changed`, `receipt_scanned`

### Utility: `src/lib/audit.ts`
- `logAuditEvent(params)` — fire-and-forget (never throws, never blocks)
- `getRequestMeta(request)` — extracts IP + user agent from request headers
- Must accept `restaurantId` parameter

### API: `GET /api/audit` (owner-only)
- Filterable by: event_type, user_id, date range (from/to)
- Paginated with limit/offset (max 200, default 50)
- Scoped to current restaurant via `getTenantDb()`

### UI: Security tab in Settings page
- Color-coded event cards (green=login, red=failures, blue=user management)
- Filter dropdown by event type
- Human-readable timestamps ("2 hours ago")
- "Load more" pagination

### Integration points (where to add logging calls)
- Login flow (both email and PIN) — success and failure
- Middleware — access denied events
- Settings page — settings changes
- Team management — user created/deleted/deactivated
- Password changes
- Plaid connect/disconnect
- MFA events (after MFA is built)
- Consent events (after consent is built)

---

## Feature 2: Two-Factor Authentication (MFA)
**Covers attestations**: #8 (MFA on internal systems), #11 (MFA on consumer-facing app)

### NPM packages needed
- `otpauth` — TOTP generation/verification
- `qrcode` + `@types/qrcode` — QR code generation

### Database: Add columns to `users` table
- `mfa_secret` TEXT — TOTP secret key (base32)
- `mfa_enabled` BOOLEAN DEFAULT false
- `mfa_backup_codes` TEXT — JSON array of 8 recovery codes

### Utility: `src/lib/mfa.ts`
- `generateMfaSecret(email)` — TOTP secret + QR code URI (issuer: "AI Restaurant Manager")
- `verifyMfaCode(secret, code)` — validate 6-digit code (window=1 for clock drift)
- `generateBackupCodes()` — 8 random hex codes
- `verifyBackupCode(storedCodes, inputCode)` — validate + remove used code
- `createMfaCompletionToken(userId)` — HMAC-SHA256 signed token (5-min TTL)
- `verifyMfaCompletionToken(token, userId)` — validate signed token

### API routes
- `POST /api/auth/mfa/setup` — generate TOTP secret + QR code (authenticated, MFA not already on)
- `POST /api/auth/mfa/verify` — verify code during setup, enable MFA, generate backup codes
- `POST /api/auth/mfa/validate` — validate code during login, return completion token. Rate limited: 10/5min/IP
- `POST /api/auth/mfa/backup` — regenerate backup codes (MFA must be enabled)
- `GET /api/auth/mfa` — return MFA status for current user
- `DELETE /api/auth/mfa` — disable MFA (requires valid TOTP code to confirm)

### Login flow changes (src/lib/auth.ts)
- If user has `mfa_enabled=true`, create session with `mfaRequired: true, mfaVerified: false`
- JWT callback stores these flags
- Session callback exposes them
- After MFA validation, client calls `session.update({ mfaCompletionToken })`
- JWT callback verifies HMAC token before setting `mfaVerified: true`

### Middleware changes (src/middleware.ts)
- If session has `mfaRequired=true` and `mfaVerified=false`, redirect to `/login/mfa`
- Exempt the MFA page itself and auth API routes from this check

### MFA login page: `/login/mfa/page.tsx`
- 6-digit code input with numeric keypad
- Toggle between authenticator code and backup code
- Client-side rate limiting: 5 attempts, 30-second lockout
- Auto-redirect to dashboard after success

### MFA settings UI: New section in Settings Account tab
- Status badge (enabled/disabled)
- 3-step setup wizard: scan QR → enter code → save backup codes
- Manual entry fallback for QR
- Backup code grid with copy button
- Regenerate backup codes
- Disable MFA flow (requires valid code)

---

## Feature 3: Consent Tracking
**Covers attestation**: #7 (consent tracking)

### Database: `consent_records` table
| Column | Type |
|--------|------|
| id | TEXT PK |
| restaurant_id | TEXT NOT NULL |
| user_id | TEXT NOT NULL |
| consent_type | TEXT NOT NULL |
| granted | BOOLEAN NOT NULL |
| ip_address | TEXT |
| user_agent | TEXT |
| details | JSONB |
| created_at | TIMESTAMPTZ DEFAULT NOW() |

Indexes: `(restaurant_id, user_id)`, `(consent_type)`

### Consent types
`privacy_policy`, `terms_of_service`, `data_processing`, `plaid_data_access`, `marketing`

### API routes
- `GET /api/consent` — most recent consent record per type for current user
- `POST /api/consent` — record new consent event with type, granted/revoked, IP, user agent

---

## Feature 4: Rate Limiting
**Covers attestation**: #9 (zero trust)

### Utility: `src/lib/rate-limit.ts`
- In-memory rate limiter using Map with auto-cleanup every 5 minutes
- `checkRateLimit(key, maxAttempts, windowMs)` → `{ limited, remaining, retryAfterMs }`

### Where to apply
- Email login: 10 attempts / 15 min / email
- PIN login: 10 attempts / 15 min / PIN value
- MFA validation: 10 attempts / 5 min / IP (returns 429 with Retry-After header)

---

## Feature 5: Automated De-Provisioning
**Covers attestation**: #16 (automated de-provisioning)

### Database: Add columns to `users` table
- `is_active` BOOLEAN DEFAULT true
- `deactivated_at` TIMESTAMPTZ
- `deactivated_by` TEXT — ID of person who deactivated

### Changes to team management (`/api/team`)
- DELETE now does soft delete: sets `is_active=false`, clears pin/pin_hash/setup_token/mfa_secret/mfa_enabled/mfa_backup_codes
- Records `deactivated_at` and `deactivated_by`

### Changes to login flow
- Email login: check `is_active` — blocked users get "account_deactivated" error
- PIN login: filter query to `is_active = true` only
- Team list: filter to active users only

---

## Feature 6: Data Deletion & Export
**Covers attestation**: #5 (data deletion and retention)

### API: `POST /api/account/delete`
- Authenticated users only, owners cannot delete themselves
- Actions:
  1. Revoke all Plaid access tokens (decrypt → `client.itemRemove()`)
  2. Mark `plaid_items` status='revoked'
  3. Delete `consent_records` for user
  4. Anonymize `audit_log` entries (email→'deleted', user_id→'deleted-{uuid}')
  5. Delete user record
  6. Log final `data_deleted` audit event

### API: `GET /api/account/export`
- Returns downloadable JSON file with:
  - User profile (id, email, name, role, created_at, mfa_enabled)
  - All consent records
  - Last 500 audit log entries (user's own)
- Content-Disposition header with date-stamped filename

---

## Feature 7: Security Headers
**Covers attestation**: #9 (zero trust architecture)

### In `next.config.ts` — add security headers
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-XSS-Protection: 1; mode=block
```

### In middleware — also set these headers on every response
- Plus enforce 24-hour JWT session expiration in NextAuth config

---

## Feature 8: Security Tooling
**Covers attestations**: #3 (vulnerability patching SLA), #12 (EOL monitoring), #13 (vulnerability scanning)

### Dependabot (`.github/dependabot.yml`)
- Weekly npm dependency scans (Mondays)
- Auto-create PRs for security updates

### NPM audit scripts (in `package.json`)
- `audit:check`: `npm audit --audit-level=high`
- `audit:fix`: `npm audit fix`
- `prebuild`: runs audit check before every build

### EOL Monitoring (`scripts/check-eol.mjs`)
- Check Node.js version against LTS schedule
- Check Next.js, React, TypeScript against current versions
- Report: past EOL, approaching EOL (180 days), or current

### SECURITY.md
- Contact email for vulnerability reports
- Patching SLA: Critical 24h, High 7d, Medium 30d, Low maintenance cycle
- Supported version: latest deployed only

### GitHub Actions (`.github/workflows/security-scan.yml`)
- Triggers: push to main, PRs, weekly Monday 9am
- Steps: npm ci → npm audit → npx npm-check-updates

---

## Feature 9: Privacy & Security Policy Page
**Covers attestations**: #1, #2, #5, #6, #10, #14

### Page: `/privacy/page.tsx` (exists but empty — needs full content)

Sections:
1. **Privacy Policy** — data collected, usage, sharing (Plaid, OpenAI)
2. **Data Security** — encryption at rest (AES-256), TLS in transit, access controls
3. **Information Security Policy** — quarterly reviews, incident response, audit logging
4. **Access Control Policy** — RBAC roles (owner/manager), centralized IAM, de-provisioning
5. **Zero Trust Security** — per-request verification, MFA, session expiry, headers
6. **Bank Connection Security** — how Plaid works, no credential storage, revocation
7. **Your Consent** — tracking with timestamps/IP, withdrawal rights
8. **Data Retention & Deletion** — account data (30 days), transactions (24 months), token revocation
9. **Authentication & MFA** — bcrypt hashing, TOTP, backup codes, rate limiting
10. **Contact** — business contact info

---

## Attestation-to-Feature Mapping

| # | Attestation | Satisfied By |
|---|-------------|-------------|
| 1 | Access control policy | Privacy page + RBAC system |
| 2 | Secure tokens/certificates | JWT sessions, bcrypt, TLS, env vars |
| 3 | Vulnerability patching SLA | SECURITY.md, Dependabot, npm audit |
| 4 | Periodic access reviews | Audit log + quarterly review policy |
| 5 | Data deletion/retention | Account delete API + privacy page |
| 6 | Information Security Policy | Privacy page ISP section |
| 7 | Consent tracking | Consent records database + API |
| 8 | MFA on internal systems | Full TOTP MFA system |
| 9 | Zero trust architecture | Middleware, rate limiting, headers, session expiry |
| 10 | Centralized IAM | Single NextAuth system |
| 11 | MFA on consumer-facing app | Same MFA system |
| 12 | EOL monitoring | check-eol.mjs script |
| 13 | Vulnerability scanning | Dependabot, npm audit, GitHub Actions |
| 14 | Published privacy policy | /privacy page |
| 15 | RBAC | permissions.ts + middleware + audit logging |
| 16 | Auto de-provisioning | Soft delete + credential clearing |
