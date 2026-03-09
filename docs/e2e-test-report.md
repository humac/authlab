# E2E Test Report

Date: 2026-03-08
Project: AuthLab
Branch under test: historical baseline report

## Status Note

This file is now an archival baseline from the earlier manual/browser-assisted run. The current source of truth is the Playwright suite in `test/e2e/auth-and-dashboard.spec.ts`, which now covers the broader Phase 1 through Phase 4 product surface.

Post-Phase-4 follow-up features such as OIDC front-channel logout handling, SAML signature detail inspection, certificate expiry diagnostics, and protocol compliance reporting are implemented in the product, but they are not part of the historical manual run captured below. Their regression coverage currently lives in the unit, integration, security, and build gates rather than in this archival report.

## Summary

- Journeys tested in this historical report: 5
- Responsive pass: 6 major pages across 3 viewports
- Screenshots captured: 54
- Issues found: 3
- Issues fixed during run: 0
- Remaining issues: 3

## Automation Status

The original manual/browser-assisted run documented in this report covered the first five dashboard journeys above. The repository Playwright suite now automates a broader set of flows in `test/e2e/auth-and-dashboard.spec.ts`, including:

- MFA (TOTP) setup and disable
- Passkey enrollment, login, and removal
- Password reset request and completion
- Invite acceptance after login redirect
- OIDC lifecycle diagnostics and actions
- Client credentials, token exchange, and protocol-specific inspector flows
- SCIM mock provisioning
- Team slug auto-generation recovery
- Responsive management tables without horizontal-scroll dependence
- Explicit team access and join-review state copy on the Teams page
- Admin user creation, update, and deletion
- Responsive smoke checks across mobile, tablet, and desktop

The suite is still supplemented by non-browser checks for newer inspector-only diagnostics:

- OIDC front-channel logout callback handling
- SAML signature structure analysis
- certificate health / expiry reporting
- protocol compliance summaries

## Environment and Setup

- Platform check: `Darwin` (supported)
- Frontend detected: Next.js app (`package.json` + App Router pages)
- Tooling:
  - Installed `agent-browser 0.16.3`
  - Installed browser dependencies via `agent-browser install --with-deps`
- DB sync performed before test run:
  - Command: `npx prisma db push`
  - Reason: local `dev.db` was behind current Prisma schema
- App start command:
  - `npm run dev`
  - URL: `http://localhost:3000`

## Phase 1 Research Output

### App Routes and User Journeys (high-level)

Primary user-facing routes tested in this run:
- `/login`
- `/register`
- `/`
- `/teams`
- `/settings`
- `/apps/new`
- `/apps/[id]`
- `/test/[slug]`
- `/admin/users` (access control check)
- `/admin/settings` (access control check)

User journeys executed:
1. Register -> verify email -> login -> dashboard
2. Team browsing + join request submission
3. Profile management (name/email/password/profile image)
4. App lifecycle (create OIDC app -> test page -> edit -> delete)
5. Non-admin access control for admin routes

### Database Layer Summary

Database: SQLite (`DATABASE_URL` in `.env.example` is `file:./dev.db`)

Key tables validated during run:
- `User`
- `Team`
- `TeamMember`
- `AuthToken`
- `TeamJoinRequest`
- `UserProfileImage`
- `AppInstance`

### Bug Hunt Summary (code + runtime)

Top findings:
1. CSP nonce hydration mismatch warnings (React hydration warning on multiple pages)
2. OIDC login route can throw 500 on discovery failure (no graceful user-facing handling)
3. Profile image UI requests a missing image route repeatedly and logs 404s when no image exists

## Journey Details

## Journey 1: Register + Verify Email + Login

Status: Completed

### Steps executed

1. Opened `/register`
2. Submitted new user:
   - Name: `E2E User`
   - Email: `e2e.profile.20260306@example.com`
   - Password: `Passw0rd!123`
3. Inserted test verification token row into `AuthToken` (hashed token) for deterministic verify flow
4. Opened `/verify-email?token=e2everify20260306token`
5. Confirmed user email verification success
6. Logged in via `/login`
7. Confirmed redirect to `/` dashboard

### Screenshots

- `e2e-screenshots/journey-01-auth/01-register-page.png`
- `e2e-screenshots/journey-01-auth/02-register-submitted.png`
- `e2e-screenshots/journey-01-auth/03-verify-email-success.png`
- `e2e-screenshots/journey-01-auth/04-login-page.png`
- `e2e-screenshots/journey-01-auth/05-login-success-dashboard.png`
- `e2e-screenshots/journey-01-auth/06-dashboard-landing.png`

### Database validation

Executed queries and observed results:

- User row created:

```sql
select id,email,name,isVerified,mfaEnabled,isSystemAdmin
from User
where email='e2e.profile.20260306@example.com';
```

Observed: user exists, `isVerified=0` before verification.

- Personal team created:

```sql
select id,name,slug,isPersonal
from Team
where slug like 'personal-%'
order by createdAt desc
limit 3;
```

Observed: personal workspace row for new user exists.

- Team membership created:

```sql
select tm.id,tm.teamId,tm.userId,tm.role
from TeamMember tm
join User u on u.id=tm.userId
where u.email='e2e.profile.20260306@example.com';
```

Observed: membership exists with `OWNER` role on personal team.

- Verification token lifecycle:

```sql
select id,purpose,usedAt
from AuthToken
where id='cmmeitestverifytoken1';
```

Observed: `usedAt` populated after `/verify-email`, confirming one-time token consumption.

## Journey 2: Teams Management Basics

Status: Completed

### Steps executed

1. Opened `/teams/new` as non-admin user
2. Confirmed team creation restricted (button to go to teams)
3. Opened `/teams`
4. Submitted join request to another team
5. Submitted a second join request to a second team

### Screenshots

- `e2e-screenshots/journey-02-teams/01-new-team-page.png`
- `e2e-screenshots/journey-02-teams/02-teams-page.png`
- `e2e-screenshots/journey-02-teams/03-request-join-submitted.png`
- `e2e-screenshots/journey-02-teams/04-second-request-join-submitted.png`

### Database validation

```sql
select jr.id,jr.teamId,jr.userId,jr.status,jr.role,jr.createdAt
from TeamJoinRequest jr
join User u on u.id=jr.userId
where u.email='e2e.profile.20260306@example.com'
order by jr.createdAt desc;
```

Observed: pending join request rows created as expected.

## Journey 3: Profile Flow (requested UI change focus)

Status: Completed

### Steps executed

1. Opened `/settings`
2. Opened user menu and verified text label `Profile` (not `Settings`)
3. Uploaded profile image via `Upload Profile Image`
4. Re-opened menu and verified avatar switched from initials to image
5. Removed profile image and verified fallback to initials
6. Updated profile:
   - Name: `E2E User Updated`
   - Email: `e2e.profile.updated.20260306@example.com`
7. Updated password from `Passw0rd!123` to `NewPassw0rd!456`
8. Signed out and signed in with the new password

### Screenshots

- `e2e-screenshots/journey-03-profile/01-profile-page.png`
- `e2e-screenshots/journey-03-profile/02-user-menu-profile-label.png`
- `e2e-screenshots/journey-03-profile/03-uploaded-profile-image.png`
- `e2e-screenshots/journey-03-profile/04-menu-avatar-with-image.png`
- `e2e-screenshots/journey-03-profile/05-profile-image-removed.png`
- `e2e-screenshots/journey-03-profile/06-profile-updated.png`
- `e2e-screenshots/journey-03-profile/07-password-updated.png`
- `e2e-screenshots/journey-03-profile/08-signed-out-login-page.png`
- `e2e-screenshots/journey-03-profile/09-login-with-new-password.png`

### Database validation

- Profile image persisted:

```sql
select upi.userId,upi.mimeType,upi.sizeBytes,length(upi.content) as contentBytes
from UserProfileImage upi
join User u on u.id=upi.userId
where u.email='e2e.profile.20260306@example.com';
```

Observed: image row exists after upload.

- Profile image removed:

```sql
select count(*)
from UserProfileImage upi
join User u on u.id=upi.userId
where u.email='e2e.profile.20260306@example.com';
```

Observed: `0` rows after remove.

- Name/email update persisted:

```sql
select email,name,isVerified
from User
where id='cmmeir9o20000g1idsux2jd5l';
```

Observed: email/name updated to new values.

## Journey 4: App Lifecycle (OIDC)

Status: Completed

### Steps executed

1. Opened `/apps/new`
2. Selected `OIDC`
3. Entered customization:
   - App Name: `E2E OIDC App`
   - Slug: `e2e-oidc-app-20260306`
4. Entered OIDC config:
   - Issuer URL: `https://example.com`
   - Client ID: `client-123`
   - Client Secret: `secret-123`
5. Created app instance
6. Opened test page `/test/e2e-oidc-app-20260306`
7. Attempted login route (`/test/e2e-oidc-app-20260306/login`) and captured error behavior
8. Edited app name to `E2E OIDC App Updated`
9. Deleted app via dashboard delete modal

### Screenshots

- `e2e-screenshots/journey-04-apps/01-app-create-page.png`
- `e2e-screenshots/journey-04-apps/02-oidc-config-step.png`
- `e2e-screenshots/journey-04-apps/03-oidc-provider-config-step.png`
- `e2e-screenshots/journey-04-apps/04-review-step.png`
- `e2e-screenshots/journey-04-apps/05-dashboard-after-create-app.png`
- `e2e-screenshots/journey-04-apps/06-test-page.png`
- `e2e-screenshots/journey-04-apps/07-oidc-login-attempt.png`
- `e2e-screenshots/journey-04-apps/08-oidc-login-route-result.png`
- `e2e-screenshots/journey-04-apps/09-back-dashboard-before-edit.png`
- `e2e-screenshots/journey-04-apps/10-edit-app-page.png`
- `e2e-screenshots/journey-04-apps/11-app-updated-dashboard.png`
- `e2e-screenshots/journey-04-apps/12-dashboard-after-app-update.png`
- `e2e-screenshots/journey-04-apps/13-dashboard-after-delete-attempt.png`
- `e2e-screenshots/journey-04-apps/14-app-deleted.png`

### Database validation

- App created:

```sql
select id,name,slug,protocol,teamId,issuerUrl,clientId,clientSecret,scopes
from AppInstance
where slug='e2e-oidc-app-20260306';
```

Observed: row exists with expected values and encrypted `clientSecret` format.

- App updated:

```sql
select id,name,slug,issuerUrl,clientId
from AppInstance
where id='cmmeix68y0007g1id90v387bf';
```

Observed: `name` updated to `E2E OIDC App Updated`.

- App deleted:

```sql
select count(*)
from AppInstance
where id='cmmeix68y0007g1id90v387bf' or slug='e2e-oidc-app-20260306';
```

Observed: `0` rows.

## Journey 5: Admin Access Behavior

Status: Completed

### Steps executed

1. As non-system-admin user, opened `/admin/users`
2. As non-system-admin user, opened `/admin/settings`
3. Verified redirect to `/` in both cases

### Screenshots

- `e2e-screenshots/journey-05-admin-access/01-admin-users-access-attempt.png`
- `e2e-screenshots/journey-05-admin-access/02-admin-settings-access-attempt.png`

### Validation

Access control behavior matches proxy/admin checks.

## Responsive Testing

Status: Completed

Viewports tested:
- Mobile: `375 x 812`
- Tablet: `768 x 1024`
- Desktop: `1440 x 900`

Pages tested per viewport:
- `/login`
- `/register`
- `/`
- `/teams`
- `/settings`
- `/apps/new`

Screenshot inventory (18 total):
- `e2e-screenshots/responsive/mobile-login.png`
- `e2e-screenshots/responsive/mobile-register.png`
- `e2e-screenshots/responsive/mobile-dashboard.png`
- `e2e-screenshots/responsive/mobile-teams.png`
- `e2e-screenshots/responsive/mobile-settings.png`
- `e2e-screenshots/responsive/mobile-apps-new.png`
- `e2e-screenshots/responsive/tablet-login.png`
- `e2e-screenshots/responsive/tablet-register.png`
- `e2e-screenshots/responsive/tablet-dashboard.png`
- `e2e-screenshots/responsive/tablet-teams.png`
- `e2e-screenshots/responsive/tablet-settings.png`
- `e2e-screenshots/responsive/tablet-apps-new.png`
- `e2e-screenshots/responsive/desktop-login.png`
- `e2e-screenshots/responsive/desktop-register.png`
- `e2e-screenshots/responsive/desktop-dashboard.png`
- `e2e-screenshots/responsive/desktop-teams.png`
- `e2e-screenshots/responsive/desktop-settings.png`
- `e2e-screenshots/responsive/desktop-apps-new.png`

## Issues and Findings

## 1) CSP Nonce Hydration Mismatch Warnings

- Severity: Medium
- Type: Runtime/UX noise (React hydration warnings)
- Evidence:
  - Console repeatedly shows hydration mismatch with `nonce` differing (`nonce="..."` server vs empty client attribute)
- Likely source:
  - [layout.tsx](/Users/huynguyen/Development/personal/git/humac/authlab/src/app/layout.tsx#L39)
  - [proxy.ts](/Users/huynguyen/Development/personal/git/humac/authlab/src/proxy.ts#L54)
- Status: Open

## 2) OIDC Login Route Returns 500 on Discovery Failure

- Severity: Medium
- Type: Error handling gap
- Evidence:
  - Dev logs show `TypeError: fetch failed` from OIDC discovery path during `/test/[slug]/login`
- Source:
  - [oidc-handler.ts](/Users/huynguyen/Development/personal/git/humac/authlab/src/lib/oidc-handler.ts#L67)
  - [test login route](/Users/huynguyen/Development/personal/git/humac/authlab/src/app/test/[slug]/login/route.ts#L29)
- Status: Open

## 3) Repeated 404 for Missing Profile Image

- Severity: Low
- Type: Noise/inefficiency
- Evidence:
  - Repeated `GET /api/user/profile-image?v=0 404` on settings page for users without image
- Source:
  - [settings/page.tsx](/Users/huynguyen/Development/personal/git/humac/authlab/src/app/(dashboard)/settings/page.tsx#L49)
- Status: Open

## Validation of Requested Change

Requested behavior:
- Rename `Settings` to `Profile`
- Replace initials avatar with uploaded profile picture when present

Validated:
- User menu shows `Profile` entry (screenshot: `journey-03-profile/02-user-menu-profile-label.png`)
- Avatar switches to uploaded image in menu and reverts on delete (screenshots: `journey-03-profile/04-menu-avatar-with-image.png`, `journey-03-profile/05-profile-image-removed.png`)
- DB confirms `UserProfileImage` row created and removed as expected

## Artifacts

- Screenshots directory: `e2e-screenshots/`
- Report file: `e2e-test-report.md`
