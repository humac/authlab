# AuthLab — Multi-Tenant Auth Testing Workbench

A developer tool for dynamically creating, saving, and launching isolated OIDC or SAML test instances. Configure an identity provider, authenticate, inspect claims and payloads, exercise token lifecycle actions, validate logout behavior, test provisioning, and debug protocol behavior from a single enterprise-style workbench.

**Live**: [authlab-snowy.vercel.app](https://authlab-snowy.vercel.app)

## Features

- **Dynamic Provider Registry** — Create multiple OIDC or SAML app instances, each with its own slug-based URL
- **Isolated Sessions** — Each tenant gets its own encrypted cookie (`authlab_{slug}`), so you can test multiple providers simultaneously
- **OIDC Workbench** — Custom authorization parameters, PKCE modes (`S256`, `PLAIN`, `NONE`), nonce validation, UserInfo, introspection, revocation, refresh, client credentials, device authorization, token exchange, PAR, and both front-channel and back-channel logout testing
- **Lifecycle Inspector** — Token timeline, `acr` / `amr` diagnostics, JWT signature validation, `at_hash` / `c_hash` validation, claims diff, trace logging, compliance reporting, decoded claims, and raw JSON/XML views
- **Per-App SAML Signing** — Upload or generate self-signed SP signing material per app instance for signed metadata and AuthN requests
- **Enterprise SAML Controls** — NameID format, ForceAuthn, IsPassive, AuthnContext, signature algorithm, clock skew, encrypted assertions, and SAML SLO per app instance
- **SAML Trust Diagnostics** — Structured assertion parsing, signature detail inspection, IdP certificate health/expiry checks, and run-level compliance summaries
- **SCIM Mock Provisioning** — App-scoped SCIM `ServiceProviderConfig`, `Schemas`, `ResourceTypes`, `Users`, and `Groups` endpoints with persisted mock resources and request logs
- **Callback Routing** — App-specific callback URL for both OIDC and SAML; state/RelayState maps back to the correct tenant
- **Encryption at Rest** — Client secrets and IdP certificates encrypted with AES-256-GCM in the database
- **Secret Redaction** — API never exposes actual secrets; returns `hasClientSecret: boolean` instead
- **Team-Centric Dashboard** — Team switcher updates apps and shows live team membership/actions in the dashboard sidebar
- **Cross-Team App Transfer** — Team admins/owners can move or copy app configurations across teams
- **Dense SaaS UI** — Compact management tables, runtime launch controls, analyst-focused inspector tabs, mobile-friendly stacked table layouts, and explicit team access / join-queue states
- **App Organization** — Lightweight tags (up to 10 per app), auto-detected IDP grouping by hostname with SSO and cross-protocol badges, known-provider labeling (Okta, Microsoft Entra ID, Auth0, Google Workspace, OneLogin, Ping Identity, Keycloak), and Flat / By IDP / By Tag dashboard view toggle

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Database (local) | SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3` |
| Database (production) | Turso (libSQL) via Prisma 7 + `@prisma/adapter-libsql` |
| OIDC | `openid-client` v6 (dynamic discovery, PKCE) |
| SAML | `@node-saml/node-saml` v5 (standalone, no Passport) |
| Sessions | `iron-session` (encrypted cookies, dynamic names) |
| Encryption | AES-256-GCM (Node.js `crypto`) |
| Validation | Zod v4 (discriminated unions) |
| Hosting | Vercel + Turso |

## Local Development Setup

### Prerequisites

- **Node.js** >= 20
- **npm** >= 10

### 1. Clone the repository

```bash
git clone https://github.com/humac/authlab.git
cd authlab
```

### 2. Install dependencies

```bash
npm install
```

This also runs `prisma generate` automatically (via the `postinstall` script), which generates the Prisma client at `src/generated/prisma/client/`.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and generate secret keys:

```bash
# Generate a 64-character hex string for MASTER_ENCRYPTION_KEY
openssl rand -hex 32

# Generate a 64-character hex string for SESSION_PASSWORD
openssl rand -hex 32
```

Your `.env` should look like:

```env
DATABASE_URL="file:./dev.db"
MASTER_ENCRYPTION_KEY="<your-64-char-hex-string>"
SESSION_PASSWORD="<your-64-char-hex-string>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

The `TURSO_*` variables are only needed for production — leave them commented out for local development.

### 4. Create the database

```bash
npx prisma db push
```

This creates a `dev.db` SQLite file in the project root with the current Prisma schema, including app instances, auth runs, lifecycle events, and SCIM mock resources.

### 5. Start the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). You should see the AuthLab dashboard with a "Create Your First App" prompt.

Recent UX baseline highlights:

- management tables collapse into readable labeled rows on mobile instead of horizontal scroll
- team access states are explained directly in the Teams directory (`No access`, `Request pending`, role-based access, and join queue summaries)
- compact search inputs and adjacent action buttons share the same control height

### 6. Verify local changes before commit

Run both local test suites before creating a commit:

```bash
npm run test:unit
npm run test:integration
npm run test:security
```

If your work changes repo workflow, testing strategy, or agent guidance, update `AGENTS.md` and `CLAUDE.md` in the same branch before committing.

Browser E2E coverage is available separately with:

```bash
npm run test:e2e
```

Nightly auth-path latency baselines use:

```bash
npm run test:perf
```

### 7. Create a test app instance

1. Click **Create Your First App** (or **Create New App** in the sidebar)
2. Choose **OIDC** or **SAML**
3. Fill in your identity provider's configuration:
   - **OIDC**: Issuer URL, Client ID, Client Secret
   - **SAML**: SSO Entry Point URL, Issuer/Entity ID, IdP Certificate
   - **SAML Shortcut**: Use **Import IdP Metadata** to parse XML or fetch metadata from URL and apply values
4. Set a name and slug (auto-generated from name)
5. Optionally add tags (e.g. `production`, `staging`, `okta`) to organize apps
6. Review and create

Apps sharing the same identity provider are automatically grouped in the dashboard's **By IDP** view. When multiple apps point to the same provider hostname, SSO and cross-protocol badges highlight the relationship.

### 8. Register callback URLs with your IdP

Register these callback URLs in your identity provider's configuration:

- **OIDC (per app)**: `http://localhost:3000/api/auth/callback/oidc/{slug}`
- **OIDC front-channel logout (per app)**: `http://localhost:3000/api/auth/frontchannel-logout/{slug}`
- **OIDC back-channel logout (per app)**: `http://localhost:3000/api/auth/backchannel-logout/{slug}`
- **SAML (per app)**: `http://localhost:3000/api/auth/callback/saml/{slug}`

Use the exact slug for the app instance you are testing (shown on each app test page).  
OIDC example for slug `finance-oidc`: `http://localhost:3000/api/auth/callback/oidc/finance-oidc`  
SAML example for slug `hr-saml`: `http://localhost:3000/api/auth/callback/saml/hr-saml`  

### 9. SAML metadata export (Service Provider metadata)

For each SAML app, AuthLab exposes:

- Unsigned metadata: `http://localhost:3000/api/saml/metadata/{slug}`
- Signed metadata: `http://localhost:3000/api/saml/metadata/{slug}?signed=true`

Signed metadata and signed AuthN requests now use the app instance's own stored SP signing material.
If configured, metadata also publishes the app-specific decryption certificate and SAML SLO callback URL.

You can provide signing material in the app create/edit flow by:

- pasting PEM certificate and private key values
- or using **Generate Test Keypair** for a self-signed testing certificate

If a SAML app does not have signing material configured, unsigned metadata still works and the signed metadata endpoint returns `400`.

### 10. Test the auth flow

1. Click **Test** on your app instance card
2. Click the **Login with OIDC/SAML** button
3. Authenticate at your IdP
4. View the inspector page with lifecycle, validation, trace, claims diff, compliance, raw payload, and protocol-specific trust diagnostics

For OIDC apps, the test workbench also supports:

- Browser login
- Client credentials
- Device authorization
- Token exchange

For SAML apps, the inspector now also highlights:

- signature structure and certificate matching details
- IdP signing certificate subject, fingerprint, and expiry posture
- assertion/compliance posture across Conditions, SubjectConfirmation, SLO, and signing configuration

For app-level provisioning tests, the app detail page exposes:

- SCIM base URL
- SCIM discovery endpoints
- app-scoped bearer token
- recent SCIM resources and request logs

## Production Build

```bash
npm run build
npm start
```

## Production Deployment (Vercel + Turso)

AuthLab is deployed on Vercel with Turso as the production database (SQLite-compatible, works in serverless environments).

### Database Setup

1. Install the Turso CLI and create a database:
   ```bash
   brew install tursodatabase/tap/turso
   turso auth login
   turso db create authlab
   turso db tokens create authlab
   ```

2. Push the schema to Turso:
   ```bash
   export TURSO_DATABASE_NAME=authlab
   ./scripts/ci/apply-turso-migrations.sh
   ```

### Vercel Configuration

Set environment variables on Vercel using `printf` (not `echo`, which adds trailing newlines that break auth tokens):

```bash
printf 'libsql://your-db.turso.io' | vercel env add TURSO_DATABASE_URL production
printf 'your-turso-auth-token' | vercel env add TURSO_AUTH_TOKEN production
printf 'file:/tmp/dummy.db' | vercel env add DATABASE_URL production
printf 'your-64-char-hex-key' | vercel env add MASTER_ENCRYPTION_KEY production
printf 'your-64-char-hex-password' | vercel env add SESSION_PASSWORD production
printf 'https://your-app.vercel.app' | vercel env add NEXT_PUBLIC_APP_URL production
```

### Optional: Signed SAML metadata setup

Only needed if you want to prepare PEM material outside AuthLab before uploading it to a SAML app instance.

Generate an SP key pair:

```bash
openssl genrsa -out saml-sp-private-key.pem 2048
openssl req -new -x509 \
  -key saml-sp-private-key.pem \
  -sha256 -days 3650 \
  -subj "/CN=authlab.keydatalabs.ca/O=KeyDataLabs/C=CA" \
  -out saml-sp-public-cert.pem
```

Deploy:
```bash
vercel --prod
```

After deployment, upload the PEM pair into the target SAML app instance or use the in-product test keypair generator.

## Release Workflow

AuthLab currently uses a three-branch release model:

- `main` — integration branch
- `alpha` — staged alpha release branch
- `beta` — staged beta release branch

Suggested flow:

1. Merge and stabilize work on `main`.
2. Cut or fast-forward `alpha` from the `main` commit you want to release as the alpha line.
3. Advance `beta` from the tested beta line you want to stage separately.
4. Tag immutable releases from those branches, for example:
   - `v0.1.0-alpha`
   - `v0.2.0-beta`
5. Deploy from `alpha` or `beta`, not directly from `main`.
6. Roll back by redeploying the previous tagged commit or prior branch head.

This keeps `main` as integration while making deploy and rollback decisions branch- and tag-based.

### Automated Deploy (GitHub Actions)

This repo now includes:

1. `.github/workflows/ci.yml` for pull request and merge queue validation
2. `.github/workflows/deploy-production.yml` for pre-deploy verification, Turso migrations, and production release
3. `.github/workflows/nightly-performance.yml` for nightly auth-path latency baselines and artifact reporting

The pull request gate runs:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:unit`
5. `npm run test:integration`
6. `npm run test:security`
7. `npm run prisma:validate`
8. `npm run build:ci`
9. `npm run test:e2e`

The deploy workflow now:

1. Installs dependencies and runs `lint`, `typecheck`, and `prisma validate`
2. Pulls project settings and validates required production env vars
3. Builds Vercel artifacts before any production migration runs
4. Applies pending SQL files from `prisma/turso-migrations/` to Turso
5. Deploys the verified prebuilt artifact with `--prebuilt`

Required repository secrets:

- `TURSO_API_TOKEN`
- `TURSO_DATABASE_NAME` (example: `authlab`)
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Each Turso migration file is applied exactly once and tracked in `_authlab_schema_migrations`.
`prisma/turso-migrations/0001_init.sql` is the baseline schema for greenfield deployments.
Do not delete historical migration files after deployment; keep them committed for replay/recovery.
The repo includes `.vercelignore` with `.next` to prevent uploading local Next.js build output.
For the full gate design and branch protection recommendations, see `docs/ci-cd-testing-strategy.md`.

### Schema Changes in Production

Prisma CLI doesn't support `libsql://` URLs. After editing `prisma/schema.prisma`:

```bash
# Apply locally
npx prisma db push

# Generate an incremental SQL migration file for Turso
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/turso-migrations/<timestamp>_<change>.sql

# Push to deploy
git add . && git commit -m "update schema" && git push
```

Important notes:

- Keep all files in `prisma/turso-migrations/` in git; each file is applied once and then tracked.
- `--from-config-datasource` reads from the datasource in `prisma.config.ts` (local SQLite in this project). If local SQLite is ahead of Turso, the generated diff can be empty even when Turso is missing tables/columns.
- Always verify production schema directly in Turso before closing a deployment.

Production verification checklist:

1. Confirm key tables exist:
   ```bash
   turso db shell authlab ".tables"
   ```
2. Confirm expected columns for changed tables:
   ```bash
   turso db shell authlab ".schema SystemSetting"
   ```
3. Re-test affected flows against production (for example: user registration, admin settings).

### Production Schema Drift Recovery

If production is missing `SystemSetting`, apply this emergency SQL:

```sql
CREATE TABLE IF NOT EXISTS "SystemSetting" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
```

Then verify:

```bash
turso db shell authlab ".schema SystemSetting"
```

### Legacy AppInstance Schema Reconciliation

If production still has legacy `AppInstance` without `teamId`, run:

```bash
turso db shell authlab < prisma/production-reconcile-2026-03-05.sql
```

What this does:

- Creates `SystemSetting` if missing.
- Creates a legacy team (`legacy_migration_team`) if missing.
- Rebuilds `AppInstance` with required `teamId` + foreign key to `Team`.
- Preserves existing `AppInstance` rows by assigning them to the legacy team.
- On first user registration, AuthLab automatically reassigns legacy-team apps to that first user's personal team.

Post-checks:

```bash
turso db shell authlab ".schema AppInstance"
turso db shell authlab "PRAGMA table_info(\"AppInstance\");"
turso db shell authlab "PRAGMA foreign_key_list(\"AppInstance\");"
```

## Project Structure

```
authlab/
├── prisma/
│   └── schema.prisma           # Data model (AppInstance + Protocol enum)
├── prisma.config.ts            # Prisma 7 config (always uses local SQLite for CLI)
├── next.config.ts              # Next.js config (serverExternalPackages for native modules)
├── src/
│   ├── app/                    # Next.js App Router pages and API routes
│   ├── lib/                    # Core libraries (auth, encryption, session, DB)
│   ├── repositories/           # Data access layer with transparent encryption
│   ├── components/             # React components (ui, layout, apps, inspector)
│   ├── types/                  # TypeScript interfaces
│   └── generated/              # Prisma-generated client (not committed)
├── CLAUDE.md                   # AI assistant context
├── AGENTS.md                   # Agent role definitions
└── .env.example                # Environment variable template
```

## License

MIT
