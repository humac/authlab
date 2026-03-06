# AuthLab Security Review

**Date:** 2026-03-05
**Scope:** Full codebase — auth flows, API routes, data handling, session management, infrastructure
**Reviewer:** Security Reviewer (Claude)

---

## Executive Summary

AuthLab has a solid security foundation: AES-256-GCM encryption for secrets, bcrypt for passwords, iron-session for encrypted cookies, PKCE for OIDC, SSRF protection on metadata fetching, and Zod validation on all inputs. However, **one critical finding** (production secrets committed to the repository) requires immediate remediation. There are also several high and medium severity findings that should be addressed.

---

## Findings Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 4 |
| Medium | 3 |
| Low / Informational | 4 |
| **Total** | **12** |

---

## Critical Findings

### CRIT-1: Production Secrets Committed to Repository
**File:** `.vercel/.env.production.local`
**Severity:** Critical (CVSS 10.0)

The `.vercel/` directory is listed in `.gitignore`, but if this file was ever committed — or if the repository was not always private — the following production secrets are exposed in plaintext:

- `ENCRYPTION_KEY` — the AES-256-GCM master key used to encrypt **all** client secrets and IdP certificates in the database. Anyone with this key can decrypt every stored credential.
- `SESSION_PASSWORD` — iron-session signing key; possessing this allows forging valid session cookies, enabling complete authentication bypass.
- `TURSO_AUTH_TOKEN` — live JWT granting direct database access to `libsql://authlab-humac.aws-us-east-1.turso.io`.
- `SAML_SP_PRIVATE_KEY` — RSA private key for SP metadata signing.

The same `ENCRYPTION_KEY` and `SESSION_PASSWORD` values appear **both** in the local `.env` file and in `.vercel/.env.production.local`, indicating the same keys are used in dev and production.

**Remediation:**
1. **Immediately rotate** all four secrets: generate new `ENCRYPTION_KEY`, `SESSION_PASSWORD`, `TURSO_AUTH_TOKEN`, and SAML keypair.
2. Re-encrypt all database records with the new `ENCRYPTION_KEY` (decrypt with old, re-encrypt with new).
3. **Never reuse secrets between dev and production environments.**
4. Verify the repository has been private throughout its history; if not, treat all secrets as fully compromised.
5. Add a pre-commit hook (e.g. `gitleaks`) to prevent future secret commits.

---

## High Severity Findings

### HIGH-1: SAML Signature Verification Disabled
**File:** `src/lib/saml-handler.ts:20-21`
**Severity:** High

```ts
wantAssertionsSigned: false,
wantAuthnResponseSigned: false,
```

Both SAML assertion and response signature requirements are set to `false`. This allows an IdP that does not sign its responses (or an attacker performing a MITM or forged-response attack) to inject arbitrary claims without signature validation. In a testing tool this is intentional, but the risk should be documented prominently in the UI and any future production use must enforce signatures.

**Remediation:** Add a prominent warning in the test page UI that signatures are not verified. If the tool is ever used beyond the dev/test context, make signing enforced or at minimum configurable per-app with a clear default of `true`.

---

### HIGH-2: No Rate Limiting on Authentication Endpoints
**File:** `src/app/api/user/login/route.ts`, `src/app/api/user/register/route.ts`
**Severity:** High

There is no brute-force protection on the login endpoint. An attacker can make unlimited password-guessing attempts. The `bcrypt` cost factor of 12 provides some server-side throttling but does not replace proper rate limiting.

**Remediation:** Add rate limiting per IP (and per email for login) using the proxy layer. Vercel's Edge Proxy (formerly Middleware) supports this, or a lightweight library like `@upstash/ratelimit` with Redis can be used. The login route is the highest priority.

---

### HIGH-3: Open Redirect via `redirect` Query Parameter
**File:** `src/proxy.ts:150-152`
**Severity:** High

```ts
const loginUrl = new URL("/login", request.url);
loginUrl.searchParams.set("redirect", pathname);
return NextResponse.redirect(loginUrl);
```

The `redirect` parameter captures only the `pathname`, which prevents off-site redirects at the proxy level. However, if any client-side login form code consumes this parameter without validation and passes it directly to `router.push()`, it becomes an open redirect usable for phishing.

**Remediation:** Audit all client-side code that reads and acts on the `redirect` parameter. Ensure it validates the value starts with `/` and does not contain `//` (which browsers treat as protocol-relative).

---

### HIGH-4: Content Security Policy (CSP) Added via Proxy
**File:** `src/proxy.ts:54-80`
**Severity:** High

The proxy now adds `Content-Security-Policy` alongside `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and `Referrer-Policy`. The application uses `dangerouslySetInnerHTML` for the theme script (`src/app/layout.tsx:35`), so nonce-based CSP remains an important defense-in-depth control.

The inspector page renders raw claims and tokens from external IdPs. If a claim value contains script-like content and any downstream component renders it unsafely, CSP would be the last line of defense.

**Status:** Resolved in the current implementation. Keep the nonce-based CSP in the proxy and preserve it through future refactors.

---

## Medium Severity Findings

### MED-1: In-Memory State Store Not Suitable for Multi-Instance Deployments
**File:** `src/lib/state-store.ts`
**Severity:** Medium

The OIDC/SAML state, nonce, and PKCE code verifier are stored in a `Map` in process memory. On Vercel (serverless), each invocation can land on a different function instance, meaning the state stored during `/test/[slug]/login` may not be accessible during the callback. This causes intermittent auth failures in production and means TTL cleanup may never run on the instance that holds stale entries.

**Remediation:** Replace the in-memory store with an atomic, short-lived external store (e.g., a Turso table with a TTL-indexed `expiresAt` column, or Upstash Redis). This is architecturally required for correct serverless operation.

---

### MED-2: Invite Token Not Scoped to Invited Email
**File:** `src/app/api/invites/accept/route.ts:22-50`
**Severity:** Medium

When a user accepts an invite, the code verifies the token exists and is not expired, but **does not verify that the accepting user's email matches the invite's `email` field**. Any authenticated user who obtains the invite token URL can accept an invite intended for someone else.

```ts
// Missing check:
// if (invite.email.toLowerCase() !== user.email.toLowerCase()) { return 403 }
```

**Remediation:** Add a check that `invite.email === user.email` (case-insensitive) before accepting the invite. If the design intent is to allow any user to accept token-based invites (magic-link style), document this explicitly as a design decision.

---

### MED-3: `dangerouslySetInnerHTML` with Hardcoded Script
**File:** `src/app/layout.tsx:35`
**Severity:** Medium

```tsx
<script dangerouslySetInnerHTML={{ __html: themeScript }} />
```

The script content is entirely hardcoded at build time (no user input is interpolated), so there is no active XSS vector here. However, this pattern would become dangerous if any dynamic content were ever introduced into `themeScript`. The absence of a CSP nonce also blocks deployment of a restrictive CSP without code changes.

**Remediation:** No immediate code change needed, but document that `themeScript` must remain static. When implementing CSP (HIGH-4), attach a nonce to this script element.

---

## Low / Informational Findings

### LOW-1: OIDC `allowInsecureRequests` Silently Permits HTTP
**File:** `src/lib/oidc-handler.ts:73-75`

```ts
if (issuerUrl.protocol === "http:") {
  client.allowInsecureRequests(config);
}
```

This permits OIDC discovery and token exchange over plain HTTP, exposing the client secret and access tokens to network interception. Acceptable for local dev testing; should display a warning in the UI when an `http://` issuer URL is configured.

---

### LOW-2: Session Cookie `maxAge` Asymmetry — No Server-Side Invalidation
**File:** `src/lib/session.ts:12`, `src/lib/user-session.ts:14`

The user session expires in 7 days with no re-validation against the database. A compromised session cookie remains valid for the full 7-day window after a password change, role change, or account lockout — unless the user explicitly logs out.

**Remediation:** Consider storing a session version counter on the user record and comparing it on each authenticated request, or reduce the max session lifetime.

---

### LOW-3: Email Enumeration via Registration Response
**File:** `src/app/api/user/register/route.ts:35-39`

```ts
return NextResponse.json(
  { error: "An account with this email already exists" },
  { status: 409 },
);
```

This confirms to an unauthenticated requester whether a given email address has a registered account.

**Remediation:** Return a generic message such as `"If this email is not already registered, your account has been created"` to prevent enumeration.

---

### LOW-4: Unhandled Errors May Reveal Internal Details
**File:** Various routes that `throw error` after catching known error types

Several route handlers rethrow unexpected errors (e.g. `throw error` at `src/app/api/apps/route.ts:58`). In development Next.js includes stack traces in responses; in production Vercel suppresses them, but the pattern relies on that environment guarantee. If `NODE_ENV` is misconfigured, internal stack traces could leak.

**Remediation:** Add a global error boundary / 500 handler that logs internally and returns a sanitized response, rather than relying on the framework to mask rethrown errors.

---

## Positive Security Controls

The following controls were implemented correctly:

| Control | Location | Notes |
|---------|----------|-------|
| AES-256-GCM with random IV + auth tag | `encryption.ts` | Correct authenticated encryption |
| bcrypt cost 12 | `password.ts` | Appropriate work factor |
| PKCE (`S256`) for all OIDC flows | `oidc-handler.ts` | Prevents authorization code interception |
| One-time use + TTL state entries | `state-store.ts` | Correct OAuth CSRF protection |
| Per-tenant isolated session cookies | `session.ts` | Prevents cross-tenant session leakage |
| SSRF protection for metadata URLs | `saml-metadata.ts` | Comprehensive IPv4 + IPv6 block list |
| XXE sanitization before XML parsing | `xxe-sanitizer.ts` | Strips DOCTYPE/ENTITY before processing |
| Zod validation on all API inputs | `validators.ts` | Full schema enforcement at boundaries |
| Secret redaction in API responses | `app-instance.repo.ts` | `hasClientSecret` flag instead of secret value |
| CSRF origin check on mutations | `proxy.ts:82-120` | Rejects cross-origin POST/PUT/DELETE |
| Production database config enforcement | `db.ts:30-33` | Throws on partial Turso config |
| `mustChangePassword` enforcement | `proxy.ts:155-169` | Blocks API access until password reset |
| Personal workspace protection | Multiple routes | Cannot modify/delete personal workspaces |
| Last-admin deletion protection | `admin/users/[id]/route.ts` | Prevents admin lockout |

---

## Prioritized Remediation Plan

| Priority | Finding | Action |
|----------|---------|--------|
| 1 | CRIT-1 | Rotate all production secrets immediately |
| 2 | HIGH-2 | Add rate limiting to login and register endpoints |
| 3 | HIGH-4 | Implement Content-Security-Policy header |
| 4 | HIGH-3 | Audit client-side `redirect` parameter handling |
| 5 | MED-2 | Enforce email matching on invite acceptance |
| 6 | MED-1 | Replace in-memory state store for serverless correctness |
| 7 | HIGH-1 | Document SAML signature bypass prominently in test UI |
