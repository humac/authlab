# AuthLab — Functional Discovery (Internal)

> **Generated:** 2026-03-09 | **Branch:** beta

## Application Overview

AuthLab is a multi-tenant auth testing workbench for OIDC/SAML app flows. It enables identity teams to dynamically create isolated test instances, authenticate against any IdP, inspect tokens/assertions, exercise token lifecycle actions, test logout flows, and mock SCIM provisioning — all from a single enterprise-style UI.

## User Roles

### System Roles

| Role | Access |
|------|--------|
| System Admin | Full platform: create teams, manage all users, configure email provider, access admin pages |
| Regular User | Access teams they belong to, personal settings, team apps |

First user to register becomes System Admin automatically.

### Team Roles

| Role | Access |
|------|--------|
| Owner | Full team control: members, apps, settings, delete team, review join requests |
| Admin | Manage members, apps, invitations, review join requests |
| Member | View and test apps, view team members |

## UI Routes

### Auth Pages (unauthenticated)
| Route | Page | Purpose |
|-------|------|---------|
| `/login` | Login | Email/password + passkey login |
| `/register` | Register | Account creation |
| `/forgot-password` | Forgot Password | Request password reset |
| `/reset-password` | Reset Password | Complete password reset |
| `/verify-email` | Verify Email | Email verification landing |
| `/invite/[token]` | Accept Invite | Invitation acceptance |

### Dashboard Pages (authenticated)
| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | App inventory, team overview, search |
| `/apps/new` | Create App | OIDC or SAML app creation form |
| `/apps/[id]` | Edit App | App settings and configuration |
| `/settings` | User Settings | Profile, password, MFA, passkeys, team memberships |
| `/teams` | Teams Directory | Browse all teams, request access, review join requests |
| `/teams/new` | Create Team | New team form (system admin only) |
| `/teams/[id]` | Team Detail | Members, invitations, team management |
| `/admin/users` | Admin Users | System-wide user CRUD and team assignments |
| `/admin/settings` | Admin Settings | Email provider configuration |

### Test Pages (authenticated)
| Route | Page | Purpose |
|-------|------|---------|
| `/test/[slug]` | Test Page | Runtime launch panel, SCIM endpoints, auth history |
| `/test/[slug]/inspector` | Inspector | Multi-tab diagnostic view of auth session |

## API Surface

### Account Security (17 endpoints)
- Registration, login, MFA TOTP, passkeys, email verification, password reset, profile image, session

### Admin (7 endpoints)
- User CRUD, team admin creation, email provider config, system settings, admin stats

### Teams (15 endpoints)
- Team CRUD, members, invites, join requests, directory, team switching, leaving

### App Management (3 endpoints)
- App CRUD, app transfer

### Auth Protocol (17 endpoints)
- OIDC callback, SAML callback, token lifecycle (refresh/introspect/revoke/client-credentials/exchange), device flow, userinfo, logout (RP/front-channel/back-channel/SAML SLO)

### SAML (3 endpoints)
- SP metadata, signing material generation, metadata import

### SCIM (7 endpoint groups)
- ServiceProviderConfig, ResourceTypes, Schemas, Users CRUD, Groups CRUD

## Data Model

### Core Entities
| Entity | Purpose | Key Fields |
|--------|---------|------------|
| User | Platform accounts | email, name, passwordHash, isSystemAdmin, isVerified, mfaEnabled |
| Team | Multi-tenant workspaces | name, slug, isPersonal |
| TeamMember | User-team associations | role (OWNER/ADMIN/MEMBER) |
| AppInstance | Auth test configurations | protocol (OIDC/SAML), slug, OIDC/SAML-specific fields |
| AuthRun | Persisted auth sessions | protocol, grantType, status, tokens, claims |
| AuthRunEvent | Session lifecycle log | type, status, request, response, metadata |

### Security Entities
| Entity | Purpose |
|--------|---------|
| Credential | WebAuthn passkey storage |
| AuthToken | Email verify / password reset tokens (hashed) |
| UserProfileImage | Profile image binary storage |
| SystemSetting | Platform configuration (email provider, etc.) |

### Provisioning Entities
| Entity | Purpose |
|--------|---------|
| ScimResource | Mock SCIM users/groups per app |
| ScimRequestLog | SCIM API audit trail per app |

### Supporting Entities
| Entity | Purpose |
|--------|---------|
| InviteToken | Team invitation tokens |
| TeamJoinRequest | Join request workflow |

## Feature Inventory

### End-User Features
1. **Account Management** — register, login (email+password or passkey), email verification, password reset, MFA (TOTP)
2. **Profile** — name, email, profile image (upload/remove)
3. **Security Settings** — change password, enable/disable TOTP, manage passkeys
4. **Team Participation** — view memberships, leave teams, switch active team, request access
5. **App Testing (OIDC)** — create app, configure provider, browser login, client credentials, device auth, token exchange, token lifecycle (refresh/introspect/revoke), UserInfo, 3 logout modes
6. **App Testing (SAML)** — create app, configure provider, import metadata, SP signing/encryption, browser login (SP/IdP-initiated), SLO, assertion inspection
7. **App Testing (SCIM)** — view SCIM base URL and bearer token, view resources and request logs
8. **Inspector** — lifecycle panel, token validation, UserInfo, claims diff, trace, compliance, signature, certificate health, raw payload, JWT decoder

### Admin Features
1. **User Management** — create/edit/delete users, assign teams/roles, toggle security flags
2. **Team Management** — create teams, manage join queue
3. **Email Provider** — configure SMTP or Brevo, test email delivery
4. **Platform Stats** — user counts, admin counts, reset-needed counts

## Sensitive Field Inventory (for seed script)
- `passwordHash` — must be hashed with Argon2id
- `clientSecret`, `idpCert`, `spSigningPrivateKey`, `spEncryptionPrivateKey`, `accessTokenEnc`, `refreshTokenEnc`, `rawTokenResponseEnc`, `responseEnc` — encrypted with AES-256-GCM
- `tokenHash` (AuthToken) — SHA-256 of opaque token
- `totpSecretEnc` — encrypted TOTP secret
