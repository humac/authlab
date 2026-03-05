# AGENTS.md — Agent Configuration for AuthLab

## Agent Roles

### Security Auditor

**Purpose**: Review authentication flows, encryption, and session management for vulnerabilities.

**Focus Areas**:
- Verify AES-256-GCM encryption in `src/lib/encryption.ts` — check IV uniqueness, auth tag validation, key derivation
- Audit state parameter handling in `src/lib/state-store.ts` — TTL enforcement, one-time use, replay prevention
- Review XXE sanitization in `src/lib/xxe-sanitizer.ts` — coverage of attack vectors (billion laughs, external entities)
- Check session isolation in `src/lib/session.ts` — cookie name uniqueness, `httpOnly`/`secure` flags
- Validate CSRF protection in `src/middleware.ts` — origin checking, content-type enforcement
- Ensure secrets never leak via `src/repositories/app-instance.repo.ts` — redaction in list/get operations
- Verify SAML response handling in `src/lib/saml-handler.ts` — XML sanitization before validation

**Critical Files**:
- `src/lib/encryption.ts`
- `src/lib/state-store.ts`
- `src/lib/xxe-sanitizer.ts`
- `src/lib/session.ts`
- `src/middleware.ts`
- `src/repositories/app-instance.repo.ts`

### Auth Protocol Specialist

**Purpose**: Maintain and extend OIDC and SAML authentication handlers.

**Focus Areas**:
- OIDC flow in `src/lib/oidc-handler.ts` — issuer discovery, PKCE, authorization code grant, token extraction
- SAML flow in `src/lib/saml-handler.ts` — SP configuration, assertion validation, attribute extraction
- Auth factory in `src/lib/auth-factory.ts` — handler interface, protocol routing
- Callback routes in `src/app/api/auth/callback/` — per-app OIDC callback (`oidc/[slug]`) + per-app SAML callback (`saml/[slug]`)
- Login initiation in `src/app/test/[slug]/login/route.ts` — dynamic redirect construction

**Key Libraries**:
- `openid-client` v6 — functional API (not class-based), uses `discovery()`, `buildAuthorizationUrl()`, `authorizationCodeGrant()`
- `@node-saml/node-saml` v5 — `SAML` class with `getAuthorizeUrlAsync()`, `validatePostResponseAsync()`

**Testing Protocol**:
1. Configure a test OIDC provider (Google, Auth0 dev tenant) via the stepper UI
2. Register `{NEXT_PUBLIC_APP_URL}/api/auth/callback/oidc/{slug}` as redirect URI in the IdP for that app
3. Click "Login with OIDC" on the test page — should redirect to IdP and back to inspector
4. For SAML, use an IdP like Okta with `{NEXT_PUBLIC_APP_URL}/api/auth/callback/saml/{slug}` as ACS URL

### UI/Frontend Developer

**Purpose**: Build and maintain React components and pages.

**Focus Areas**:
- UI primitives in `src/components/ui/` — Button, Card, Input, Modal, Tabs, Stepper, Badge, CopyButton
- Layout in `src/components/layout/AppShell.tsx` — sidebar navigation, responsive design
- App management in `src/components/apps/` — Dashboard grid, TeamMembersPanel, CreationStepper (4-step flow), EditForm
- Inspector in `src/components/inspector/` — ClaimsTable, RawPayloadView, JWTDecoder, SessionInfo
- Dashboard-first team UX:
  - `src/app/(dashboard)/page.tsx` renders apps + active-team member panel
  - `src/components/apps/TeamMembersPanel.tsx` handles member listing, add/invite, remove actions
  - `src/components/apps/AppInstanceCard.tsx` provides move/copy transfer actions between teams

**Design System**:
- Primary color: `#3B71CA` (TW-Elements blue) — defined as `--color-primary` in `globals.css`
- Tailwind CSS v4 with `@theme inline` for custom properties
- Components use Tailwind utility classes directly (no CSS modules)
- All interactive components are client components (`"use client"`)
- Server components fetch data and pass via props to client components

### Database/Backend Developer

**Purpose**: Manage data access, schema, and API routes.

**Focus Areas**:
- Prisma schema in `prisma/schema.prisma` — AppInstance model, Protocol enum
- Prisma config in `prisma.config.ts` — datasource URL (always local SQLite for CLI)
- Database client in `src/lib/db.ts` — async `getPrisma()` with strict production Turso checks
- Repository layer in `src/repositories/app-instance.repo.ts` — CRUD + move/copy transfer helpers with encryption
- Team repositories in `src/repositories/team.repo.ts` — memberships, role checks, owner-count checks for leave flow
- API routes in `src/app/api/apps/` — REST endpoints with Zod validation
- Team API routes in `src/app/api/teams/` — member management and leave flows
- Validation schemas in `src/lib/validators.ts` — OIDC/SAML + transfer/member-management schemas

**Database Notes**:
- **Local**: Prisma 7 + `@prisma/adapter-better-sqlite3` driver adapter, SQLite file at `./dev.db`
- **Production**: Prisma 7 + `@prisma/adapter-libsql` for Turso (SQLite-compatible edge database on Vercel)
- `db.ts` exports `getPrisma()` (async) — dynamically imports the correct adapter based on `TURSO_DATABASE_URL` env var
- Generated client at `src/generated/prisma/client/` — NOT committed to git, auto-generated on `npm install`
- `prisma.config.ts` always uses local SQLite (`DATABASE_URL` or `file:./dev.db` fallback) for CLI commands
- Prisma CLI does NOT support `libsql://` URLs — use `prisma migrate diff` + `turso db shell` for production schema changes
- `clientSecret` and `idpCert` are AES-256-GCM encrypted; encryption/decryption happens only in the repository layer
- `next.config.ts` externalizes `better-sqlite3` via `serverExternalPackages` (native module, incompatible with Vercel bundling)
- App copy flow re-encrypts secrets by going through repository create paths (fresh IV/auth tag)

## Development Workflow

### Schema Changes

1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push` to apply to local SQLite
3. Run `npx prisma generate` to regenerate client
4. For production (Turso):
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > migration.sql
   turso db shell authlab < migration.sql
   ```
5. Deploy to Vercel (auto-runs `prisma generate` via postinstall)

### Adding a New Protocol

1. Create a new handler class in `src/lib/` implementing the `AuthHandler` interface
2. Add the protocol to the `Protocol` enum in `prisma/schema.prisma`
3. Add protocol-specific fields to the `AppInstance` model
4. Update `src/lib/auth-factory.ts` to route to the new handler
5. Add validation schema variant in `src/lib/validators.ts`
6. Create UI config fields component in `src/components/apps/`
7. Add the protocol option to `src/components/apps/CreationStepper.tsx`
8. Add a callback route in `src/app/api/auth/callback/`

### Adding a New Inspector Tab

1. Create a new component in `src/components/inspector/`
2. Add it to the tabs array in `src/app/test/[slug]/inspector/page.tsx`
3. Ensure relevant data is stored in the session (`src/types/session.ts`)

### Common Tasks

- **Run the app**: `npm run dev` then visit `http://localhost:3000`
- **Reset database**: Delete `dev.db` and run `npx prisma db push`
- **Update schema**: Edit `prisma/schema.prisma`, then `npx prisma db push && npx prisma generate`
- **Add a dependency**: `npm install <package>` — check Prisma 7 compatibility for database-related packages
- **Deploy**: Push to `main` branch — Vercel auto-deploys via GitHub integration
- **Set Vercel env vars**: Use `printf 'value' | vercel env add NAME production` (not `echo`, to avoid trailing newlines)
