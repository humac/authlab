# CI/CD Testing Strategy

## Goal

Block production deployments unless the repository passes static quality checks, dependency review, environment validation, and a production artifact build in GitHub Actions.

## Enforced Gates

### Pull request gate

Workflow: `.github/workflows/ci.yml`

Runs on every pull request and merge queue event:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:security`
- `npm run prisma:validate`
- `npm run build:ci`
- Playwright E2E coverage for the auth and dashboard journeys in `docs/e2e-test-report.md`
- Dependency diff scanning with `actions/dependency-review-action`
- Production release-readiness verification for trusted PRs and merge queue runs:
  - validate `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`
  - `vercel pull --environment=production`
  - validate required production env vars
  - `vercel build --prod`

This catches both code regressions and production configuration failures before merge. The release-readiness job uses real Vercel secrets only for trusted PRs from this repository and merge queue runs.

### Pre-deploy gate

Workflow: `.github/workflows/deploy-production.yml`

Runs on pushes to `main` and manual dispatch:

- Re-runs lint, typecheck, and Prisma validation
- Pulls the real production Vercel environment
- Fails if required production secrets are missing
- Builds the production artifact with `vercel build --prod`
- Applies Turso migrations only after the build succeeds
- Deploys the prebuilt artifact to Vercel

This separates release verification from the irreversible parts of release execution. The schema is no longer mutated before the build is proven valid.

### Nightly performance baseline

Workflow: `.github/workflows/nightly-performance.yml`

Runs nightly on schedule and on manual dispatch:

- `npm ci`
- `npm run test:perf`
- Publishes `test-results/performance/auth-latency-baseline.md`
- Publishes `test-results/performance/auth-latency-baseline.json`

This is intentionally separate from the merge gate. It tracks auth-path latency drift without making pull requests flaky on runner noise.

## Branch Protection

To make the workflows enforceable, configure GitHub branch protection for `main`:

- Require pull requests before merge
- Require status checks:
  - `Quality Gate`
  - `E2E`
  - `Release Readiness`
  - `Dependency Review`
- Block direct pushes to `main`
- Require the branch to be up to date before merging

If you use GitHub Environments for production, add required reviewers there as a second release control.

## Current Coverage

### Automated today

- Static analysis: ESLint
- Type safety: TypeScript compiler
- Unit tests: native Node test runner covering auth/security helpers, session helpers, passkey helpers, OIDC lifecycle helpers, front-channel/logout helpers, SAML controls, signature/certificate diagnostics, trace helpers, compliance helpers, claims diff helpers, SCIM helpers, repository helpers, and validator branches
- Integration tests: disposable SQLite-backed route and repository flows for auth token lifecycle, registration, invite acceptance, join requests, OIDC callbacks, SAML callbacks, MFA TOTP setup/disable, passkey registration/login management, password reset, admin routes, Phase 1 through 4 OIDC routes, front-channel logout handling, and SCIM mock routes
- Security regression tests: disposable SQLite-backed auth abuse coverage for generic registration/login/recovery responses, brute-force rate limiting, MFA lockout, and expired passkey challenge handling
- Nightly performance baselines: in-process route benchmarks for register, password login, invalid-password login, password reset request, and verification resend flows with avg/p95 budgets and artifact reports
- End-to-end tests: Playwright browser journeys for registration, email verification, login, MFA setup/disable, passkey enrollment/login/removal, password reset, invite acceptance, team join requests, team slug auto-generation, profile management, app lifecycle, client credentials, token exchange, SCIM provisioning, protocol inspectors, admin user management, admin access control, and responsive smoke checks across mobile/tablet/desktop
- Schema validation: Prisma
- Build verification: Next.js webpack production build
- Dependency risk review: GitHub dependency review
- Deployment readiness: Vercel env validation and prebuilt artifact generation

### E2E Harness Notes

- `npm run test:e2e` builds and serves the app in production mode before running Playwright
- The browser suite stays on `localhost` so WebAuthn/passkey coverage remains valid
- Do not run E2E and `npm run build:ci` in parallel locally because they can contend on `.next/lock`
- Current browser coverage includes the mobile-safe table layout and clearer teams access/join-request workflow semantics
- The newest front-channel logout and SAML trust-diagnostics additions are currently covered primarily by unit/integration/build gates rather than dedicated browser scenarios

### Not yet automated in this repository

- High-concurrency load testing for auth flows under realistic parallel traffic
- Long-term trend alerting against persisted nightly latency history
