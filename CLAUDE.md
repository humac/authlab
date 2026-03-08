# CLAUDE.md — AuthLab Project Context

## Project Overview

AuthLab is a multi-tenant auth testing workbench for OIDC/SAML app flows, now with hardened account security and Phase 1/2 enterprise protocol tooling plus Phase 3 enterprise SAML coverage:
- email verification
- password reset with one-time tokens
- passkeys (WebAuthn)
- TOTP MFA
- encrypted SMTP/Brevo provider settings
- secure profile image handling via DB blob + API proxy
- OIDC lifecycle actions: refresh, introspection, revocation, client credentials
- OIDC validation diagnostics: signature, `at_hash`, `c_hash`, `acr`, `amr`
- per-app SAML signing material with self-signed test keypair generation
- SAML structured assertion diagnostics
- per-app SAML encrypted assertion support
- SAML Single Logout (SP-initiated and IdP-initiated callback handling)
- SAML request controls: AuthnContext, signature algorithm, clock skew, logout URL

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **Database (local)**: Prisma 7 + SQLite (`@prisma/adapter-better-sqlite3`)
- **Database (production)**: Prisma 7 + Turso/libSQL (`@prisma/adapter-libsql`)
- **OIDC**: `openid-client` v6
- **SAML**: `@node-saml/node-saml` v5
- **Passkeys**: `@simplewebauthn/server`, `@simplewebauthn/browser`
- **MFA**: `otplib`, `qrcode`
- **Email**: SMTP (`nodemailer`) and Brevo API v3
- **Image hardening**: `file-type`, `sharp`
- **Password hashing**: Argon2id with legacy bcrypt verification/migration
- **Sessions**: `iron-session`
- **Validation**: Zod v4

## Commands

```bash
npm install
npm run dev
npm run lint
npm run test:unit
npm run test:integration
npm run test:security
npm run test:perf
npm run test:e2e
npm run build:ci
npm run test:ci
npx tsc --noEmit
npx prisma db push
npx prisma generate
npm run build -- --webpack
```

## Architecture

### High-Level Areas

- `src/app/api/auth/callback/*` — app protocol callbacks (OIDC/SAML)
- `src/app/api/auth/token/*` — OIDC token lifecycle routes
- `src/app/api/auth/userinfo/[slug]/route.ts` — on-demand UserInfo retrieval
- `src/app/api/auth/logout/oidc/*` — RP-initiated OIDC logout
- `src/app/api/auth/logout/saml/*` — SAML single logout start and callback handling
- `src/lib/state-store.ts` — pending OIDC state / SAML RelayState storage in session cookie (10-minute TTL, one-time use)
- `src/lib/oidc-token-validation.ts` — OIDC signature and bound-hash validation helpers
- `src/lib/saml-logout.ts` — SAML logout profile derivation and matching helpers
- `src/app/api/user/*` — account security APIs:
  - login + MFA
  - register + verify email
  - password reset request/complete
  - passkey register/login/list/delete
  - TOTP setup/verify/disable
  - profile image upload/get/delete
- `src/app/api/admin/email-provider/*` — encrypted SMTP/Brevo config and connection testing
- `src/lib/` — security primitives (`encryption`, `password`, `webauthn`, `totp`, `profile-image`, `email-provider`)
- `src/repositories/` — DB access layer including `auth-token`, `credential`, `profile-image`
- `src/repositories/auth-run.repo.ts` — persisted auth runs and lifecycle events for inspector/history workflows

### Key Security Patterns

1. **Master-key encryption**
   - Secrets use AES-256-GCM in `src/lib/encryption.ts`
   - Key source: `MASTER_ENCRYPTION_KEY` only

2. **Password strategy**
   - New hashes: Argon2id
   - Existing bcrypt hashes: verify + lazy rehash to Argon2id

3. **Token safety**
   - Email verify/reset tokens are random opaque values
   - Only `sha256(token)` stored in DB
   - One-time use via `usedAt` + TTL via `expiresAt`

4. **No enumeration responses**
   - Generic outward messages for account existence-sensitive routes

5. **Write-only external provider secrets**
   - SMTP password/Brevo API key encrypted at rest
   - GET APIs return only masked/`hasSecret` indicators

6. **Profile image hardening**
   - Type allowlist + magic-byte validation
   - 2MB max
   - EXIF stripped by re-encode
   - Stored in DB and served through API route

7. **CSP + session protections**
   - CSP set in proxy with nonce
   - nonce applied to inline theme script in root layout
   - CSRF origin/content-type checks on mutating API calls

## Prisma Notes

- `prisma/schema.prisma` now includes:
  - extended `User` security fields
  - `Credential`, `AuthToken`, `UserProfileImage`
  - `AppInstance` protocol settings for Phase 1/2 OIDC and Phase 3 SAML controls
  - `AuthRun` and `AuthRunEvent` for persisted protocol sessions and lifecycle history
- Use local SQLite for CLI through `prisma.config.ts`
- For Turso changes, generate SQL diff then apply via `turso db shell`
- Current roadmap migrations include:
  - `prisma/turso-migrations/20260306_hardened_auth_and_profile.sql`
  - `prisma/turso-migrations/20260307_phase1_authrun_and_protocol_settings.sql`
  - `prisma/turso-migrations/20260307_phase2_oidc_token_lifecycle.sql`
  - `prisma/turso-migrations/20260308_phase3_saml_request_controls.sql`
  - `prisma/turso-migrations/20260308_phase3_saml_encryption_keys.sql`
  - `prisma/turso-migrations/20260308_phase3_saml_slo.sql`

## Environment Variables

### Required (local + production)
- `MASTER_ENCRYPTION_KEY` (64-char hex)
- `SESSION_PASSWORD` (64-char hex)
- `NEXT_PUBLIC_APP_URL`

### Database
- Local: `DATABASE_URL=file:./dev.db`
- Production: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `DATABASE_URL` placeholder

## Operational Notes

- If no active email provider is configured, verification/reset endpoints keep generic responses and suppress sensitive failures.
- Next.js 16 uses the `proxy` convention for request interception; the app now follows that convention.
- If Turbopack build panics, use webpack build path (`npm run build -- --webpack`).
- Auth flow state is persisted in `iron-session` cookies (not in-memory), enabling reliable callback routing across serverless/runtime boundaries.
- SAML callback endpoints return `303` after POST and rely on RelayState/state-store roundtrip.
- Production pending-auth state cookie uses `SameSite=None` to support cross-site IdP POST callbacks.
- SAML signed metadata/AuthN requests are per-app, not global-env driven.
- SAML metadata now exposes app-level decryption and SLO callbacks when configured.
- For staged deployment, cut a `release/<yyyy-mm-dd>-<scope>` branch and deploy from that branch rather than merging early into `main`.

## Agent Commit Rule

- All coding agents must update `AGENTS.md` and `CLAUDE.md` before committing if repo workflow, testing strategy, or agent guidance changed during the task.
- All coding agents must run local unit tests before committing changes: `npm run test:unit`.
- All coding agents must run local integration tests before committing changes: `npm run test:integration`.
- All coding agents must run local security regression tests before committing changes: `npm run test:security`.

## CI/CD Notes

- `.github/workflows/ci.yml` contains:
  - `Quality Gate`: lint, typecheck, unit tests, integration tests, security regression tests, Prisma validate, CI build
  - `E2E`: Playwright auth and dashboard journeys against a disposable SQLite database
  - `Release Readiness`: trusted PR/merge queue checks for Vercel credentials/env and `vercel build --prod`
  - `Dependency Review`: runs only when GitHub Dependency Graph is enabled
- `.github/workflows/nightly-performance.yml` contains:
  - `Auth Latency Baseline`: nightly and manual in-process benchmarks for register/login/reset/resend auth paths with markdown + JSON artifacts
- `.github/workflows/deploy-production.yml` contains:
  - `verify-release`: re-validates quality, Vercel credentials, production env vars, and production artifact build
  - `deploy`: rebuilds Vercel artifacts, applies Turso migrations, then deploys with `vercel deploy --prebuilt --prod`
