import { getPrisma } from "@/lib/db";
import type { TeamJoinRequestStatus, TeamRole } from "@/generated/prisma/client/enums";

export async function createTeamJoinRequest(data: {
  teamId: string;
  userId: string;
  role?: TeamRole;
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

export async function getPendingTeamJoinRequest(teamId: string, userId: string) {
  const prisma = await getPrisma();
  return prisma.teamJoinRequest.findUnique({
    where: {
      teamId_userId_status: {
        teamId,
        userId,
        status: "PENDING",
      },
    },
  });
}

export async function listTeamJoinRequests(teamId: string, status?: TeamJoinRequestStatus) {
  const prisma = await getPrisma();
  return prisma.teamJoinRequest.findMany({
    where: {
      teamId,
      ...(status ? { status } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getTeamJoinRequestById(id: string) {
  const prisma = await getPrisma();
  return prisma.teamJoinRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true, slug: true, isPersonal: true } },
    },
  });
}

export async function reviewTeamJoinRequest(data: {
  requestId: string;
  reviewerId: string;
  action: "approve" | "reject";
  role?: TeamRole;
}) {
  const prisma = await getPrisma();

  return prisma.$transaction(async (tx) => {
    const request = await tx.teamJoinRequest.findUnique({
      where: { id: data.requestId },
    });
    if (!request) {
      throw new Error("Team join request not found");
    }

    if (request.status !== "PENDING") {
      return request;
    }

    const now = new Date();

    if (data.action === "approve") {
      const role = data.role ?? request.role;
      const existingMembership = await tx.teamMember.findUnique({
        where: {
          userId_teamId: {
            userId: request.userId,
            teamId: request.teamId,
          },
        },
      });

      if (!existingMembership) {
        await tx.teamMember.create({
          data: {
            userId: request.userId,
            teamId: request.teamId,
            role,
          },
        });
      } else {
        await tx.teamMember.update({
          where: {
            userId_teamId: {
              userId: request.userId,
              teamId: request.teamId,
            },
          },
          data: { role },
        });
      }

      return tx.teamJoinRequest.update({
        where: { id: data.requestId },
        data: {
          status: "APPROVED",
          role,
          reviewedById: data.reviewerId,
          reviewedAt: now,
        },
      });
    }

    return tx.teamJoinRequest.update({
      where: { id: data.requestId },
      data: {
        status: "REJECTED",
        reviewedById: data.reviewerId,
        reviewedAt: now,
      },
    });
  });
}
