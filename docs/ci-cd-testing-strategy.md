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
- `npm run prisma:validate`
- `npm run build:ci`
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

## Branch Protection

To make the workflows enforceable, configure GitHub branch protection for `main`:

- Require pull requests before merge
- Require status checks:
  - `Quality Gate`
  - `Release Readiness`
  - `Dependency Review`
- Block direct pushes to `main`
- Require the branch to be up to date before merging

If you use GitHub Environments for production, add required reviewers there as a second release control.

## Current Coverage

### Automated today

- Static analysis: ESLint
- Type safety: TypeScript compiler
- Unit tests: native Node test runner with 107 passing tests across 26 suites covering auth/security helpers, session helpers, passkey helpers, metadata parsing, repository helpers, and validator branches
- Integration tests: disposable SQLite-backed route and repository flows for registration, invite acceptance, join requests, and auth token lifecycle
- Schema validation: Prisma
- Build verification: Next.js webpack production build
- Dependency risk review: GitHub dependency review
- Deployment readiness: Vercel env validation and prebuilt artifact generation

### Not yet automated in this repository

- Broader integration-style coverage for higher-coupling protocol/database flows such as OIDC, SAML, MFA, passkeys, password reset, and admin routes
- End-to-end browser tests for registration, verification, login, MFA, passkeys, password reset, invites, and admin settings
- Security regression tests for auth abuse cases
- Performance smoke tests for critical auth paths

## Next Additions

Add the following in order, and wire each suite into `ci.yml` as it becomes real:

1. Add `test:e2e` with Playwright for the auth and dashboard journeys already documented in `e2e-test-report.md`
2. Add nightly security/performance jobs for abuse cases and latency baselines

Each new suite should become a required status check before merge once it is stable and non-flaky.
