import { getPrisma } from "@/lib/db";
import type { TeamRole } from "@/generated/prisma/client/enums";

export async function createInvite(data: {
  token: string;
  email: string;
  role: TeamRole;
  teamId: string;
  invitedById: string;
  expiresAt: Date;
}) {
  const prisma = await getPrisma();
  return prisma.inviteToken.create({ data });
}

export async function getInviteByToken(token: string) {
  const prisma = await getPrisma();
  return prisma.inviteToken.findUnique({
    where: { token },
    include: {
      team: true,
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function listInvitesByTeam(teamId: string) {
  const prisma = await getPrisma();
  return prisma.inviteToken.findMany({
    where: { teamId },
    include: {
      invitedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteInvite(id: string) {
  const prisma = await getPrisma();
  await prisma.inviteToken.delete({ where: { id } });
}

export async function deleteExpiredInvites() {
  const prisma = await getPrisma();
  await prisma.inviteToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
