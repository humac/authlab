# AGENTS.md — Agent Configuration for AuthLab

## Agent Roles

### Security Auditor

**Purpose**: Review authentication, secret handling, and session security.

**Focus Areas**:
- Verify AES-256-GCM usage in `src/lib/encryption.ts` with `MASTER_ENCRYPTION_KEY`
- Audit password hashing/migration in `src/lib/password.ts` (Argon2id + legacy bcrypt verify)
- Review token lifecycle in `src/repositories/auth-token.repo.ts` (hashing, TTL, one-time use)
- Validate auth flow state handling in `src/lib/state-store.ts` (TTL, one-time use, cookie security)
- Validate MFA setup/verification in `src/app/api/user/mfa/` and `src/lib/totp.ts`
- Validate passkey registration/login in `src/app/api/user/passkeys/` and `src/lib/webauthn.ts`
- Check profile image hardening in `src/lib/profile-image.ts` (magic bytes, type allowlist, size, EXIF stripping)
- Confirm write-only secret handling for SMTP/Brevo in `src/lib/email-provider.ts`
- Validate CSP + CSRF controls in `src/proxy.ts` and nonce usage in `src/app/layout.tsx`
- Ensure invite acceptance is email-scoped in `src/app/api/invites/accept/route.ts`

**Critical Files**:
- `src/lib/encryption.ts`
- `src/lib/password.ts`
- `src/lib/email-provider.ts`
- `src/lib/totp.ts`
- `src/lib/webauthn.ts`
- `src/lib/profile-image.ts`
- `src/lib/user-session.ts`
- `src/lib/state-store.ts`
- `src/proxy.ts`
- `src/repositories/auth-token.repo.ts`

### Auth Protocol Specialist

**Purpose**: Maintain OIDC/SAML app-testing flows and account-auth security flows.

**Focus Areas**:
- OIDC app flow in `src/lib/oidc-handler.ts` and callback routes
  - token lifecycle routes in `src/app/api/auth/token/`
  - UserInfo route in `src/app/api/auth/userinfo/[slug]/route.ts`
  - RP-initiated logout in `src/app/api/auth/logout/oidc/`
  - JWT signature / `at_hash` / `c_hash` diagnostics in `src/lib/oidc-token-validation.ts`
- SAML app flow in `src/lib/saml-handler.ts` and callback routes
  - per-app SP signing material in `src/app/api/saml/signing-material/` and `src/lib/saml-signing-material.ts`
  - SAML SLO in `src/app/api/auth/logout/saml/` and `src/lib/saml-logout.ts`
  - app-level encrypted assertion support via `spEncryptionPrivateKey` / `spEncryptionCert`
  - SAML callback routes now use `303` redirects after POST so browser navigation lands on inspector with `GET`
  - Pending auth state cookie uses `SameSite=None` in production to support cross-site IdP POST callback RelayState lookups
- User auth routes in `src/app/api/user/`:
  - login + MFA (`login`, `login/mfa/totp`)
  - registration + verification (`register`, `verify-email`, `verify-email/resend`)
  - password reset (`password-reset/request`, `password-reset/complete`)
  - passkeys (`passkeys/**`)
  - TOTP setup/disable (`mfa/totp/**`)

**Key Libraries**:
- `openid-client` v6
- `@node-saml/node-saml` v5
- `@simplewebauthn/server` + `@simplewebauthn/browser`
- `otplib` + `qrcode`

### UI/Frontend Developer

**Purpose**: Build and maintain dashboard/auth UI flows.

**Focus Areas**:
- Auth pages:
  - `src/app/(auth)/login/page.tsx`
  - `src/app/(auth)/register/page.tsx`
  - `src/app/(auth)/forgot-password/page.tsx`
  - `src/app/(auth)/reset-password/page.tsx`
  - `src/app/(auth)/verify-email/page.tsx`
- Settings UX in `src/app/(dashboard)/settings/page.tsx`:
  - passkey management
  - TOTP enrollment/disable
  - profile image upload/remove
- Admin email provider settings in `src/app/(dashboard)/admin/settings/page.tsx`

**Design System**:
- Primary color: `#3B71CA` via CSS custom properties in `globals.css`
- Tailwind CSS v4 utilities
- Client components for interactive forms
- Server components for data-loading layout/page shells

### Database/Backend Developer

**Purpose**: Manage Prisma schema, repositories, and API contracts.

**Focus Areas**:
- Prisma schema in `prisma/schema.prisma`
- New models:
  - `Credential`
  - `AuthToken`
  - `UserProfileImage`
  - `AuthRun`
  - `AuthRunEvent`
- Extended `User` fields:
  - `isVerified`, `mfaEnabled`, `totpSecretEnc`, `totpEnabledAt`
- Turso migration scripts in `prisma/turso-migrations/`
- Repository layer for auth tokens, credentials, profile images, user updates

**Database Notes**:
- Local: Prisma 7 + better-sqlite3 adapter (`file:./dev.db`)
- Production: Prisma 7 + libsql adapter (Turso)
- `prisma.config.ts` remains local-SQLite-only for CLI
- Apply production schema via `prisma migrate diff` + `turso db shell`

## Development Workflow

### Schema Changes
1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push`
3. Run `npx prisma generate`
4. For Turso:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/turso-migrations/<timestamp>_<name>.sql
   turso db shell authlab < prisma/turso-migrations/<timestamp>_<name>.sql
   ```

### Security-Sensitive Changes
- Never log secrets or decrypted values
- Never return SMTP/Brevo secrets from API responses
- Keep account existence responses generic for login/register/reset/verify resend
- Keep profile image serving via API proxy (no local filesystem)

### Common Tasks
- Run app: `npm run dev`
- Lint: `npm run lint`
- Typecheck: `npx tsc --noEmit`
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- Security regression tests: `npm run test:security`
- Performance baselines: `npm run test:perf`
- E2E tests: `npm run test:e2e`
- CI-quality build: `npm run build:ci`
- Full local CI parity: `npm run test:ci`
- Production build (stable path): `npm run build -- --webpack`
- Reset local DB: delete `dev.db`, then `npx prisma db push`

### Release Branch Workflow

- For staged deploy testing, cut a release branch from the current working state instead of deploying directly from `main`
- Recommended naming: `release/<yyyy-mm-dd>-<scope>`
- Keep `main` unmerged until the release branch has been validated in detail
- Roll back by redeploying a prior release branch commit or switching to the previous release branch

### Agent Commit Gate
- Before creating a commit, update `AGENTS.md` and `CLAUDE.md` if the repo workflow, testing strategy, or agent guidance changed during the work
- Before creating a commit, all coding agents must run local unit tests: `npm run test:unit`
- Before creating a commit, all coding agents must run local integration tests: `npm run test:integration`
- Before creating a commit, all coding agents must run local security regression tests: `npm run test:security`
- If unit, integration, or security regression tests fail, do not commit until failures are fixed or explicitly acknowledged by the user

### CI/CD Release Gates
- PR and merge queue checks live in `.github/workflows/ci.yml` (`Quality Gate`, `E2E`, `Release Readiness`, and conditional `Dependency Review`)
- Nightly auth latency baselines live in `.github/workflows/nightly-performance.yml` and publish `test-results/performance/auth-latency-baseline.{md,json}` as artifacts
- `Release Readiness` validates Vercel credentials, pulls production env vars, validates required env keys, and runs `vercel build --prod`
- Production deploys in `.github/workflows/deploy-production.yml` rebuild artifacts in the deploy job before `vercel deploy --prebuilt`

## Environment Variables
- `MASTER_ENCRYPTION_KEY` (required) — 64-char hex AES key
- `SESSION_PASSWORD` (required) — iron-session encryption/signing secret
- `NEXT_PUBLIC_APP_URL` (required for WebAuthn/email links)
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (production DB)
- `DATABASE_URL` (local SQLite / production placeholder)
