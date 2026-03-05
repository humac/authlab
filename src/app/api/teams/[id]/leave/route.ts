import { NextResponse } from "next/server";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { getUserSession } from "@/lib/user-session";
import {
  countOwners,
  getTeamById,
  getTeamsByUserId,
  removeTeamMember,
} from "@/repositories/team.repo";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let accessor;
  try {
    accessor = await requireTeamAccess(id);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const team = await getTeamById(id);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  if (team.isPersonal) {
    return NextResponse.json(
      { error: "Cannot leave personal workspace" },
      { status: 400 },
    );
  }

  if (accessor.membership.role === "OWNER") {
    const ownerCount = await countOwners(id);
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "You are the last owner. Add another owner before leaving." },
        { status: 409 },
      );
    }
  }

  await removeTeamMember(id, accessor.user.userId);

  let activeTeamId = accessor.user.activeTeamId;
  if (accessor.user.activeTeamId === id) {
    const remainingTeams = await getTeamsByUserId(accessor.user.userId);
    const fallbackTeam =
      remainingTeams.find((teamMember) => teamMember.isPersonal) ||
      remainingTeams[0];

    if (!fallbackTeam) {
      return NextResponse.json(
        { error: "No team available after leaving" },
        { status: 500 },
      );
    }

    const session = await getUserSession();
    session.activeTeamId = fallbackTeam.id;
    await session.save();
    activeTeamId = fallbackTeam.id;
  }

  return NextResponse.json({ ok: true, activeTeamId });
}
