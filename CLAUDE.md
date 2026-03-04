# CLAUDE.md — AuthLab Project Context

## Project Overview

AuthLab is a Multi-Tenant Auth Testing Workbench — a developer tool for dynamically creating, saving, and launching isolated OIDC or SAML test instances. After authenticating via an IdP, users see an inspector page with decoded claims, raw tokens/assertions, and JWT breakdowns.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **Database (local)**: Prisma 7 + SQLite (`@prisma/adapter-better-sqlite3`)
- **Database (production)**: Prisma 7 + Turso/libSQL (`@prisma/adapter-libsql`)
- **OIDC**: `openid-client` v6 (dynamic issuer discovery, PKCE)
- **SAML**: `@node-saml/node-saml` v5 (standalone, no Passport)
- **Sessions**: `iron-session` (encrypted cookies, per-tenant dynamic cookie names)
- **Encryption**: AES-256-GCM via Node.js `crypto` module
- **Validation**: Zod v4 with discriminated unions
- **UI**: Custom Tailwind components (TW-Elements design language)
- **Hosting**: Vercel (serverless) + Turso (SQLite-compatible edge database)

## Commands

```bash
npm install              # Install deps + auto-runs prisma generate (postinstall)
npm run dev              # Start dev server on port 3000
npm run build            # Production build
npm run lint             # Run ESLint
npx prisma db push       # Sync schema to LOCAL SQLite database
npx prisma generate      # Regenerate Prisma client (also runs on npm install)
npx prisma studio        # Open database GUI (local only)
```

### Turso (Production Database)

```bash
# Generate migration SQL and apply to Turso
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > migration.sql
turso db shell authlab < migration.sql

# For incremental changes (after initial setup)
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > migration.sql
turso db shell authlab < migration.sql
```

## Architecture

### Directory Structure

```
src/
├── app/                      # Next.js App Router pages and routes
│   ├── api/apps/             # CRUD REST API for app instances
│   ├── api/auth/callback/    # Global OIDC + SAML callback handlers
│   ├── api/auth/logout/      # Session destruction
│   ├── apps/new/             # Creation stepper UI
│   ├── apps/[id]/            # Edit app instance UI
│   ├── test/[slug]/          # Test landing page + login route + inspector
│   └── page.tsx              # Dashboard (force-dynamic, queries DB at runtime)
├── lib/                      # Core libraries
│   ├── auth-factory.ts       # Factory: AppInstance → OIDCHandler | SAMLHandler
│   ├── oidc-handler.ts       # openid-client v6 flow (discovery, PKCE, token exchange)
│   ├── saml-handler.ts       # node-saml flow (authorize URL, validate response)
│   ├── session.ts            # iron-session with dynamic cookie name per tenant
│   ├── state-store.ts        # In-memory state/nonce/PKCE store (10min TTL, one-time use)
│   ├── encryption.ts         # AES-256-GCM encrypt/decrypt (iv:authTag:ciphertext hex)
│   ├── xxe-sanitizer.ts      # Strip DOCTYPE/ENTITY from SAML XML
│   ├── validators.ts         # Zod schemas for API input validation
│   └── db.ts                 # Async getPrisma() — dual adapter (libSQL for Turso, better-sqlite3 for local)
├── repositories/             # Data access layer
│   └── app-instance.repo.ts  # CRUD with transparent encrypt/decrypt on secrets
├── components/               # React components
│   ├── ui/                   # Primitives: Button, Card, Input, Modal, Tabs, Stepper, Badge
│   ├── layout/               # AppShell (sidebar + content)
│   ├── apps/                 # Dashboard, CreationStepper, EditForm, ConfigFields
│   └── inspector/            # ClaimsTable, RawPayloadView, JWTDecoder, SessionInfo
└── types/                    # TypeScript interfaces
```

### Key Design Patterns

1. **Auth Factory Pattern**: `createAuthHandler(appInstance)` returns an `OIDCHandler` or `SAMLHandler` based on the protocol field. Both conform to the same `AuthHandler` interface.

2. **Global Callback Routing**: One callback URL per protocol registered with IdPs. The `state` parameter (OIDC) or `RelayState` (SAML) maps back to the tenant slug via an in-memory store.

3. **Session Isolation**: Each tenant gets its own encrypted cookie (`authlab_{slug}`), preventing cross-contamination when testing multiple providers simultaneously.

4. **Repository Pattern**: All database access goes through `app-instance.repo.ts`, which handles AES-256-GCM encryption/decryption transparently. API routes never see encrypted data; the auth factory receives already-decrypted instances.

5. **Secret Redaction**: GET endpoints return `hasClientSecret: boolean` instead of actual secrets. Secrets are never exposed via the API.

6. **Dual Database Adapter**: `db.ts` exports an async `getPrisma()` that dynamically imports the correct adapter — `@prisma/adapter-libsql` when `TURSO_DATABASE_URL` is set (production/Vercel), `@prisma/adapter-better-sqlite3` otherwise (local dev).

### Prisma 7 Notes

- Prisma 7 requires `prisma.config.ts` at project root (no `url` in schema.prisma)
- `prisma.config.ts` always points to local SQLite for CLI commands (db push, generate)
- Turso schema changes must be applied via `prisma migrate diff` + `turso db shell` (Prisma CLI doesn't support `libsql://` URLs)
- Generated client lives at `src/generated/prisma/client/` — import from `client/client` and `client/enums`
- `prisma generate` runs automatically on `npm install` via the `postinstall` script
- `next.config.ts` uses `serverExternalPackages` to externalize `better-sqlite3` (native module incompatible with Vercel)

### Environment Variables

**Local development** (`.env`):
- `DATABASE_URL` — SQLite path (`file:./dev.db`)
- `ENCRYPTION_KEY` — 64-char hex string (32 bytes) for AES-256-GCM
- `SESSION_PASSWORD` — 64-char hex string for iron-session cookie encryption
- `NEXT_PUBLIC_APP_URL` — Base URL for callback redirect construction (`http://localhost:3000`)

**Production / Vercel** (set via `vercel env add`, use `printf` not `echo` to avoid trailing newlines):
- `TURSO_DATABASE_URL` — Turso database URL (`libsql://your-db.turso.io`)
- `TURSO_AUTH_TOKEN` — Turso auth token (JWT)
- `DATABASE_URL` — Dummy value for Prisma config (`file:/tmp/dummy.db`)
- `ENCRYPTION_KEY` — Same format as local
- `SESSION_PASSWORD` — Same format as local
- `NEXT_PUBLIC_APP_URL` — Vercel deployment URL (`https://authlab-snowy.vercel.app`)

## Code Style

- Server components by default; client components only where interactivity is needed
- `"use client"` directive at top of interactive components
- Prefer named exports over default exports (except page components)
- All secrets encrypted at the repository layer, never in route handlers
- Zod validation on all API inputs before database operations
- Database access via `await getPrisma()` (async, not a direct import)
