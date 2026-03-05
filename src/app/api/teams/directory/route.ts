import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/user-session";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = await getPrisma();

  const [teams, myPendingRequests] = await Promise.all([
    prisma.team.findMany({
      where: { isPersonal: false },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.teamJoinRequest.findMany({
      where: {
        userId: currentUser.userId,
        status: "PENDING",
      },
      select: {
        id: true,
        teamId: true,
        status: true,
        role: true,
        createdAt: true,
      },
    }),
  ]);

  const manageableTeamIds = currentUser.isSystemAdmin
    ? teams.map((team) => team.id)
    : teams
        .filter((team) =>
          team.members.some(
            (member) =>
              member.userId === currentUser.userId &&
              (member.role === "OWNER" || member.role === "ADMIN"),
          ),
        )
        .map((team) => team.id);

  const pendingRequests = manageableTeamIds.length
    ? await prisma.teamJoinRequest.findMany({
        where: {
          status: "PENDING",
          teamId: { in: manageableTeamIds },
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const pendingByTeamId = new Map<string, (typeof pendingRequests)[number][]>();
  for (const request of pendingRequests) {
    const list = pendingByTeamId.get(request.teamId) ?? [];
    list.push(request);
    pendingByTeamId.set(request.teamId, list);
  }

  const myPendingByTeamId = new Map(myPendingRequests.map((request) => [request.teamId, request]));

  return NextResponse.json({
    isSystemAdmin: currentUser.isSystemAdmin,
    teams: teams.map((team) => {
      const myMembership = team.members.find((member) => member.userId === currentUser.userId);
      const myPending = myPendingByTeamId.get(team.id) ?? null;
      const canManage =
        currentUser.isSystemAdmin ||
        myMembership?.role === "OWNER" ||
        myMembership?.role === "ADMIN";

      return {
        id: team.id,
        name: team.name,
        slug: team.slug,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
        myRole: myMembership?.role ?? null,
        canManage,
        myPendingRequest: myPending,
        pendingJoinRequests: canManage ? pendingByTeamId.get(team.id) ?? [] : [],
        members: team.members.map((member) => ({
          id: member.id,
          role: member.role,
          joinedAt: member.joinedAt,
          user: member.user,
        })),
      };
    }),
  });
}
