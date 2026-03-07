import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { sealData } from "iron-session";
import { authenticator } from "otplib";
import {
  addTeamMember,
  countProfileImages,
  countCredentials,
  createEmailVerifyToken,
  createInviteToken,
  createPasswordResetToken,
  createTeam,
  createUserWithPersonalTeam,
  findAppBySlug,
  findUserByEmail,
  hasTeamMembership,
  listJoinRequestsForUser,
  resetDatabase,
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

    await page
      .getByTestId(`team-card-${teamOne.slug}`)
      .getByRole("button", { name: "Request to Join" })
      .click();
    await expect(page.getByText("Join request submitted")).toBeVisible();

    await page
      .getByTestId(`team-card-${teamTwo.slug}`)
      .getByRole("button", { name: "Request to Join" })
      .click();
    await expect(page.getByText("Join request submitted")).toBeVisible();

    const requests = await listJoinRequestsForUser(seeded.user.id);
    expect(requests).toHaveLength(2);
    expect(requests.map((request: { teamId: string }) => request.teamId)).toEqual([
      teamOne.id,
      teamTwo.id,
    ]);
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

    await page.getByRole("button", { name: "Open user menu" }).click();
    await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
    await page.getByRole("link", { name: "Profile" }).click();

    const avatarFile = await createAvatarFile(testInfo);
    await page.getByLabel("Upload Profile Image").setInputFiles(avatarFile);
    await expect(page.getByText("Profile image updated")).toBeVisible();
    expect(await countProfileImages(seeded.user.id)).toBe(1);

    await page.getByRole("button", { name: "Open user menu" }).click();
    await expect(
      page.getByAltText(`${seeded.user.name} profile`),
    ).toBeVisible();
    await page.getByRole("heading", { name: "Profile" }).first().click();

    await page.getByRole("button", { name: "Remove Image" }).click();
    await expect(page.getByText("Profile image removed")).toBeVisible();
    expect(await countProfileImages(seeded.user.id)).toBe(0);

    await page.getByRole("button", { name: "Open user menu" }).click();
    await expect(
      page.getByAltText(`${seeded.user.name} profile`),
    ).toHaveCount(0);

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

    await page.getByRole("button", { name: "Open user menu" }).click();
    await page.getByRole("button", { name: "Sign Out" }).click();
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
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Create App Instance" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId(`app-card-${slug}`)).toContainText(initialName);

    const createdApp = await waitForAppBySlug(slug);
    expect(createdApp.clientSecret).not.toBe("secret-123");

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
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId(`app-card-${slug}`)).toContainText(updatedName);

    const updatedApp = await findAppBySlug(slug);
    expect(updatedApp?.name).toBe(updatedName);

    await page
      .getByTestId(`app-card-${slug}`)
      .getByRole("button", { name: `Delete ${updatedName}` })
      .click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByTestId(`app-card-${slug}`)).toHaveCount(0);
    expect(await findAppBySlug(slug)).toBeNull();
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

      await page.getByRole("button", { name: "Open user menu" }).click();
      await page.getByRole("button", { name: "Sign Out" }).click();
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
    await expect(page.getByText(`Active team: ${team.name}`)).toBeVisible();
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

    await page.getByLabel("Name", { exact: true }).fill("Managed User");
    await page.getByLabel("Email", { exact: true }).fill(managedEmail);
    await page.getByLabel("Temporary Password").fill("TempPassw0rd!123");
    await page
      .getByTestId(`team-assignment-${team.id}`)
      .locator('input[type="checkbox"]')
      .check();
    await page
      .getByTestId(`team-assignment-${team.id}`)
      .locator("select")
      .selectOption("ADMIN");
    await page.getByRole("button", { name: "Create User" }).click();
    await expect(
      page.getByText("User created with temporary password", { exact: true }),
    ).toBeVisible();

    const createdUser = await waitForUserByEmail(managedEmail);
    expect(createdUser.mustChangePassword).toBe(true);
    expect(await hasTeamMembership(createdUser.id, team.id)).toBe(true);

    const userRow = page.getByTestId(`admin-user-row-${createdUser.id}`);
    await userRow.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit User" });
    await editDialog.locator("input").first().fill("Managed User Updated");
    await page
      .getByRole("dialog", { name: "Edit User" })
      .getByRole("button", { name: "Save Changes" })
      .click();
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
