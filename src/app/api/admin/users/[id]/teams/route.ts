import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { getPrisma } from "@/lib/db";
import { AdminSetUserTeamsSchema } from "@/lib/validators";
import { getUserById } from "@/repositories/user.repo";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = await getUserById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = AdminSetUserTeamsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const desiredMemberships = new Map<string, "ADMIN" | "MEMBER">();
  for (const membership of parsed.data.memberships) {
    desiredMemberships.set(membership.teamId, membership.role);
  }

  const prisma = await getPrisma();
  const teams = await prisma.team.findMany({
    where: {
      id: { in: Array.from(desiredMemberships.keys()) },
    },
    select: {
      id: true,
      isPersonal: true,
    },
  });

  const validTeamIds = new Set(
    teams.filter((team) => !team.isPersonal).map((team) => team.id),
  );

  for (const teamId of desiredMemberships.keys()) {
    if (!validTeamIds.has(teamId)) {
      return NextResponse.json(
        { error: `Invalid or personal team assignment: ${teamId}` },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.teamMember.findMany({
      where: {
        userId: id,
        team: { isPersonal: false },
      },
      select: { teamId: true, role: true },
    });

    const existingMap = new Map(existing.map((item) => [item.teamId, item.role]));
    const existingIds = new Set(existingMap.keys());
    const desiredIds = new Set(desiredMemberships.keys());

    const toRemove = existing
      .filter((item) => item.role !== "OWNER")
      .map((item) => item.teamId)
      .filter((teamId) => !desiredIds.has(teamId));

    if (toRemove.length > 0) {
      await tx.teamMember.deleteMany({
        where: {
          userId: id,
          teamId: { in: toRemove },
        },
      });
    }

    for (const [teamId, role] of desiredMemberships.entries()) {
      if (existingIds.has(teamId)) {
        if (existingMap.get(teamId) === "OWNER") {
          continue;
        }
        await tx.teamMember.update({
          where: {
            userId_teamId: {
              userId: id,
              teamId,
            },
          },
          data: { role },
        });
      } else {
        await tx.teamMember.create({
          data: {
            userId: id,
            teamId,
            role,
          },
        });
      }
    }
  });

  const memberships = await prisma.teamMember.findMany({
    where: {
      userId: id,
      team: { isPersonal: false },
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
          isPersonal: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({ memberships });
}
