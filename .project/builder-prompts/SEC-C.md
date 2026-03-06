# SEC-C: Consent + De-Provisioning + Data Delete/Export + Security Tooling + Privacy Page

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task
Build the compliance and policy layer: consent tracking, automated de-provisioning (soft delete), account deletion/data export, security tooling (Dependabot, npm audit, EOL monitoring), and the comprehensive privacy/security policy page.

**IMPORTANT**: The Plaid integration was built in a worktree. Check if it has been merged to main before starting. Work on main — most of these files don't conflict with Plaid or the other security builders.

**FILE CONFLICT NOTE**: This builder modifies `src/app/api/team/route.ts` (for de-provisioning) and `src/app/privacy/page.tsx`. If SEC-A also modifies the team route (for audit logging), coordinate carefully — the de-provisioning changes (soft delete logic) are different from audit logging calls. If SEC-A has already merged, build on top of its changes.

## Context
- Spec: `.project/architect/features/plaid-security-attestations.md` (Features 3, 5, 6, 8, 9)
- Reference implementation at `/Users/Jennifer/porch-financial/`:
  - `src/app/api/consent/route.ts` — consent tracking
  - `src/app/api/account/delete/route.ts` — account deletion
  - `src/app/api/account/export/route.ts` — data export
  - `SECURITY.md` — vulnerability disclosure
  - `.github/dependabot.yml` — dependency scanning
  - `scripts/check-eol.mjs` — EOL monitoring
  - `src/app/privacy/page.tsx` — comprehensive privacy page (READ THIS for content structure)
- Restaurant app patterns:
  - `src/lib/tenant.ts` — `getTenantDb()` pattern
  - `src/app/api/team/route.ts` — current team management (modify for soft delete)
  - `src/lib/auth.ts` — login flow (add deactivated user check)
  - `src/app/privacy/` — directory exists but page content needs to be created

## Implementation

### Part 1: Consent Tracking

Create `consent_records` table (in an init function or first API call):
```sql
CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_restaurant_user ON consent_records(restaurant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_consent_type ON consent_records(consent_type);
```

Create `src/app/api/consent/route.ts`:

**GET**: Return most recent consent per type for current user
```sql
SELECT DISTINCT ON (consent_type) * FROM consent_records
WHERE user_id = $userId AND restaurant_id = $restaurantId
ORDER BY consent_type, created_at DESC
```

**POST**: Record consent event
- Body: `{ consentType, granted }`
- Validate consentType against allowed list
- Extract IP + user agent from request headers
- Insert record
- Log audit event if `audit.ts` exists (consent_granted or consent_revoked)

### Part 2: Automated De-Provisioning

Add columns to `users` table:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by TEXT;
```

Modify `src/app/api/team/route.ts` DELETE handler:
- Change from hard delete to soft delete
- On deactivation:
  - Set `is_active = false`
  - Set `deactivated_at = NOW()`
  - Set `deactivated_by = {current user id}`
  - Clear security credentials: `pin = NULL, pin_hash = NULL, setup_token = NULL, mfa_secret = NULL, mfa_enabled = false, mfa_backup_codes = NULL`
- Log `user_deactivated` audit event (if audit.ts exists)

Modify `src/app/api/team/route.ts` GET handler:
- Filter to only return `is_active = true` users

Modify `src/lib/auth.ts` login flow:
- Email login: after finding user, check `is_active`. If false, return null (login fails)
- PIN login: add `AND is_active = true` to the user query
- Log `login_failed` with reason 'account_deactivated' if applicable (if audit.ts exists)

### Part 3: Data Deletion & Export

Create `src/app/api/account/delete/route.ts` (POST):
- Requires authenticated session
- Owners cannot delete themselves (safety check — return 403)
- Steps:
  1. Get all plaid_items for user's restaurant
  2. For each active item: decrypt access_token, call `client.itemRemove()` (catch errors)
  3. Mark plaid_items status='revoked'
  4. Delete consent_records for user
  5. Anonymize audit_log: `user_email = 'deleted'`, `user_id = 'deleted-' || user_id`
  6. Delete user from users table
  7. Log `data_deleted` audit event (if audit.ts exists)
- Import encryption/Plaid client only if those files exist; if not, skip Plaid token revocation

Create `src/app/api/account/export/route.ts` (GET):
- Requires authenticated session
- Build JSON export object:
  ```json
  {
    "exported_at": "ISO timestamp",
    "user": { "id", "email", "name", "role", "created_at", "mfa_enabled" },
    "consent_records": [...all records for user],
    "activity_log": [...last 500 audit entries for user]
  }
  ```
- Return as downloadable file:
  - Content-Type: application/json
  - Content-Disposition: `attachment; filename="data-export-YYYY-MM-DD.json"`
- Log `data_exported` audit event (if audit.ts exists)

### Part 4: Security Tooling

Create `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "security"
```

Create `SECURITY.md`:
```markdown
# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities to: shopcolby@gmail.com

## Supported Versions

Only the latest deployed version is supported.

## Patching SLA

| Severity | Response Time |
|----------|---------------|
| Critical | 24 hours |
| High | 7 days |
| Medium | 30 days |
| Low | Next maintenance cycle |

## Security Monitoring

- Dependabot monitors npm dependencies weekly
- npm audit runs on every build
- EOL monitoring via `npm run check-eol`
```

Create `scripts/check-eol.mjs`:
- Adapt from Porch Financial's script
- Check Node.js version against LTS schedule
- Check Next.js (min 15.0.0), React (min 18.0.0), TypeScript (min 5.0.0)
- Report: past EOL, approaching EOL (180 days), or current

Update `package.json` scripts:
```json
{
  "audit:check": "npm audit --audit-level=high",
  "audit:fix": "npm audit fix",
  "check-eol": "node scripts/check-eol.mjs"
}
```
Also add `prebuild` script that runs audit check (but be careful — if `prebuild` already exists, append to it rather than replace).

Create `.github/workflows/security-scan.yml`:
```yaml
name: Security Scan
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 9 * * 1'  # Weekly Monday 9am
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npx npm-check-updates
```

### Part 5: Privacy & Security Policy Page

Create/replace `src/app/privacy/page.tsx`:
- Comprehensive page with 10 sections (see spec for full list)
- Adapt content from Porch Financial's privacy page but change:
  - App name: "AI Restaurant Manager" (not "AI Assistant Manager")
  - Owner/contact: Keep shopcolby@gmail.com
  - Services mentioned: Plaid, OpenAI (no Square unless the app uses it)
  - Multi-tenant language: mention that each restaurant's data is isolated
- Style with porch-brown/porch-cream theme
- Responsive layout
- Section anchors for deep linking

## Acceptance Criteria
- [ ] `consent_records` table created, GET/POST `/api/consent` working
- [ ] `is_active`, `deactivated_at`, `deactivated_by` columns added to users
- [ ] Team DELETE does soft delete with credential clearing
- [ ] Login flow blocks deactivated users
- [ ] Team GET filters to active users only
- [ ] `POST /api/account/delete` works (with Plaid token revocation if available)
- [ ] `GET /api/account/export` returns downloadable JSON
- [ ] `.github/dependabot.yml` created
- [ ] `SECURITY.md` created
- [ ] `scripts/check-eol.mjs` created
- [ ] npm audit scripts added to package.json
- [ ] `.github/workflows/security-scan.yml` created
- [ ] Privacy page created with all 10 sections
- [ ] `npm run build` passes with zero errors
