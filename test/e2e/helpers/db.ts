import { randomUUID } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import { encrypt } from "../../../src/lib/encryption";
import { hashPassword } from "../../../src/lib/password";
import { hashToken } from "../../../src/lib/token";

type UserSeedOptions = {
  email?: string;
  name?: string;
  password?: string;
  passwordHash?: string;
  isSystemAdmin?: boolean;
  mustChangePassword?: boolean;
  isVerified?: boolean;
  mfaEnabled?: boolean;
  personalTeamName?: string;
};

type TeamSeedOptions = {
  name?: string;
  slug?: string;
  isPersonal?: boolean;
};

export type E2eUserRecord = {
  id: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
};

export type E2eAppRecord = {
  id: string;
  name: string;
  slug: string;
  clientSecret: string | null;
  pkceMode: "S256" | "PLAIN" | "NONE";
  signAuthnRequests: boolean;
  hasSpSigningPrivateKey: boolean;
  hasSpSigningCert: boolean;
};

export type E2eAuthRunRecord = {
  id: string;
  appInstanceId: string;
  protocol: "OIDC" | "SAML";
  grantType: "AUTHORIZATION_CODE" | "CLIENT_CREDENTIALS";
};

export type E2eJoinRequestRecord = {
  id: string;
  teamId: string;
  userId: string;
};

export type E2eInviteRecord = {
  id: string;
  token: string;
  email: string;
  teamId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

function resolveDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL || "file:./test/e2e/.tmp/e2e.db";
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL for E2E helper: ${databaseUrl}`);
  }

  const filePath = databaseUrl.slice("file:".length);
  return path.resolve(process.cwd(), filePath);
}

const db = new Database(resolveDatabasePath());
db.pragma("foreign_keys = ON");

function nowIso() {
  return new Date().toISOString();
}

function toBool(value: number | null) {
  return value === 1;
}

export async function resetDatabase() {
  db.exec(`
    DELETE FROM "AuthRunEvent";
    DELETE FROM "AuthRun";
    DELETE FROM "AuthToken";
    DELETE FROM "Credential";
    DELETE FROM "UserProfileImage";
    DELETE FROM "InviteToken";
    DELETE FROM "TeamJoinRequest";
    DELETE FROM "TeamMember";
    DELETE FROM "AppInstance";
    DELETE FROM "SystemSetting";
    DELETE FROM "Team";
    DELETE FROM "User";
  `);
}

export async function createUserWithPersonalTeam(
  overrides: UserSeedOptions = {},
) {
  const password = overrides.password ?? "Passw0rd!123";
  const email = (overrides.email ?? `${randomUUID()}@example.com`).toLowerCase();
  const name = overrides.name ?? "E2E User";
  const passwordHash = overrides.passwordHash ?? (await hashPassword(password));
  const userId = randomUUID();
  const teamId = randomUUID();
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO "User" (
      id, email, name, passwordHash, isSystemAdmin, mustChangePassword,
      isVerified, mfaEnabled, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    email,
    name,
    passwordHash,
    overrides.isSystemAdmin ? 1 : 0,
    overrides.mustChangePassword ? 1 : 0,
    overrides.isVerified === false ? 0 : 1,
    overrides.mfaEnabled ? 1 : 0,
    timestamp,
    timestamp,
  );

  db.prepare(
    `INSERT INTO "Team" (id, name, slug, isPersonal, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    teamId,
    overrides.personalTeamName ?? `${name} Personal`,
    `personal-${userId}`,
    1,
    timestamp,
    timestamp,
  );

  db.prepare(
    `INSERT INTO "TeamMember" (id, role, userId, teamId, joinedAt)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), "OWNER", userId, teamId, timestamp);

  return {
    user: {
      id: userId,
      email,
      name,
      isSystemAdmin: overrides.isSystemAdmin ?? false,
      mustChangePassword: overrides.mustChangePassword ?? false,
      isVerified: overrides.isVerified ?? true,
      mfaEnabled: overrides.mfaEnabled ?? false,
    },
    team: {
      id: teamId,
      name: overrides.personalTeamName ?? `${name} Personal`,
      slug: `personal-${userId}`,
      isPersonal: true,
    },
    password,
  };
}

export async function createTeam(overrides: TeamSeedOptions = {}) {
  const team = {
    id: randomUUID(),
    name: overrides.name ?? "Shared Team",
    slug: overrides.slug ?? `team-${randomUUID()}`,
    isPersonal: overrides.isPersonal ?? false,
  };
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO "Team" (id, name, slug, isPersonal, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    team.id,
    team.name,
    team.slug,
    team.isPersonal ? 1 : 0,
    timestamp,
    timestamp,
  );

  return team;
}

export async function createOidcApp(data: {
  teamId: string;
  name?: string;
  slug?: string;
  issuerUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  pkceMode?: "S256" | "PLAIN" | "NONE";
}) {
  const app = {
    id: randomUUID(),
    name: data.name ?? "Seeded OIDC App",
    slug: data.slug ?? `seeded-oidc-${randomUUID().slice(0, 8)}`,
    protocol: "OIDC" as const,
    teamId: data.teamId,
    issuerUrl: data.issuerUrl ?? "https://issuer.example.com",
    clientId: data.clientId ?? "client-123",
    clientSecret: data.clientSecret ?? "secret-123",
    scopes: data.scopes ?? "openid profile email",
    pkceMode: data.pkceMode ?? "S256",
  };
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO "AppInstance" (
      id, name, slug, protocol, teamId, issuerUrl, clientId, clientSecret, scopes,
      customAuthParamsJson, pkceMode, entryPoint, issuer, idpCert, nameIdFormat,
      forceAuthnDefault, isPassiveDefault, signAuthnRequests, spSigningPrivateKey,
      spSigningCert, buttonColor, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    app.id,
    app.name,
    app.slug,
    app.protocol,
    app.teamId,
    app.issuerUrl,
    app.clientId,
    encrypt(app.clientSecret),
    app.scopes,
    null,
    app.pkceMode,
    null,
    null,
    null,
    null,
    0,
    0,
    0,
    null,
    null,
    "#3B71CA",
    timestamp,
    timestamp,
  );

  return app;
}

export async function createAuthRunRecord(data: {
  appInstanceId: string;
  protocol?: "OIDC" | "SAML";
  grantType?: "AUTHORIZATION_CODE" | "CLIENT_CREDENTIALS";
  status?: "PENDING" | "AUTHENTICATED" | "LOGGED_OUT" | "FAILED";
  nonce?: string | null;
  claims?: Record<string, unknown>;
  idToken?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  rawTokenResponse?: string | null;
  accessTokenExpiresAt?: string | null;
  lastIntrospection?: Record<string, unknown> | null;
  lastRevocationAt?: string | null;
}) {
  const run: E2eAuthRunRecord = {
    id: randomUUID(),
    appInstanceId: data.appInstanceId,
    protocol: data.protocol ?? "OIDC",
    grantType: data.grantType ?? "AUTHORIZATION_CODE",
  };
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO "AuthRun" (
      id, appInstanceId, protocol, grantType, status, loginState, nonce, nonceStatus,
      runtimeOverridesJson, outboundAuthParamsJson, claimsJson, idToken, accessTokenEnc,
      refreshTokenEnc, accessTokenExpiresAt, rawTokenResponseEnc, rawSamlResponseXml,
      userinfoJson, lastIntrospectionJson, lastRevocationAt, authenticatedAt, completedAt,
      logoutState, logoutCompletedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.appInstanceId,
    run.protocol,
    run.grantType,
    data.status ?? "AUTHENTICATED",
    null,
    data.nonce ?? null,
    data.nonce ? "valid" : null,
    JSON.stringify({}),
    JSON.stringify({}),
    JSON.stringify(data.claims ?? {}),
    data.idToken ?? null,
    data.accessToken ? encrypt(data.accessToken) : null,
    data.refreshToken ? encrypt(data.refreshToken) : null,
    data.accessTokenExpiresAt ?? null,
    data.rawTokenResponse ? encrypt(data.rawTokenResponse) : null,
    null,
    null,
    data.lastIntrospection ? JSON.stringify(data.lastIntrospection) : null,
    data.lastRevocationAt ?? null,
    timestamp,
    null,
    null,
    null,
    timestamp,
    timestamp,
  );

  return run;
}

export async function updateAuthRunRecord(
  runId: string,
  data: {
    accessToken?: string | null;
    refreshToken?: string | null;
    rawTokenResponse?: string | null;
    accessTokenExpiresAt?: string | null;
    lastIntrospection?: Record<string, unknown> | null;
    lastRevocationAt?: string | null;
  },
) {
  type ExistingAuthRunRow = {
    accessTokenEnc: string | null;
    refreshTokenEnc: string | null;
    rawTokenResponseEnc: string | null;
    accessTokenExpiresAt: string | null;
    lastIntrospectionJson: string | null;
    lastRevocationAt: string | null;
  };
  const existing = db
    .prepare(
      `SELECT accessTokenEnc, refreshTokenEnc, rawTokenResponseEnc, accessTokenExpiresAt, lastIntrospectionJson, lastRevocationAt
       FROM "AuthRun"
       WHERE id = ?`,
    )
    .get(runId) as ExistingAuthRunRow;

  db.prepare(
    `UPDATE "AuthRun"
     SET accessTokenEnc = ?,
         refreshTokenEnc = ?,
         rawTokenResponseEnc = ?,
         accessTokenExpiresAt = ?,
         lastIntrospectionJson = ?,
         lastRevocationAt = ?,
         updatedAt = ?
     WHERE id = ?`,
  ).run(
    data.accessToken === undefined
      ? existing.accessTokenEnc
      : data.accessToken
        ? encrypt(data.accessToken)
        : null,
    data.refreshToken === undefined
      ? existing.refreshTokenEnc
      : data.refreshToken
        ? encrypt(data.refreshToken)
        : null,
    data.rawTokenResponse === undefined
      ? existing.rawTokenResponseEnc
      : data.rawTokenResponse
        ? encrypt(data.rawTokenResponse)
        : null,
    data.accessTokenExpiresAt === undefined
      ? existing.accessTokenExpiresAt
      : data.accessTokenExpiresAt,
    data.lastIntrospection === undefined
      ? existing.lastIntrospectionJson
      : data.lastIntrospection
        ? JSON.stringify(data.lastIntrospection)
        : null,
    data.lastRevocationAt === undefined
      ? existing.lastRevocationAt
      : data.lastRevocationAt,
    nowIso(),
    runId,
  );
}

export async function createAuthRunEventRecord(data: {
  authRunId: string;
  type:
    | "AUTHENTICATED"
    | "CLIENT_CREDENTIALS_ISSUED"
    | "REFRESHED"
    | "INTROSPECTED"
    | "REVOKED"
    | "USERINFO_FETCHED"
    | "FAILED";
  status?: "SUCCESS" | "FAILED";
  request?: Record<string, unknown> | null;
  response?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO "AuthRunEvent" (
      id, authRunId, type, status, requestJson, responseEnc, metadataJson, occurredAt, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    data.authRunId,
    data.type,
    data.status ?? "SUCCESS",
    data.request ? JSON.stringify(data.request) : null,
    data.response ? encrypt(data.response) : null,
    data.metadata ? JSON.stringify(data.metadata) : null,
    timestamp,
    timestamp,
  );
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER",
) {
  const joinedAt = nowIso();
  db.prepare(
    `INSERT INTO "TeamMember" (id, role, userId, teamId, joinedAt)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), role, userId, teamId, joinedAt);
}

export async function createEmailVerifyToken(userId: string, token: string) {
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO "AuthToken" (
      id, userId, purpose, tokenHash, expiresAt, usedAt, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    "EMAIL_VERIFY",
    hashToken(token),
    new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    null,
    timestamp,
  );
}

export async function createPasswordResetToken(userId: string, token: string) {
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO "AuthToken" (
      id, userId, purpose, tokenHash, expiresAt, usedAt, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    "PASSWORD_RESET",
    hashToken(token),
    new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    null,
    timestamp,
  );
}

export async function createInviteToken(data: {
  token: string;
  email: string;
  teamId: string;
  invitedById: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
}) {
  const invite: E2eInviteRecord = {
    id: randomUUID(),
    token: data.token,
    email: data.email.toLowerCase(),
    teamId: data.teamId,
    role: data.role ?? "MEMBER",
  };
  db.prepare(
    `INSERT INTO "InviteToken" (
      id, token, email, role, expiresAt, teamId, invitedById, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    invite.id,
    invite.token,
    invite.email,
    invite.role,
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    invite.teamId,
    data.invitedById,
    nowIso(),
  );

  return invite;
}

export async function findUserByEmail(email: string): Promise<E2eUserRecord | null> {
  const row = db
    .prepare(
      `SELECT id, email, name, isSystemAdmin, mustChangePassword, isVerified, mfaEnabled
       FROM "User"
       WHERE email = ?`,
    )
    .get(email.toLowerCase()) as
    | {
        id: string;
        email: string;
        name: string;
        isSystemAdmin: number;
        mustChangePassword: number;
        isVerified: number;
        mfaEnabled: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isSystemAdmin: toBool(row.isSystemAdmin),
    mustChangePassword: toBool(row.mustChangePassword),
    isVerified: toBool(row.isVerified),
    mfaEnabled: toBool(row.mfaEnabled),
  };
}

export async function findAppBySlug(slug: string): Promise<E2eAppRecord | null> {
  type AppLookupRow = {
    id: string;
    name: string;
    slug: string;
    clientSecret: string | null;
    pkceMode: "S256" | "PLAIN" | "NONE";
    signAuthnRequests: number;
    hasSpSigningPrivateKey: number;
    hasSpSigningCert: number;
  };

  const row = db
    .prepare(
      `SELECT
         id,
         name,
         slug,
         clientSecret,
         pkceMode,
         signAuthnRequests,
         CASE WHEN spSigningPrivateKey IS NULL THEN 0 ELSE 1 END AS hasSpSigningPrivateKey,
         CASE WHEN spSigningCert IS NULL THEN 0 ELSE 1 END AS hasSpSigningCert
       FROM "AppInstance"
       WHERE slug = ?`,
    )
    .get(slug) as AppLookupRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...row,
    signAuthnRequests: toBool(row.signAuthnRequests),
    hasSpSigningPrivateKey: toBool(row.hasSpSigningPrivateKey),
    hasSpSigningCert: toBool(row.hasSpSigningCert),
  };
}

export async function listJoinRequestsForUser(
  userId: string,
): Promise<E2eJoinRequestRecord[]> {
  const rows = db
    .prepare(
      `SELECT id, teamId, userId
       FROM "TeamJoinRequest"
       WHERE userId = ?
       ORDER BY createdAt ASC`,
    )
    .all(userId) as E2eJoinRequestRecord[];

  return rows;
}

export async function countProfileImages(userId: string): Promise<number> {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM "UserProfileImage"
       WHERE userId = ?`,
    )
    .get(userId) as { count: number };

  return row.count;
}

export async function countCredentials(userId: string): Promise<number> {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM "Credential"
       WHERE userId = ?`,
    )
    .get(userId) as { count: number };

  return row.count;
}

export async function hasTeamMembership(
  userId: string,
  teamId: string,
): Promise<boolean> {
  const row = db
    .prepare(
      `SELECT id
       FROM "TeamMember"
       WHERE userId = ? AND teamId = ?
       LIMIT 1`,
    )
    .get(userId, teamId) as { id: string } | undefined;

  return Boolean(row);
}
