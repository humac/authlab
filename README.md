# AuthLab — Multi-Tenant Auth Testing Workbench

A developer tool for dynamically creating, saving, and launching isolated OIDC or SAML test instances. Configure an identity provider, authenticate, and inspect the resulting claims, raw tokens/assertions, and JWT breakdowns — all from a single workbench.

**Live**: [authlab-snowy.vercel.app](https://authlab-snowy.vercel.app)

## Features

- **Dynamic Provider Registry** — Create multiple OIDC or SAML app instances, each with its own slug-based URL
- **Isolated Sessions** — Each tenant gets its own encrypted cookie (`authlab_{slug}`), so you can test multiple providers simultaneously
- **Inspector Page** — Decoded claims table, raw JSON/XML view with copy, JWT header/payload/signature breakdown (OIDC)
- **Global Callback Routing** — One callback URL per protocol; state/RelayState maps back to the correct tenant
- **Encryption at Rest** — Client secrets and IdP certificates encrypted with AES-256-GCM in the database
- **Secret Redaction** — API never exposes actual secrets; returns `hasClientSecret: boolean` instead
- **Team-Centric Dashboard** — Team switcher updates apps and shows live team membership/actions in the dashboard sidebar
- **Cross-Team App Transfer** — Team admins/owners can move or copy app configurations across teams

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
# Generate a 64-character hex string for ENCRYPTION_KEY
openssl rand -hex 32

# Generate a 64-character hex string for SESSION_PASSWORD
openssl rand -hex 32
```

Your `.env` should look like:

```env
DATABASE_URL="file:./dev.db"
ENCRYPTION_KEY="<your-64-char-hex-string>"
SESSION_PASSWORD="<your-64-char-hex-string>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SAML_SP_PRIVATE_KEY=""
SAML_SP_PUBLIC_CERT=""
```

The `TURSO_*` variables are only needed for production — leave them commented out for local development.

### 4. Create the database

```bash
npx prisma db push
```

This creates a `dev.db` SQLite file in the project root with the `AppInstance` table.

### 5. Start the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). You should see the AuthLab dashboard with a "Create Your First App" prompt.

### 6. Create a test app instance

1. Click **Create Your First App** (or **Create New** in the sidebar)
2. Choose **OIDC** or **SAML**
3. Fill in your identity provider's configuration:
   - **OIDC**: Issuer URL, Client ID, Client Secret
   - **SAML**: SSO Entry Point URL, Issuer/Entity ID, IdP Certificate
   - **SAML Shortcut**: Use **Import IdP Metadata** to parse XML or fetch metadata from URL and apply values
4. Set a name and slug (auto-generated from name)
5. Review and create

### 7. Register callback URLs with your IdP

Register these callback URLs in your identity provider's configuration:

- **OIDC**: `http://localhost:3000/api/auth/callback/oidc`
- **SAML**: `http://localhost:3000/api/auth/callback/saml`

### 8. SAML metadata export (Service Provider metadata)

For each SAML app, AuthLab exposes:

- Unsigned metadata: `http://localhost:3000/api/saml/metadata/{slug}`
- Signed metadata: `http://localhost:3000/api/saml/metadata/{slug}?signed=true`

The signed endpoint requires:

- `SAML_SP_PRIVATE_KEY` (PEM private key)
- `SAML_SP_PUBLIC_CERT` (matching PEM public certificate)

If these variables are not set, unsigned metadata still works and the signed metadata endpoint returns `400`.

### 9. Test the auth flow

1. Click **Test** on your app instance card
2. Click the **Login with OIDC/SAML** button
3. Authenticate at your IdP
4. View the inspector page with decoded claims, raw data, and JWT breakdown

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
   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > migration.sql
   turso db shell authlab < migration.sql
   ```

### Vercel Configuration

Set environment variables on Vercel using `printf` (not `echo`, which adds trailing newlines that break auth tokens):

```bash
printf 'libsql://your-db.turso.io' | vercel env add TURSO_DATABASE_URL production
printf 'your-turso-auth-token' | vercel env add TURSO_AUTH_TOKEN production
printf 'file:/tmp/dummy.db' | vercel env add DATABASE_URL production
printf 'your-64-char-hex-key' | vercel env add ENCRYPTION_KEY production
printf 'your-64-char-hex-password' | vercel env add SESSION_PASSWORD production
printf 'https://your-app.vercel.app' | vercel env add NEXT_PUBLIC_APP_URL production
```

### Optional: Signed SAML metadata setup

Only needed if you want `?signed=true` metadata export.

Generate an SP key pair:

```bash
openssl genrsa -out saml-sp-private-key.pem 2048
openssl req -new -x509 \
  -key saml-sp-private-key.pem \
  -sha256 -days 3650 \
  -subj "/CN=authlab.keydatalabs.ca/O=KeyDataLabs/C=CA" \
  -out saml-sp-public-cert.pem
```

Add signing env vars to Vercel:

```bash
cat saml-sp-private-key.pem | vercel env add SAML_SP_PRIVATE_KEY production
cat saml-sp-public-cert.pem | vercel env add SAML_SP_PUBLIC_CERT production
```

Deploy:
```bash
vercel --prod
```

### Schema Changes in Production

Prisma CLI doesn't support `libsql://` URLs. After editing `prisma/schema.prisma`:

```bash
# Apply locally
npx prisma db push

# Generate migration SQL for Turso
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > migration.sql

# Apply to Turso
turso db shell authlab < migration.sql

# Push to deploy
git add . && git commit -m "update schema" && git push
```

Important notes:

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
