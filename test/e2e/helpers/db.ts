import { randomUUID } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
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
  const row = db
    .prepare(
      `SELECT id, name, slug, clientSecret
       FROM "AppInstance"
       WHERE slug = ?`,
    )
    .get(slug) as E2eAppRecord | undefined;

  return row ?? null;
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
