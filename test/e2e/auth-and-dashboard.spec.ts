import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { sealData } from "iron-session";
import { authenticator } from "otplib";
import { deriveScimBearerToken } from "../../src/lib/scim";
import {
  addTeamMember,
  countProfileImages,
  countCredentials,
  createAuthRunEventRecord,
  createAuthRunRecord,
  createEmailVerifyToken,
  createInviteToken,
  createOidcApp,
  createSamlApp,
  createPasswordResetToken,
  createTeam,
  createUserWithPersonalTeam,
  findAppBySlug,
  findUserByEmail,
  hasTeamMembership,
  listJoinRequestsForUser,
  resetDatabase,
  updateAuthRunRecord,
} from "./helpers/db";

async function loginViaUi(
  page: Page,
  email: string,
  password: string,
  destination = "/",
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(destination);
  if (destination === "/") {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  }
}

async function authenticatePage(
  page: Page,
  session: {
    userId: string;
    email: string;
    name: string;
    isSystemAdmin: boolean;
    mustChangePassword: boolean;
    isVerified: boolean;
    mfaEnabled: boolean;
    activeTeamId: string;
  },
) {
  const sessionPassword = process.env.SESSION_PASSWORD;
  if (!sessionPassword) {
    throw new Error("SESSION_PASSWORD is required for E2E session seeding");
  }

  const cookieValue = await sealData(
    {
      ...session,
      lastActivityAt: Date.now(),
    },
    { password: sessionPassword },
  );

  await page.context().addCookies([
    {
      name: "authlab_user",
      value: cookieValue,
      url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function authenticateAppRun(
  page: Page,
  session: {
    slug: string;
    runId: string;
    protocol: "OIDC" | "SAML";
    authenticatedAt: string;
  },
) {
  const sessionPassword = process.env.SESSION_PASSWORD;
  if (!sessionPassword) {
    throw new Error("SESSION_PASSWORD is required for E2E app-run session seeding");
  }

  const cookieValue = await sealData(
    {
      runId: session.runId,
      appSlug: session.slug,
      protocol: session.protocol,
      authenticatedAt: session.authenticatedAt,
    },
    { password: sessionPassword },
  );

  await page.context().addCookies([
    {
      name: `authlab_${session.slug}`,
      value: cookieValue,
      url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function logoutViaApi(page: Page) {
  await page.request.post("/api/user/logout");
  await page.context().clearCookies();
}

async function createAvatarFile(testInfo: TestInfo) {
  const filePath = testInfo.outputPath("avatar.png");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP8z8AARAAA//8DAF0BB6nN0dgAAAAASUVORK5CYII=",
    "base64",
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, png);
  return filePath;
}

async function waitForUserByEmail(email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const user = await findUserByEmail(email);
    if (user) {
      return user;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for user ${email}`);
}

async function waitForAppBySlug(slug: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const app = await findAppBySlug(slug);
    if (app) {
      return app;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for app ${slug}`);
}

async function setupVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  return {
    async dispose() {
      try {
        await client.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
        await client.send("WebAuthn.disable");
      } catch {
        // Ignore teardown races after Playwright closes the page on timeout/failure.
      }
    },
  };
}

let e2eClientIpCounter = 1;

test.describe("e2e: auth and dashboard journeys", () => {
  test.beforeEach(async ({ page }) => {
    await resetDatabase();
    await page.context().setExtraHTTPHeaders({
      "x-forwarded-for": `10.0.0.${e2eClientIpCounter}`,
    });
    e2eClientIpCounter += 1;
  });

  test("registers, verifies email, and signs in", async ({ page }) => {
    const email = `e2e-register-${randomUUID()}@example.com`;
    const password = "Passw0rd!123";
    const verifyToken = `verify-${randomUUID()}`;

    await page.goto("/register");
    await page.getByLabel("Name").fill("E2E Register User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm Password").fill(password);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(
      page.getByText(
        "If an account can be created, a verification email has been sent.",
      ),
    ).toBeVisible();

    const user = await waitForUserByEmail(email);
    await createEmailVerifyToken(user.id, verifyToken);

    await page.goto(`/verify-email?token=${verifyToken}`);
    await expect(
      page.getByText("Email verified. You can now sign in."),
    ).toBeVisible();
    await expect(page.getByText("Verification complete.")).toBeVisible();

    const verifiedUser = await findUserByEmail(email);
    expect(verifiedUser?.isVerified).toBe(true);

    await loginViaUi(page, email, password);
  });

  test("blocks direct team creation for non-admins and submits join requests", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-teams-${randomUUID()}@example.com`,
      name: "E2E Teams User",
    });

    const teamOne = await createTeam({
      name: "Directory Alpha",
      slug: "directory-alpha",
    });
    const teamTwo = await createTeam({
      name: "Directory Beta",
      slug: "directory-beta",
    });

    await loginViaUi(page, seeded.user.email, seeded.password);

    await page.goto("/teams/new");
    await expect(
      page.getByRole("heading", { name: "Team Creation Restricted" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Go to Teams" }).click();
    await expect(page).toHaveURL("/teams");

    const teamOneRow = page.getByTestId(`team-card-${teamOne.slug}`);
    const teamTwoRow = page.getByTestId(`team-card-${teamTwo.slug}`);

    await teamOneRow.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByText("Join request submitted")).toBeVisible();
    await expect(teamOneRow.getByRole("button", { name: "Request pending" })).toBeVisible();

    await teamTwoRow.getByRole("button", { name: "Request access" }).click();
    await expect(page.getByText("Join request submitted")).toBeVisible();
    await expect(teamTwoRow.getByRole("button", { name: "Request pending" })).toBeVisible();

    const requests = await listJoinRequestsForUser(seeded.user.id);
    expect(requests).toHaveLength(2);
    expect(requests.map((request: { teamId: string }) => request.teamId)).toEqual([
      teamOne.id,
      teamTwo.id,
    ]);
  });

  test("auto-generates and recovers the slug while creating teams as an admin", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-team-admin-${randomUUID()}@example.com`,
      name: "E2E Team Admin",
      isSystemAdmin: true,
    });

    await loginViaUi(page, seeded.user.email, seeded.password);
    await page.goto("/teams");

    await page.getByRole("button", { name: "Create team" }).click();
    await page.getByLabel("Name").fill("Operations Lab");
    await expect(page.getByLabel("Slug")).toHaveValue("operations-lab");

    await page.getByLabel("Slug").fill("ops");
    await expect(page.getByLabel("Slug")).toHaveValue("ops");

    await page.getByLabel("Slug").fill("");
    await page.getByLabel("Name").fill("Operations Lab Europe");
    await expect(page.getByLabel("Slug")).toHaveValue("operations-lab-europe");
  });

  test("manages profile details, avatar, and password", async ({ page }, testInfo) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-profile-${randomUUID()}@example.com`,
      name: "E2E Profile User",
    });
    const updatedEmail = `e2e-profile-updated-${randomUUID()}@example.com`;
    const updatedPassword = "NewPassw0rd!456";

    await loginViaUi(page, seeded.user.email, seeded.password);
    await page.goto("/settings");

    const avatarFile = await createAvatarFile(testInfo);
    await page.getByLabel("Upload Profile Image").setInputFiles(avatarFile);
    await expect(page.getByText("Profile image updated")).toBeVisible();
    expect(await countProfileImages(seeded.user.id)).toBe(1);

    await expect(page.getByRole("img", { name: "Profile", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Remove Image" }).click();
    await expect(page.getByText("Profile image removed")).toBeVisible();
    expect(await countProfileImages(seeded.user.id)).toBe(0);

    await page.getByLabel("Name").fill("E2E Profile Updated");
    await page.getByLabel("Email").fill(updatedEmail);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Profile updated", { exact: true })).toBeVisible();

    const updatedUser = await findUserByEmail(updatedEmail);
    expect(updatedUser?.name).toBe("E2E Profile Updated");

    await page.getByLabel("Current Password", { exact: true }).fill(seeded.password);
    await page.getByLabel("New Password", { exact: true }).fill(updatedPassword);
    await page.getByLabel("Confirm New Password", { exact: true }).fill(updatedPassword);
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.getByText("Password updated", { exact: true })).toBeVisible();

    await logoutViaApi(page);
    await page.goto("/login");
    await expect(page).toHaveURL("/login");

    await loginViaUi(page, updatedEmail, updatedPassword);
  });

  test("creates, edits, and deletes an OIDC app", async ({ page }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-apps-${randomUUID()}@example.com`,
      name: "E2E Apps User",
    });
    const initialName = "E2E OIDC App";
    const updatedName = "E2E OIDC App Updated";
    const slug = `e2e-oidc-${randomUUID().slice(0, 8)}`;

    await loginViaUi(page, seeded.user.email, seeded.password);

    await page.goto("/apps/new");
    await page.getByRole("button", { name: /OpenID Connect/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("App Name").fill(initialName);
    await page.getByLabel("URL Slug").fill(slug);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Issuer URL").fill("https://example.com");
    await page.getByLabel("Client ID").fill("client-123");
    await page.getByLabel("Client Secret").fill("secret-123");
    await page.getByLabel("PKCE Mode").selectOption("PLAIN");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Create App Instance" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId(`app-card-${slug}`)).toContainText(initialName);

    const createdApp = await waitForAppBySlug(slug);
    expect(createdApp.clientSecret).not.toBe("secret-123");
    expect(createdApp.pkceMode).toBe("PLAIN");

    await page
      .getByTestId(`app-card-${slug}`)
      .getByRole("link", { name: "Test" })
      .click();
    await expect(page).toHaveURL(`/test/${slug}`);
    await expect(page.getByRole("heading", { name: initialName })).toBeVisible();

    await page.goto("/");
    await page
      .getByTestId(`app-card-${slug}`)
      .getByRole("link", { name: "Edit" })
      .click();
    await page.getByLabel("App Name").fill(updatedName);
    await page.getByLabel("PKCE Mode").selectOption("NONE");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId(`app-card-${slug}`)).toContainText(updatedName);

    const updatedApp = await findAppBySlug(slug);
    expect(updatedApp?.name).toBe(updatedName);
    expect(updatedApp?.pkceMode).toBe("NONE");

    await page
      .getByTestId(`app-card-${slug}`)
      .getByRole("button", { name: "Delete" })
      .click();
    await page
      .getByRole("dialog", { name: "Delete app" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByTestId(`app-card-${slug}`)).toHaveCount(0);
    expect(await findAppBySlug(slug)).toBeNull();
  });

  test("creates a SAML app with generated test signing material", async ({ page }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-saml-${randomUUID()}@example.com`,
      name: "E2E SAML User",
    });
    const name = "E2E SAML App";
    const slug = `e2e-saml-${randomUUID().slice(0, 8)}`;

    await loginViaUi(page, seeded.user.email, seeded.password);

    await page.goto("/apps/new");
    await page.getByRole("button", { name: /SAML 2.0/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("App Name").fill(name);
    await page.getByLabel("URL Slug").fill(slug);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("SSO Entry Point URL").fill("https://idp.example.com/sso/saml");
    await page.getByLabel("Issuer (SP Entity ID)").fill("https://authlab.example.com/sp");
    await page.getByText("Advanced SAML defaults").click();
    await page
      .getByLabel("Requested AuthnContextClassRef")
      .fill("urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport");
    await page.getByLabel("Signature algorithm").selectOption("SHA1");
    await page.getByLabel("Clock skew tolerance (seconds)").fill("120");
    await page.getByRole("button", { name: "Generate Test Keypair" }).click();
    await expect(page.getByText("SHA-256 Fingerprint")).toBeVisible();
    await page.getByRole("button", { name: "Generate Encryption Keypair" }).click();

    const signingCertField = page.getByLabel("SP Signing Certificate");
    const encryptionCertField = page.getByLabel("SP Encryption Certificate");

    await expect(signingCertField).toHaveValue(/BEGIN CERTIFICATE/);
    await expect(encryptionCertField).toHaveValue(/BEGIN CERTIFICATE/);

    const generatedCert = await signingCertField.inputValue();

    await page.getByLabel("IdP Certificate (PEM)").fill(generatedCert);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create App Instance" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText(name)).toBeVisible();

    const createdApp = await waitForAppBySlug(slug);
    expect(createdApp?.signAuthnRequests).toBe(true);
    expect(createdApp?.hasSpSigningPrivateKey).toBe(true);
    expect(createdApp?.hasSpSigningCert).toBe(true);
    expect(createdApp?.hasSpEncryptionPrivateKey).toBe(true);
    expect(createdApp?.hasSpEncryptionCert).toBe(true);
    expect(createdApp?.requestedAuthnContext).toBe(
      "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
    );
    expect(createdApp?.samlSignatureAlgorithm).toBe("SHA1");
    expect(createdApp?.clockSkewToleranceSeconds).toBe(120);
  });

  test("shows SCIM provisioning details on the authenticated app page and accepts SCIM writes", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-scim-${randomUUID()}@example.com`,
      name: "E2E SCIM User",
    });
    const app = await createOidcApp({
      teamId: seeded.team.id,
      name: "SCIM App",
      slug: `scim-${randomUUID().slice(0, 8)}`,
    });

    await authenticatePage(page, {
      userId: seeded.user.id,
      email: seeded.user.email,
      name: seeded.user.name,
      isSystemAdmin: false,
      mustChangePassword: false,
      isVerified: true,
      mfaEnabled: false,
      activeTeamId: seeded.team.id,
    });

    await page.goto(`/apps/${app.id}`);
    await expect(page.getByText("SCIM mock provisioning")).toBeVisible();
    await expect(page.getByText("/api/scim/")).toBeVisible();

    const response = await page.request.post(`/api/scim/${app.slug}/Users`, {
      headers: {
        authorization: `Bearer ${deriveScimBearerToken(app.id)}`,
        "content-type": "application/json",
      },
      data: {
        userName: "provisioned@example.com",
        active: true,
      },
    });
    expect(response.status()).toBe(201);

    await page.reload();
    await expect(page.getByText("provisioned@example.com", { exact: true })).toBeVisible();
    await expect(page.getByText("Recent SCIM requests")).toBeVisible();
    await expect(page.getByText("POST /api/scim/")).toBeVisible();
  });

  test("blocks non-admin access to admin pages", async ({ page }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-admin-${randomUUID()}@example.com`,
      name: "E2E Admin Guard User",
    });

    await loginViaUi(page, seeded.user.email, seeded.password);

    await page.goto("/admin/users");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto("/admin/settings");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("handles MFA setup, passkey enrollment, and passkey login with MFA", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-mfa-${randomUUID()}@example.com`,
      name: "E2E MFA User",
    });

    const authenticatorDevice = await setupVirtualAuthenticator(page);

    try {
      await loginViaUi(page, seeded.user.email, seeded.password);
      await page.goto("/settings");

      const mfaCard = page.getByTestId("mfa-card");
      await mfaCard.getByRole("button", { name: "Start MFA Setup" }).click();
      const manualKey = await mfaCard.getByLabel("Manual Key").inputValue();
      const setupCode = authenticator.generate(manualKey);
      await mfaCard.getByLabel("Verification Code").fill(setupCode);
      await mfaCard.getByRole("button", { name: "Enable MFA" }).click();
      await expect(page.getByText("MFA enabled", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Add Passkey" }).click();
      await expect(page.getByText("Passkey added", { exact: true })).toBeVisible();
      expect(await countCredentials(seeded.user.id)).toBe(1);

      await logoutViaApi(page);
      await page.goto("/login");
      await expect(page).toHaveURL("/login");

      await page.getByLabel("Email").fill(seeded.user.email);
      await page.getByRole("button", { name: "Sign In With Passkey" }).click();
      await expect(
        page.getByText("Passkey accepted. Enter your 6-digit authenticator code."),
      ).toBeVisible();
      await page
        .getByLabel("Authenticator Code", { exact: true })
        .fill(authenticator.generate(manualKey));
      await page.getByRole("button", { name: "Verify Code" }).click();
      await expect(page).toHaveURL("/");

      await page.goto("/settings");
      const passkeysCard = page.getByTestId("passkeys-card");
      await passkeysCard.getByRole("button", { name: "Remove" }).click();
      await expect(page.getByText("Passkey removed", { exact: true })).toBeVisible();
      expect(await countCredentials(seeded.user.id)).toBe(0);

      await mfaCard.locator('input[type="password"]').fill(seeded.password);
      await mfaCard
        .getByLabel("Authenticator Code", { exact: true })
        .fill(authenticator.generate(manualKey));
      await mfaCard.getByRole("button", { name: "Disable MFA" }).click();
      await expect(page.getByText("MFA disabled", { exact: true })).toBeVisible();
    } finally {
      await authenticatorDevice.dispose();
    }
  });

  test("requests and completes password reset", async ({ page }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-reset-${randomUUID()}@example.com`,
      name: "E2E Reset User",
    });
    const resetToken = `reset-${randomUUID()}`;
    const updatedPassword = "ResetPassw0rd!789";

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(seeded.user.email);
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(
      page.getByText(
        "If an account exists, a password reset email has been sent.",
        { exact: true },
      ),
    ).toBeVisible();

    await createPasswordResetToken(seeded.user.id, resetToken);

    await page.goto(`/reset-password?token=${resetToken}`);
    await page.getByLabel("New Password", { exact: true }).fill(updatedPassword);
    await page.getByLabel("Confirm Password", { exact: true }).fill(updatedPassword);
    await page.getByRole("button", { name: "Reset Password" }).click();
    await expect(
      page.getByText("Password updated. You can now sign in.", { exact: true }),
    ).toBeVisible();

    await loginViaUi(page, seeded.user.email, updatedPassword);
  });

  test("accepts team invitations after redirecting through login", async ({ page }) => {
    const invitedUser = await createUserWithPersonalTeam({
      email: `e2e-invite-${randomUUID()}@example.com`,
      name: "E2E Invite User",
    });
    const inviter = await createUserWithPersonalTeam({
      email: `e2e-inviter-${randomUUID()}@example.com`,
      name: "E2E Inviter User",
      isSystemAdmin: true,
    });
    const team = await createTeam({
      name: "Invite Team",
      slug: `invite-team-${randomUUID().slice(0, 8)}`,
    });
    await addTeamMember(team.id, inviter.user.id, "OWNER");

    const invite = await createInviteToken({
      token: `invite-${randomUUID()}`,
      email: invitedUser.user.email,
      teamId: team.id,
      invitedById: inviter.user.id,
      role: "ADMIN",
    });

    await page.goto(`/invite/${invite.token}`);
    await expect(page).toHaveURL(`/login?redirect=/invite/${invite.token}`);

    await page.getByLabel("Email").fill(invitedUser.user.email);
    await page.getByLabel("Password", { exact: true }).fill(invitedUser.password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page).toHaveURL(`/invite/${invite.token}`);

    await expect(page.getByRole("heading", { name: "Team Invitation" })).toBeVisible();
    await page.getByRole("button", { name: "Accept Invitation" }).click();
    await expect(
      page.getByRole("heading", { name: `You've joined ${team.name}` }),
    ).toBeVisible();
    expect(await hasTeamMembership(invitedUser.user.id, team.id)).toBe(true);

    await page.getByRole("button", { name: "Go to Dashboard" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Active team")).toBeVisible();
    await expect(
      page.locator("main").getByText(team.name, { exact: true }).first(),
    ).toBeVisible();
  });

  test("shows lifecycle diagnostics and actions for a seeded OIDC auth run", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-lifecycle-${randomUUID()}@example.com`,
      name: "E2E Lifecycle User",
    });
    const app = await createOidcApp({
      teamId: seeded.team.id,
      name: "Lifecycle App",
      slug: `lifecycle-${randomUUID().slice(0, 8)}`,
      pkceMode: "S256",
    });
    const run = await createAuthRunRecord({
      appInstanceId: app.id,
      protocol: "OIDC",
      grantType: "AUTHORIZATION_CODE",
      claims: {
        sub: "user-123",
        email: seeded.user.email,
        acr: "urn:authlab:mfa",
        amr: ["pwd", "mfa"],
      },
      idToken: "id-token",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      rawTokenResponse: JSON.stringify({ access_token: "access-token" }),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await createAuthRunEventRecord({
      authRunId: run.id,
      type: "AUTHORIZATION_STARTED",
      request: {
        method: "GET",
        endpoint: "https://issuer.example.com/oauth2/v1/authorize",
      },
      response: JSON.stringify({
        redirectUrl: "https://issuer.example.com/oauth2/v1/authorize?client_id=test-client",
      }),
    });
    await createAuthRunEventRecord({
      authRunId: run.id,
      type: "AUTHENTICATED",
      request: { grant_type: "authorization_code" },
      metadata: { nonceStatus: "valid" },
    });
    await authenticateAppRun(page, {
      slug: app.slug,
      runId: run.id,
      protocol: "OIDC",
      authenticatedAt: new Date().toISOString(),
    });

    await page.route(`**/api/auth/token/introspect/${app.slug}`, async (route) => {
      await updateAuthRunRecord(run.id, {
        lastIntrospection: { active: true, scope: "openid profile email" },
      });
      await createAuthRunEventRecord({
        authRunId: run.id,
        type: "INTROSPECTED",
        request: { token_type_hint: "access_token" },
        response: JSON.stringify({ active: true, scope: "openid profile email" }),
        metadata: { active: true },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          introspection: { active: true, scope: "openid profile email" },
        }),
      });
    });
    await page.route(`**/api/auth/token/refresh/${app.slug}`, async (route) => {
      await updateAuthRunRecord(run.id, {
        accessToken: "refreshed-access-token",
        refreshToken: "rotated-refresh-token",
        rawTokenResponse: JSON.stringify({ access_token: "refreshed-access-token" }),
        accessTokenExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      });
      await createAuthRunEventRecord({
        authRunId: run.id,
        type: "REFRESHED",
        request: { grant_type: "refresh_token" },
        response: JSON.stringify({ access_token: "refreshed-access-token" }),
        metadata: { replacedRefreshToken: true },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run: { id: run.id } }),
      });
    });
    await page.route(`**/api/auth/token/revoke/${app.slug}`, async (route) => {
      const body = route.request().postDataJSON() as { target?: string };
      if (body.target === "refresh_token") {
        await updateAuthRunRecord(run.id, {
          refreshToken: null,
          lastRevocationAt: new Date().toISOString(),
        });
      }
      await createAuthRunEventRecord({
        authRunId: run.id,
        type: "REVOKED",
        request: { token_type_hint: body.target ?? "access_token" },
        metadata: { target: body.target ?? "access_token" },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          revoked: true,
          refreshTokenCleared: body.target === "refresh_token",
        }),
      });
    });

    await page.goto(`/test/${app.slug}/inspector`);
    await expect(page.getByText("Token timeline")).toBeVisible();
    await expect(page.getByText("Auth context")).toBeVisible();
    await expect(page.getByText("urn:authlab:mfa")).toBeVisible();
    await expect(page.getByText("mfa", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh Tokens" })).toBeVisible();
    await expect(page.getByText("Stored", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Trace" }).click();
    await expect(page.getByText("Protocol trace")).toBeVisible();
    await expect(page.getByText("Authorization request")).toBeVisible();
    await expect(page.getByText("Token exchange")).toBeVisible();
    await page.getByRole("button", { name: "Lifecycle" }).click();

    await page.getByRole("button", { name: "Introspect Access Token" }).click();
    await expect(
      page.getByRole("cell", { name: "openid profile email" }).first(),
    ).toBeVisible();
    await expect(page.getByText("INTROSPECTED", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Refresh Tokens" }).click();
    await expect(page.getByText("REFRESHED", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Rotation observed")).toBeVisible();

    await page.getByRole("button", { name: "Revoke Refresh Token" }).click();
    await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
    await expect(page.getByText("REVOKED", { exact: true }).first()).toBeVisible();
  });

  test("compares claims between persisted runs in the inspector", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-claims-diff-${randomUUID()}@example.com`,
      name: "E2E Claims Diff User",
    });
    const app = await createOidcApp({
      teamId: seeded.team.id,
      name: "Claims Diff App",
      slug: `claims-diff-${randomUUID().slice(0, 8)}`,
    });
    const baselineRun = await createAuthRunRecord({
      appInstanceId: app.id,
      protocol: "OIDC",
      claims: {
        sub: "user-123",
        email: "baseline@example.com",
        role: "member",
      },
      idToken: "baseline-id-token",
      accessToken: "baseline-access-token",
      rawTokenResponse: JSON.stringify({ access_token: "baseline-access-token" }),
    });
    const currentRun = await createAuthRunRecord({
      appInstanceId: app.id,
      protocol: "OIDC",
      claims: {
        sub: "user-123",
        email: "current@example.com",
        groups: ["engineering"],
      },
      idToken: "current-id-token",
      accessToken: "current-access-token",
      rawTokenResponse: JSON.stringify({ access_token: "current-access-token" }),
    });

    await authenticateAppRun(page, {
      slug: app.slug,
      runId: currentRun.id,
      protocol: "OIDC",
      authenticatedAt: new Date().toISOString(),
    });

    await page.goto(`/test/${app.slug}/inspector?compare=${baselineRun.id}`);
    await page.getByRole("button", { name: "Claims Diff" }).click();

    await expect(page.getByText("Compare runs")).toBeVisible();
    await expect(page.getByText("1 changed")).toBeVisible();
    await expect(page.getByText("1 added")).toBeVisible();
    await expect(page.getByText("1 removed")).toBeVisible();
    await expect(page.getByRole("cell", { name: "email" })).toBeVisible();
    await expect(page.getByText("current@example.com")).toBeVisible();
    await expect(page.getByText("baseline@example.com")).toBeVisible();
    await expect(page.getByRole("cell", { name: "groups" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "role" })).toBeVisible();
  });

  test("launches the client credentials path from the OIDC workbench", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-client-creds-${randomUUID()}@example.com`,
      name: "E2E Client Credentials User",
    });
    const app = await createOidcApp({
      teamId: seeded.team.id,
      name: "Client Credentials App",
      slug: `client-creds-${randomUUID().slice(0, 8)}`,
    });
    const run = await createAuthRunRecord({
      appInstanceId: app.id,
      protocol: "OIDC",
      grantType: "CLIENT_CREDENTIALS",
      accessToken: "m2m-access-token",
      rawTokenResponse: JSON.stringify({ access_token: "m2m-access-token" }),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await createAuthRunEventRecord({
      authRunId: run.id,
      type: "CLIENT_CREDENTIALS_ISSUED",
      request: { grant_type: "client_credentials" },
    });

    await page.route(`**/api/auth/token/client-credentials/${app.slug}`, async (route) => {
      await authenticateAppRun(page, {
        slug: app.slug,
        runId: run.id,
        protocol: "OIDC",
        authenticatedAt: new Date().toISOString(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100"}/test/${app.slug}/inspector`,
          runId: run.id,
        }),
      });
    });

    await page.goto(`/test/${app.slug}`);
    await page.getByLabel("Requested scopes").fill("api.read");
    await page.getByRole("button", { name: "Run Client Credentials" }).click();

    await expect(page).toHaveURL(`/test/${app.slug}/inspector`);
    await expect(page.getByText("M2M")).toBeVisible();
    await expect(
      page.getByText("CLIENT CREDENTIALS ISSUED", { exact: true }).first(),
    ).toBeVisible();
  });

  test("launches token exchange from the OIDC workbench", async ({ page }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-token-exchange-${randomUUID()}@example.com`,
      name: "E2E Token Exchange User",
    });
    const app = await createOidcApp({
      teamId: seeded.team.id,
      name: "Token Exchange App",
      slug: `token-exchange-${randomUUID().slice(0, 8)}`,
    });
    const sourceRun = await createAuthRunRecord({
      appInstanceId: app.id,
      protocol: "OIDC",
      grantType: "AUTHORIZATION_CODE",
      accessToken: "source-access-token",
      idToken: "source-id-token",
      rawTokenResponse: JSON.stringify({ access_token: "source-access-token" }),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const exchangedRun = await createAuthRunRecord({
      appInstanceId: app.id,
      protocol: "OIDC",
      grantType: "TOKEN_EXCHANGE",
      accessToken: "delegated-access-token",
      rawTokenResponse: JSON.stringify({ access_token: "delegated-access-token" }),
      accessTokenExpiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    });
    await createAuthRunEventRecord({
      authRunId: exchangedRun.id,
      type: "TOKEN_EXCHANGED",
      request: {
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token_source: "access_token",
      },
      response: JSON.stringify({ access_token: "delegated-access-token" }),
    });

    await authenticateAppRun(page, {
      slug: app.slug,
      runId: sourceRun.id,
      protocol: "OIDC",
      authenticatedAt: new Date().toISOString(),
    });

    await page.route(`**/api/auth/token/exchange/${app.slug}`, async (route) => {
      await authenticateAppRun(page, {
        slug: app.slug,
        runId: exchangedRun.id,
        protocol: "OIDC",
        authenticatedAt: new Date().toISOString(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100"}/test/${app.slug}/inspector`,
          runId: exchangedRun.id,
        }),
      });
    });

    await page.goto(`/test/${app.slug}`);
    await expect(page.getByText("Token exchange", { exact: true })).toBeVisible();
    await page.getByLabel("Audience").fill("api://orders");
    await page.getByLabel("Requested scopes").last().fill("orders.read");
    await page.getByRole("button", { name: "Run Token Exchange" }).click();

    await expect(page).toHaveURL(`/test/${app.slug}/inspector`);
    await expect(page.getByText("Token exchange completed")).toBeVisible();
    await expect(page.getByText("TOKEN EXCHANGED", { exact: true }).first()).toBeVisible();
  });

  test("shows a SAML-specific inspector instead of OIDC lifecycle tabs", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-saml-inspector-${randomUUID()}@example.com`,
      name: "E2E SAML Inspector User",
    });
    const app = await createSamlApp({
      teamId: seeded.team.id,
      name: "SAML Inspector App",
      slug: `saml-inspector-${randomUUID().slice(0, 8)}`,
      samlLogoutUrl: "https://idp.example.com/logout/saml",
    });
    const run = await createAuthRunRecord({
      appInstanceId: app.id,
      protocol: "SAML",
      outboundAuthParams: {
        forceAuthn: "true",
        isPassive: "false",
        nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        requestedAuthnContext:
          "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
        samlSignatureAlgorithm: "SHA256",
        clockSkewToleranceSeconds: "120",
      },
      claims: {
        NameID: seeded.user.email,
        NameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        department: "Engineering",
      },
      rawSamlResponseXml: `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  IssueInstant="2026-03-08T13:00:00Z"
  Destination="https://authlab.example.com/api/auth/callback/saml/sample-app"
  InResponseTo="_request123">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success" />
  </samlp:Status>
  <saml:Assertion IssueInstant="2026-03-08T13:00:01Z">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${seeded.user.email}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData
          NotOnOrAfter="2030-03-08T13:05:00Z"
          Recipient="https://authlab.example.com/api/auth/callback/saml/sample-app" />
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-03-08T12:55:00Z" NotOnOrAfter="2030-03-08T13:10:00Z">
      <saml:AudienceRestriction>
        <saml:Audience>https://authlab.example.com/sp</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement
      AuthnInstant="2026-03-08T13:00:01Z"
      SessionIndex="_session123">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="department" FriendlyName="Department">
        <saml:AttributeValue>Engineering</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`,
    });

    await authenticateAppRun(page, {
      slug: app.slug,
      runId: run.id,
      protocol: "SAML",
      authenticatedAt: new Date().toISOString(),
    });
    await createAuthRunEventRecord({
      authRunId: run.id,
      type: "AUTHORIZATION_STARTED",
      request: {
        method: "GET",
        endpoint: "https://idp.example.com/sso",
      },
      response: "<samlp:AuthnRequest />",
    });
    await createAuthRunEventRecord({
      authRunId: run.id,
      type: "AUTHENTICATED",
      request: {
        method: "POST",
        endpoint: "https://authlab.example.com/api/auth/callback/saml/sample-app",
      },
      response: `<?xml version="1.0" encoding="UTF-8"?><samlp:Response />`,
    });

    await page.goto(`/test/${app.slug}/inspector`);

    await expect(page.getByRole("button", { name: "Assertion" })).toBeVisible();
    await expect(page.getByText("Structured SAML assertion")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lifecycle" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "UserInfo" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Discovery" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Validation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "JWT Decoder" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Trace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Raw XML" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SAML SLO" })).toBeVisible();
    await expect(page.getByText("Assertion envelope")).toBeVisible();
    await expect(page.getByText("Requested policy")).toBeVisible();
    await expect(page.getByText("Authentication statement")).toBeVisible();
    await expect(page.getByText("Attribute statement")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Department", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Trace" }).click();
    await expect(page.getByText("AuthnRequest redirect")).toBeVisible();
    await expect(page.getByText("Assertion callback")).toBeVisible();
  });

  test("creates, updates, and deletes users from admin management", async ({ page }) => {
    const admin = await createUserWithPersonalTeam({
      email: `e2e-admin-mgr-${randomUUID()}@example.com`,
      name: "E2E Admin Manager",
      isSystemAdmin: true,
    });
    const team = await createTeam({
      name: "Admin Assignment Team",
      slug: `admin-assignment-${randomUUID().slice(0, 8)}`,
    });
    const managedEmail = `managed-${randomUUID()}@example.com`;

    await loginViaUi(page, admin.user.email, admin.password);
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    await page.getByRole("button", { name: "New user" }).click();
    const createDialog = page.getByRole("dialog", { name: "Create user" });
    await createDialog.getByLabel("Name", { exact: true }).fill("Managed User");
    await createDialog.getByLabel("Email", { exact: true }).fill(managedEmail);
    await createDialog.getByLabel("Temporary password").fill("TempPassw0rd!123");
    await page
      .getByRole("dialog", { name: "Create user" })
      .getByTestId(`team-assignment-${team.id}`)
      .locator('input[type="checkbox"]')
      .check();
    await page
      .getByRole("dialog", { name: "Create user" })
      .getByTestId(`team-assignment-${team.id}`)
      .locator("select")
      .selectOption("ADMIN");
    await createDialog.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByText("User created with temporary password", { exact: true }),
    ).toBeVisible();

    const createdUser = await waitForUserByEmail(managedEmail);
    expect(createdUser.mustChangePassword).toBe(true);
    expect(await hasTeamMembership(createdUser.id, team.id)).toBe(true);

    const userRow = page.getByTestId(`admin-user-row-${createdUser.id}`);
    await userRow.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit Managed User" });
    await editDialog.getByLabel("Name", { exact: true }).fill("Managed User Updated");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("User updated", { exact: true })).toBeVisible();
    const updatedUser = await waitForUserByEmail(managedEmail);
    expect(updatedUser.name).toBe("Managed User Updated");

    page.once("dialog", (dialog) => dialog.accept());
    await userRow.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("User deleted", { exact: true })).toBeVisible();
    expect(await findUserByEmail(managedEmail)).toBeNull();
  });

  test("keeps key public and protected pages usable across mobile, tablet, and desktop", async ({
    page,
  }) => {
    const seeded = await createUserWithPersonalTeam({
      email: `e2e-responsive-${randomUUID()}@example.com`,
      name: "E2E Responsive User",
    });

    const publicPages = [
      { path: "/login", heading: "Sign in" },
      { path: "/register", heading: "Create account" },
    ];
    const protectedPages = [
      { path: "/", heading: "Dashboard" },
      { path: "/teams", heading: "Teams" },
      { path: "/settings", heading: "Profile" },
      { path: "/apps/new", heading: "Create New App Instance" },
    ];
    const viewports = [
      { name: "mobile", width: 375, height: 812 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "desktop", width: 1440, height: 900 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of publicPages) {
        await page.goto(route.path);
        await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
      }
    }

    await authenticatePage(page, {
      userId: seeded.user.id,
      email: seeded.user.email,
      name: seeded.user.name,
      isSystemAdmin: seeded.user.isSystemAdmin,
      mustChangePassword: seeded.user.mustChangePassword,
      isVerified: seeded.user.isVerified,
      mfaEnabled: seeded.user.mfaEnabled,
      activeTeamId: seeded.team.id,
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of protectedPages) {
        await page.goto(route.path);
        await expect(
          page.getByRole("heading", { name: route.heading }).first(),
        ).toBeVisible();
        if (viewport.width < 1024) {
          await expect(
            page.getByRole("button", { name: "Open navigation" }),
          ).toBeVisible();
        }
      }
    }
  });
});
