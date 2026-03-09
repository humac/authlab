/**
 * AuthLab — Mock Data Seed Script
 *
 * Generates realistic mock data for documentation screenshots.
 * Idempotent: can be run multiple times safely (clear-then-insert within transaction).
 *
 * Usage:
 *   npx tsx docs/_seed/seed.ts
 *
 * Prerequisites:
 *   - DATABASE_URL and MASTER_ENCRYPTION_KEY set in .env
 *   - `npx prisma db push` already run
 *
 * Test Accounts (all use password: Test1234!):
 *   - admin@example.com      — System Admin, owns "Platform Engineering" and "Identity Team"
 *   - alex.chen@example.com   — Admin of "Identity Team", member of "Platform Engineering"
 *   - maria.santos@example.com — Member of "Identity Team"
 *   - sam.rivera@example.com  — New user, unverified, no team
 *   - pat.morgan@example.com  — Inactive user, must change password
 */

import "dotenv/config";
import argon2 from "argon2";
import { createCipheriv, randomBytes, createHash } from "crypto";

// ---------------------------------------------------------------------------
// Prisma client bootstrap (matches src/lib/db.ts for local SQLite)
// ---------------------------------------------------------------------------
async function createPrisma() {
  const { PrismaClient } = await import(
    "../../src/generated/prisma/client/client.js"
  );
  const { PrismaBetterSqlite3 } = await import(
    "@prisma/adapter-better-sqlite3"
  );
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
  });
  return new PrismaClient({ adapter }) as any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ARGON2_OPTIONS = { type: argon2.argon2id, timeCost: 3, memoryCost: 19456, parallelism: 1 } as const;

async function hash(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

function encrypt(plaintext: string): string {
  const hex = process.env.MASTER_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("MASTER_ENCRYPTION_KEY required (64-char hex)");
  const key = Buffer.from(hex, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3_600_000);
}

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------
const PASSWORD = "Test1234!";

const USERS = [
  { email: "admin@example.com", name: "Jordan Taylor", isSystemAdmin: true, isVerified: true, mfaEnabled: true },
  { email: "alex.chen@example.com", name: "Alex Chen", isSystemAdmin: false, isVerified: true, mfaEnabled: false },
  { email: "maria.santos@example.com", name: "Maria Santos", isSystemAdmin: false, isVerified: true, mfaEnabled: false },
  { email: "sam.rivera@example.com", name: "Sam Rivera", isSystemAdmin: false, isVerified: false, mfaEnabled: false },
  { email: "pat.morgan@example.com", name: "Pat Morgan", isSystemAdmin: false, isVerified: true, mustChangePassword: true, mfaEnabled: false },
] as const;

const TEAMS = [
  { name: "Platform Engineering", slug: "platform-eng", isPersonal: false },
  { name: "Identity Team", slug: "identity-team", isPersonal: false },
  { name: "Jordan's Workspace", slug: "jordan-workspace", isPersonal: true },
  { name: "Alex's Workspace", slug: "alex-workspace", isPersonal: true },
  { name: "Maria's Workspace", slug: "maria-workspace", isPersonal: true },
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------
async function seed() {
  const prisma = await createPrisma();

  console.log("Seeding AuthLab mock data...\n");

  // --- Clear in reverse dependency order ---
  console.log("  Clearing existing data...");
  await prisma.scimRequestLog.deleteMany({});
  await prisma.scimResource.deleteMany({});
  await prisma.authRunEvent.deleteMany({});
  await prisma.authRun.deleteMany({});
  await prisma.appInstance.deleteMany({});
  await prisma.inviteToken.deleteMany({});
  await prisma.teamJoinRequest.deleteMany({});
  await prisma.teamMember.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.authToken.deleteMany({});
  await prisma.credential.deleteMany({});
  await prisma.userProfileImage.deleteMany({});
  await prisma.user.deleteMany({});
  // Clear system settings but preserve email provider if configured
  // await prisma.systemSetting.deleteMany({});

  // --- Hash password once ---
  const passwordHash = await hash(PASSWORD);
  console.log("  Password hash generated (Argon2id)");

  // --- Create users ---
  console.log("  Creating users...");
  const userRecords: Record<string, any> = {};
  for (const u of USERS) {
    const record = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        isSystemAdmin: u.isSystemAdmin,
        isVerified: u.isVerified,
        mfaEnabled: u.mfaEnabled,
        mustChangePassword: "mustChangePassword" in u ? (u as any).mustChangePassword : false,
        // For MFA-enabled admin, store an encrypted dummy TOTP secret
        ...(u.mfaEnabled ? { totpSecretEnc: encrypt("JBSWY3DPEHPK3PXP"), totpEnabledAt: daysAgo(30) } : {}),
      },
    });
    userRecords[u.email] = record;
    console.log(`    ✓ ${u.name} <${u.email}>${u.isSystemAdmin ? " [SYS ADMIN]" : ""}${u.mfaEnabled ? " [MFA]" : ""}${"mustChangePassword" in u ? " [RESET]" : ""}${!u.isVerified ? " [UNVERIFIED]" : ""}`);
  }

  // --- Create teams ---
  console.log("\n  Creating teams...");
  const teamRecords: Record<string, any> = {};
  for (const t of TEAMS) {
    const record = await prisma.team.create({
      data: { name: t.name, slug: t.slug, isPersonal: t.isPersonal },
    });
    teamRecords[t.slug] = record;
    console.log(`    ✓ ${t.name} (${t.slug})${t.isPersonal ? " [personal]" : ""}`);
  }

  // --- Create team memberships ---
  console.log("\n  Creating team memberships...");
  const memberships = [
    // Platform Engineering
    { user: "admin@example.com", team: "platform-eng", role: "OWNER" },
    { user: "alex.chen@example.com", team: "platform-eng", role: "MEMBER" },
    // Identity Team
    { user: "admin@example.com", team: "identity-team", role: "OWNER" },
    { user: "alex.chen@example.com", team: "identity-team", role: "ADMIN" },
    { user: "maria.santos@example.com", team: "identity-team", role: "MEMBER" },
    // Personal workspaces
    { user: "admin@example.com", team: "jordan-workspace", role: "OWNER" },
    { user: "alex.chen@example.com", team: "alex-workspace", role: "OWNER" },
    { user: "maria.santos@example.com", team: "maria-workspace", role: "OWNER" },
  ];

  for (const m of memberships) {
    await prisma.teamMember.create({
      data: {
        userId: userRecords[m.user].id,
        teamId: teamRecords[m.team].id,
        role: m.role,
        joinedAt: daysAgo(m.team.includes("workspace") ? 60 : 45),
      },
    });
  }
  console.log(`    ✓ ${memberships.length} memberships created`);

  // --- Create a pending join request ---
  console.log("\n  Creating join request...");
  await prisma.teamJoinRequest.create({
    data: {
      teamId: teamRecords["identity-team"].id,
      userId: userRecords["pat.morgan@example.com"].id,
      status: "PENDING",
      note: "Would like to help test SAML integrations",
      createdAt: hoursAgo(6),
    },
  });
  console.log("    ✓ Pat Morgan → Identity Team (pending)");

  // --- Create app instances ---
  console.log("\n  Creating app instances...");

  const apps = [
    {
      name: "Okta Dev - OIDC",
      slug: "okta-dev-oidc",
      protocol: "OIDC",
      teamSlug: "identity-team",
      issuerUrl: "https://dev-12345.okta.com/oauth2/default",
      clientId: "0oa1b2c3d4e5f6g7h8i9",
      clientSecret: encrypt("mock-client-secret-okta-dev"),
      scopes: "openid profile email offline_access",
      pkceMode: "S256",
    },
    {
      name: "Entra ID - Production",
      slug: "entra-id-prod",
      protocol: "OIDC",
      teamSlug: "identity-team",
      issuerUrl: "https://login.microsoftonline.com/a1b2c3d4-e5f6-7890-abcd-ef1234567890/v2.0",
      clientId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      clientSecret: encrypt("mock-client-secret-entra-prod"),
      scopes: "openid profile email",
      pkceMode: "S256",
      usePar: false,
    },
    {
      name: "Auth0 - Staging",
      slug: "auth0-staging",
      protocol: "OIDC",
      teamSlug: "platform-eng",
      issuerUrl: "https://staging.us.auth0.com",
      clientId: "abc123def456ghi789jkl",
      clientSecret: encrypt("mock-client-secret-auth0-staging"),
      scopes: "openid profile email offline_access",
      pkceMode: "S256",
      customAuthParamsJson: JSON.stringify([
        { key: "organization", value: "org_acme_staging" },
        { key: "prompt", value: "login" },
      ]),
    },
    {
      name: "Keycloak - Dev",
      slug: "keycloak-dev",
      protocol: "OIDC",
      teamSlug: "platform-eng",
      issuerUrl: "https://keycloak.internal.dev/realms/authlab",
      clientId: "authlab-client",
      clientSecret: encrypt("mock-client-secret-keycloak-dev"),
      scopes: "openid profile email",
      pkceMode: "NONE",
    },
    {
      name: "Entra ID - SAML",
      slug: "entra-saml",
      protocol: "SAML",
      teamSlug: "identity-team",
      entryPoint: "https://login.microsoftonline.com/a1b2c3d4/saml2",
      issuer: "https://authlab.example.com/saml/entra",
      idpCert: encrypt("-----BEGIN CERTIFICATE-----\nMIIC8DCCAdigAwIBAgIQMOCK1234567890EXAMPLE\n-----END CERTIFICATE-----"),
      nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      forceAuthnDefault: false,
      isPassiveDefault: false,
      signAuthnRequests: true,
      samlSignatureAlgorithm: "SHA256",
      clockSkewToleranceSeconds: 60,
      samlLogoutUrl: "https://login.microsoftonline.com/a1b2c3d4/saml2/logout",
    },
    {
      name: "Okta - SAML",
      slug: "okta-saml",
      protocol: "SAML",
      teamSlug: "identity-team",
      entryPoint: "https://dev-12345.okta.com/app/example/sso/saml",
      issuer: "https://authlab.example.com/saml/okta",
      idpCert: encrypt("-----BEGIN CERTIFICATE-----\nMIIC8DCCAdigAwIBAgIQOKTA1234567890EXAMPLE\n-----END CERTIFICATE-----"),
      nameIdFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
      forceAuthnDefault: false,
      isPassiveDefault: false,
      signAuthnRequests: false,
      samlSignatureAlgorithm: "SHA256",
    },
    {
      name: "PingFederate - QA",
      slug: "ping-qa",
      protocol: "SAML",
      teamSlug: "platform-eng",
      entryPoint: "https://ping.qa.internal/idp/SSO.saml2",
      issuer: "https://authlab.example.com/saml/ping-qa",
      idpCert: encrypt("-----BEGIN CERTIFICATE-----\nMIIC8DCCAdigAwIBAgIQPING1234567890EXAMPLE\n-----END CERTIFICATE-----"),
      nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
      requestedAuthnContext: "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
      forceAuthnDefault: true,
      signAuthnRequests: true,
      samlSignatureAlgorithm: "SHA256",
      clockSkewToleranceSeconds: 120,
    },
    {
      name: "Client Creds - API",
      slug: "client-creds-api",
      protocol: "OIDC",
      teamSlug: "platform-eng",
      issuerUrl: "https://auth.api.internal/oauth2",
      clientId: "svc-authlab-api",
      clientSecret: encrypt("mock-m2m-secret"),
      scopes: "read:users write:users",
      pkceMode: "NONE",
    },
  ];

  for (const app of apps) {
    const { teamSlug, ...data } = app;
    await prisma.appInstance.create({
      data: {
        ...data,
        teamId: teamRecords[teamSlug].id,
        createdAt: daysAgo(Math.floor(Math.random() * 30) + 5),
      },
    });
    console.log(`    ✓ ${app.name} (${app.slug}) [${app.protocol}] → ${teamSlug}`);
  }

  // --- Create SCIM mock resources for one app ---
  console.log("\n  Creating SCIM mock resources...");
  const oktaOidcApp = await prisma.appInstance.findUnique({ where: { slug: "okta-dev-oidc" } });

  if (oktaOidcApp) {
    const scimUsers = [
      { displayName: "Jane Doe", externalId: "ext-001", payload: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: "jdoe@example.com", name: { givenName: "Jane", familyName: "Doe" }, emails: [{ value: "jdoe@example.com", type: "work", primary: true }], active: true } },
      { displayName: "Carlos Ruiz", externalId: "ext-002", payload: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: "cruiz@example.com", name: { givenName: "Carlos", familyName: "Ruiz" }, emails: [{ value: "cruiz@example.com", type: "work", primary: true }], active: true } },
      { displayName: "Aisha Khan", externalId: "ext-003", payload: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: "akhan@example.com", name: { givenName: "Aisha", familyName: "Khan" }, emails: [{ value: "akhan@example.com", type: "work", primary: true }], active: false } },
    ];

    for (const u of scimUsers) {
      await prisma.scimResource.create({
        data: {
          appInstanceId: oktaOidcApp.id,
          resourceType: "USER",
          resourceId: randomBytes(12).toString("hex"),
          externalId: u.externalId,
          displayName: u.displayName,
          payloadJson: JSON.stringify(u.payload),
          createdAt: daysAgo(10),
          updatedAt: daysAgo(2),
        },
      });
      console.log(`    ✓ SCIM User: ${u.displayName}`);
    }

    const scimGroups = [
      { displayName: "Engineering", payload: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"], displayName: "Engineering", members: [] } },
      { displayName: "Security", payload: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"], displayName: "Security", members: [] } },
    ];

    for (const g of scimGroups) {
      await prisma.scimResource.create({
        data: {
          appInstanceId: oktaOidcApp.id,
          resourceType: "GROUP",
          resourceId: randomBytes(12).toString("hex"),
          displayName: g.displayName,
          payloadJson: JSON.stringify(g.payload),
          createdAt: daysAgo(8),
          updatedAt: daysAgo(1),
        },
      });
      console.log(`    ✓ SCIM Group: ${g.displayName}`);
    }

    // --- SCIM request logs ---
    const scimLogs = [
      { method: "GET", path: "/api/scim/okta-dev-oidc/ServiceProviderConfig", statusCode: 200 },
      { method: "GET", path: "/api/scim/okta-dev-oidc/Users?filter=userName eq \"jdoe@example.com\"", statusCode: 200 },
      { method: "POST", path: "/api/scim/okta-dev-oidc/Users", statusCode: 201, resourceType: "USER" },
      { method: "PATCH", path: "/api/scim/okta-dev-oidc/Users/abc123", statusCode: 200, resourceType: "USER" },
      { method: "GET", path: "/api/scim/okta-dev-oidc/Groups", statusCode: 200 },
      { method: "POST", path: "/api/scim/okta-dev-oidc/Groups", statusCode: 201, resourceType: "GROUP" },
    ];

    for (let i = 0; i < scimLogs.length; i++) {
      const log = scimLogs[i];
      await prisma.scimRequestLog.create({
        data: {
          appInstanceId: oktaOidcApp.id,
          method: log.method,
          path: log.path,
          statusCode: log.statusCode,
          resourceType: log.resourceType || null,
          createdAt: hoursAgo(scimLogs.length - i),
        },
      });
    }
    console.log(`    ✓ ${scimLogs.length} SCIM request logs`);
  }

  // --- Create a pending invite ---
  console.log("\n  Creating invite...");
  const inviteToken = randomBytes(32).toString("hex");
  await prisma.inviteToken.create({
    data: {
      token: createHash("sha256").update(inviteToken).digest("hex"),
      email: "new.hire@example.com",
      role: "MEMBER",
      teamId: teamRecords["identity-team"].id,
      invitedById: userRecords["admin@example.com"].id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000), // 7 days
    },
  });
  console.log("    ✓ Invite: new.hire@example.com → Identity Team (MEMBER)");

  console.log("\n✅ Seed complete!\n");
  console.log("Test accounts (password: Test1234!):");
  console.log("  admin@example.com      — System Admin, MFA enabled");
  console.log("  alex.chen@example.com   — Identity Team Admin");
  console.log("  maria.santos@example.com — Identity Team Member");
  console.log("  sam.rivera@example.com  — Unverified account");
  console.log("  pat.morgan@example.com  — Must change password");

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
