import { getPrisma } from "@/lib/db";
import type { TeamRole } from "@/generated/prisma/client/enums";

export async function createTeam(data: {
  name: string;
  slug: string;
  isPersonal?: boolean;
}) {
  const prisma = await getPrisma();
  return prisma.team.create({ data });
}

export async function getTeamById(id: string) {
  const prisma = await getPrisma();
  return prisma.team.findUnique({ where: { id } });
}

export async function getTeamsByUserId(userId: string) {
  const prisma = await getPrisma();
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: {
          _count: { select: { appInstances: true, members: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({
    ...m.team,
    role: m.role,
    memberCount: m.team._count.members,
    appCount: m.team._count.appInstances,
  }));
}

export async function updateTeam(
  id: string,
  data: Partial<{ name: string; slug: string }>,
) {
  const prisma = await getPrisma();
  return prisma.team.update({ where: { id }, data });
}

export async function deleteTeam(id: string) {
  const prisma = await getPrisma();
  await prisma.team.delete({ where: { id } });
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: TeamRole,
) {
  const prisma = await getPrisma();
  return prisma.teamMember.create({
    data: { teamId, userId, role },
  });
}

export async function removeTeamMember(teamId: string, userId: string) {
  const prisma = await getPrisma();
  await prisma.teamMember.delete({
    where: { userId_teamId: { userId, teamId } },
  });
}

export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  role: TeamRole,
) {
  const prisma = await getPrisma();
  return prisma.teamMember.update({
    where: { userId_teamId: { userId, teamId } },
    data: { role },
  });
}

export async function getTeamMembership(userId: string, teamId: string) {
  const prisma = await getPrisma();
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

export async function listTeamMembers(teamId: string) {
  const prisma = await getPrisma();
  return prisma.teamMember.findMany({
    where: { teamId },
    include: {
      user: {
        select: { id: true, email: true, name: true, isSystemAdmin: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
}

export async function countOwners(teamId: string): Promise<number> {
  const prisma = await getPrisma();
  return prisma.teamMember.count({
    where: { teamId, role: "OWNER" },
  });
}

export async function countTeams(): Promise<number> {
  const prisma = await getPrisma();
  return prisma.team.count();
}

export async function listAllTeams(page = 1, limit = 50) {
  const prisma = await getPrisma();
  const [teams, total] = await Promise.all([
    prisma.team.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true, appInstances: true } },
      },
    }),
    prisma.team.count(),
  ]);
  return { teams, total, page, limit };
}
