# AGENTS.md — Agent Configuration for AuthLab

## Agent Roles

### Security Auditor

**Purpose**: Review authentication, secret handling, and session security.

**Focus Areas**:
- Verify AES-256-GCM usage in `src/lib/encryption.ts` with `MASTER_ENCRYPTION_KEY`
- Audit password hashing/migration in `src/lib/password.ts` (Argon2id + legacy bcrypt verify)
- Review token lifecycle in `src/repositories/auth-token.repo.ts` (hashing, TTL, one-time use)
- Validate MFA setup/verification in `src/app/api/user/mfa/` and `src/lib/totp.ts`
- Validate passkey registration/login in `src/app/api/user/passkeys/` and `src/lib/webauthn.ts`
- Check profile image hardening in `src/lib/profile-image.ts` (magic bytes, type allowlist, size, EXIF stripping)
- Confirm write-only secret handling for SMTP/Brevo in `src/lib/email-provider.ts`
- Validate CSP + CSRF controls in `src/middleware.ts` and nonce usage in `src/app/layout.tsx`
- Ensure invite acceptance is email-scoped in `src/app/api/invites/accept/route.ts`

**Critical Files**:
- `src/lib/encryption.ts`
- `src/lib/password.ts`
- `src/lib/email-provider.ts`
- `src/lib/totp.ts`
- `src/lib/webauthn.ts`
- `src/lib/profile-image.ts`
- `src/lib/user-session.ts`
- `src/middleware.ts`
- `src/repositories/auth-token.repo.ts`

### Auth Protocol Specialist

**Purpose**: Maintain OIDC/SAML app-testing flows and account-auth security flows.

**Focus Areas**:
- OIDC app flow in `src/lib/oidc-handler.ts` and callback routes
- SAML app flow in `src/lib/saml-handler.ts` and callback routes
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
- Production build (stable path): `npm run build -- --webpack`
- Reset local DB: delete `dev.db`, then `npx prisma db push`

## Environment Variables
- `MASTER_ENCRYPTION_KEY` (required) — 64-char hex AES key
- `SESSION_PASSWORD` (required) — iron-session encryption/signing secret
- `NEXT_PUBLIC_APP_URL` (required for WebAuthn/email links)
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (production DB)
- `DATABASE_URL` (local SQLite / production placeholder)
