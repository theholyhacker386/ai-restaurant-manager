# SEC-B: Two-Factor Authentication (MFA) System

AGENT_ROLE: builder
PROJECT: ai-restaurant-manager

## Task
Build a complete TOTP-based two-factor authentication system. This adds an optional second security step after password login where users scan a QR code with an authenticator app and enter a 6-digit code.

**IMPORTANT**: The Plaid integration was built in a worktree. Check if it has been merged to main before starting. Work on main — these files don't conflict with Plaid files.

**DEPENDENCY**: This builder should run AFTER SEC-A (audit logging + rate limiting) so that MFA events can be logged and MFA validation can be rate-limited. If SEC-A hasn't completed yet, create placeholder imports that will work once those files exist, or include minimal versions of the rate-limit and audit utilities if they don't exist yet.

## Context
- Spec: `.project/architect/features/plaid-security-attestations.md` (Feature 2)
- Reference implementation at `/Users/Jennifer/porch-financial/`:
  - `src/lib/mfa.ts` — MFA utility (READ THIS COMPLETELY)
  - `src/app/api/auth/mfa/setup/route.ts`
  - `src/app/api/auth/mfa/verify/route.ts`
  - `src/app/api/auth/mfa/validate/route.ts`
  - `src/app/api/auth/mfa/backup/route.ts`
  - `src/app/api/auth/mfa/route.ts` (GET status + DELETE disable)
  - `src/app/login/mfa/page.tsx`
  - `src/lib/auth.ts` — MFA flags in login flow
  - `src/middleware.ts` — MFA guard
- Restaurant app patterns:
  - `src/lib/auth.ts` — MUST READ to understand current NextAuth setup (JWT callbacks, session callbacks)
  - `src/middleware.ts` — MUST READ to understand current middleware flow
  - `src/app/login/page.tsx` — current login page
  - `src/app/settings/page.tsx` — where MFA settings UI will go
  - `src/lib/tenant.ts` — `getTenantDb()` pattern

## Implementation

### Part 1: Install Dependencies
```bash
npm install otpauth qrcode @types/qrcode
```

### Part 2: Add Database Columns
Add to `users` table (use ALTER TABLE since table exists):
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT;
```
Run these in an init function or at the top of an API route.

### Part 3: Create MFA Utility (`src/lib/mfa.ts`)
Adapt from Porch Financial. Key functions:
- `generateMfaSecret(email)` — TOTP secret (SHA1, 6 digits, 30s) with issuer "AI Restaurant Manager"
- `verifyMfaCode(secret, code)` — validate with window=1 (±30s drift)
- `generateBackupCodes()` — 8 random hex codes (8 chars each)
- `verifyBackupCode(storedCodes, inputCode)` — validate + remove used code
- `createMfaCompletionToken(userId)` — HMAC-SHA256 with AUTH_SECRET, format `userId:timestamp:hmac`, 5-min TTL
- `verifyMfaCompletionToken(token, userId)` — validate HMAC + expiry

### Part 4: Create MFA API Routes
All routes at `src/app/api/auth/mfa/`:

**`setup/route.ts`** (POST):
- Requires authenticated session, MFA must not already be enabled
- Generate secret, create QR code as data URL
- Store secret temporarily in users.mfa_secret (but mfa_enabled stays false)
- Return `{ qrCode, secret }`

**`verify/route.ts`** (POST):
- Body: `{ code }`
- Verify code against stored mfa_secret
- On success: set mfa_enabled=true, generate + save backup codes
- Log `mfa_enabled` audit event (if audit.ts exists)
- Return `{ success, backupCodes }`

**`validate/route.ts`** (POST):
- Body: `{ code, userId, isBackupCode }`
- Rate limit: 10 attempts / 5 min / IP (if rate-limit.ts exists)
- Verify TOTP or backup code
- If backup: remove used code from stored array
- Create MFA completion token
- Log `login` audit event with method: totp|backup_code
- Return `{ success, mfaCompletionToken }`

**`backup/route.ts`** (POST):
- Requires authenticated + MFA enabled
- Generate new 8 backup codes, replace stored
- Log `mfa_enabled` audit event (codes regenerated)
- Return `{ backupCodes }`

**`route.ts`** (GET + DELETE):
- GET: Return `{ mfaEnabled }` for current user
- DELETE: Body `{ code }`, verify code first, then disable MFA (clear mfa_secret, mfa_enabled=false, mfa_backup_codes)
- Log `mfa_disabled` audit event

### Part 5: Modify Login Flow (`src/lib/auth.ts`)
**This is the most critical part — be very careful.**

In the credentials authorize callback:
- After successful password verification, check if user has `mfa_enabled=true`
- If MFA enabled: return user object with `mfaRequired: true, mfaVerified: false`
- If MFA disabled: return user object with `mfaRequired: false, mfaVerified: false`

In the JWT callback:
- Store `mfaRequired` and `mfaVerified` in the token
- Handle session update trigger: when `trigger === "update"` and `session.mfaCompletionToken` exists, verify the token with `verifyMfaCompletionToken()`, and if valid set `token.mfaVerified = true`

In the session callback:
- Expose `mfaRequired` and `mfaVerified` on `session.user`

**NOTE**: PIN login does NOT require MFA (staff members with PINs don't need 2FA).

### Part 6: Modify Middleware (`src/middleware.ts`)
After auth check, before role-based routing:
- If `session.user.mfaRequired === true && session.user.mfaVerified === false`:
  - Allow access to: `/login/mfa`, `/api/auth/mfa/validate`, `/api/auth/*`
  - Redirect all other routes to `/login/mfa`

### Part 7: MFA Login Page (`src/app/login/mfa/page.tsx`)
- 6-digit input with numeric keypad (inputMode="numeric")
- Toggle between authenticator code and backup code entry
- Client-side rate limiting: 5 attempts, 30-second lockout with countdown
- On success: call `update({ mfaCompletionToken })` then redirect to dashboard
- Style consistent with existing login page (porch-brown theme)

### Part 8: MFA Settings UI
Add to the Account tab in `src/app/settings/page.tsx`:
- MFA status badge (green=enabled, gray=disabled)
- "Set Up Two-Factor Authentication" button (if disabled)
- Setup wizard: Step 1 (scan QR) → Step 2 (enter code) → Step 3 (save backup codes)
- Manual entry fallback for QR code
- Backup codes grid with copy-all button
- "Regenerate Backup Codes" button (if enabled)
- "Disable MFA" button (requires entering valid code)

## Acceptance Criteria
- [ ] `otpauth` and `qrcode` packages installed
- [ ] `mfa_secret`, `mfa_enabled`, `mfa_backup_codes` columns added to users table
- [ ] `src/lib/mfa.ts` created with all 6 functions
- [ ] All 6 MFA API routes created and working
- [ ] Login flow in `auth.ts` handles MFA flags in JWT/session
- [ ] Middleware redirects unverified MFA users to `/login/mfa`
- [ ] `/login/mfa` page works with TOTP and backup codes
- [ ] MFA setup/disable UI in Settings page
- [ ] PIN login bypasses MFA (staff don't need 2FA)
- [ ] `npm run build` passes with zero errors
