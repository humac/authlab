# CLAUDE.md — AuthLab Project Context

## Project Overview

AuthLab is a multi-tenant auth testing workbench for OIDC/SAML app flows, now with hardened account security:
- email verification
- password reset with one-time tokens
- passkeys (WebAuthn)
- TOTP MFA
- encrypted SMTP/Brevo provider settings
- secure profile image handling via DB blob + API proxy

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
- `src/lib/state-store.ts` — pending OIDC state / SAML RelayState storage in session cookie (10-minute TTL, one-time use)
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
- Use local SQLite for CLI through `prisma.config.ts`
- For Turso changes, generate SQL diff then apply via `turso db shell`
- Current hardening migration: `prisma/turso-migrations/20260306_hardened_auth_and_profile.sql`

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

## Agent Commit Rule

- All coding agents must update `AGENTS.md` and `CLAUDE.md` before committing if repo workflow, testing strategy, or agent guidance changed during the task.
- All coding agents must run local unit tests before committing changes: `npm run test:unit`.
- All coding agents must run local integration tests before committing changes: `npm run test:integration`.

## CI/CD Notes

- `.github/workflows/ci.yml` contains:
  - `Quality Gate`: lint, typecheck, unit tests, Prisma validate, CI build
  - `Release Readiness`: trusted PR/merge queue checks for Vercel credentials/env and `vercel build --prod`
  - `Dependency Review`: runs only when GitHub Dependency Graph is enabled
- `.github/workflows/deploy-production.yml` contains:
  - `verify-release`: re-validates quality, Vercel credentials, production env vars, and production artifact build
  - `deploy`: rebuilds Vercel artifacts, applies Turso migrations, then deploys with `vercel deploy --prebuilt --prod`
