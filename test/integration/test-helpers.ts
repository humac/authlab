import { getPrisma } from "@/lib/db";
import { hashToken } from "@/lib/token";

export async function resetDatabase() {
  const prisma = await getPrisma();

  await prisma.authToken.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.userProfileImage.deleteMany();
  await prisma.inviteToken.deleteMany();
  await prisma.teamJoinRequest.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.appInstance.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(overrides: Partial<{
  email: string;
  name: string;
  passwordHash: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
}> = {}) {
  const prisma = await getPrisma();
  return prisma.user.create({
    data: {
      email: overrides.email ?? "user@example.com",
      name: overrides.name ?? "Example User",
      passwordHash: overrides.passwordHash ?? "hashed-password",
      isSystemAdmin: overrides.isSystemAdmin ?? false,
      mustChangePassword: overrides.mustChangePassword ?? false,
      isVerified: overrides.isVerified ?? true,
      mfaEnabled: overrides.mfaEnabled ?? false,
    },
  });
}

export async function createTeam(overrides: Partial<{
  name: string;
  slug: string;
  isPersonal: boolean;
}> = {}) {
  const prisma = await getPrisma();
  return prisma.team.create({
    data: {
      name: overrides.name ?? "Core Team",
      slug: overrides.slug ?? `core-team-${Date.now()}`,
      isPersonal: overrides.isPersonal ?? false,
    },
  });
}

export async function addTeamMember(teamId: string, userId: string, role: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER") {
  const prisma = await getPrisma();
  return prisma.teamMember.create({
    data: { teamId, userId, role },
  });
}

export async function createInvite(data: {
  token?: string;
  email: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
  teamId: string;
  invitedById: string;
  expiresAt?: Date;
}) {
  const prisma = await getPrisma();
  return prisma.inviteToken.create({
    data: {
      token: data.token ?? `invite-${Date.now()}`,
      email: data.email,
      role: data.role ?? "MEMBER",
      teamId: data.teamId,
      invitedById: data.invitedById,
      expiresAt: data.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    },
  });
}

export async function createJoinRequest(data: {
  teamId: string;
  userId: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
  note?: string;
}) {
  const prisma = await getPrisma();
  return prisma.teamJoinRequest.create({
    data: {
      teamId: data.teamId,
      userId: data.userId,
      role: data.role ?? "MEMBER",
      note: data.note,
    },
  });
}

export async function createAuthTokenRecord(data: {
  userId: string;
  token: string;
  purpose?: "EMAIL_VERIFY" | "PASSWORD_RESET";
  expiresAt: Date;
  usedAt?: Date | null;
}) {
  const prisma = await getPrisma();
  return prisma.authToken.create({
    data: {
      userId: data.userId,
      tokenHash: hashToken(data.token),
      purpose: data.purpose ?? "EMAIL_VERIFY",
      expiresAt: data.expiresAt,
      usedAt: data.usedAt ?? null,
    },
  });
}

export async function getJson(response: Response) {
  return response.json() as Promise<unknown>;
}
