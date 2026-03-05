import { NextResponse } from "next/server";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { getUserSession } from "@/lib/user-session";
import { UpdateTeamSchema } from "@/lib/validators";
import {
  getTeamById,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  getTeamsByUserId,
} from "@/repositories/team.repo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await requireTeamAccess(id);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const team = await getTeamById(id);
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const members = await listTeamMembers(id);

  return NextResponse.json({ ...team, members });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await requireTeamAccess(id, ["OWNER", "ADMIN"]);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const team = await getTeamById(id);
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (team.isPersonal) {
    return NextResponse.json(
      { error: "Cannot modify personal workspace" },
      { status: 400 },
    );
  }

  const body = await request.json();
  const parsed = UpdateTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updated = await updateTeam(id, parsed.data);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let accessor;
  try {
    accessor = await requireTeamAccess(id, ["OWNER", "ADMIN"]);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const team = await getTeamById(id);
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (team.isPersonal) {
    return NextResponse.json(
      { error: "Cannot delete personal workspace" },
      { status: 400 },
    );
  }

  await deleteTeam(id);

  let activeTeamId = accessor.user.activeTeamId;
  if (accessor.user.activeTeamId === id) {
    const remainingTeams = await getTeamsByUserId(accessor.user.userId);
    const fallbackTeam =
      remainingTeams.find((member) => member.isPersonal) || remainingTeams[0];
    if (fallbackTeam) {
      const session = await getUserSession();
      session.activeTeamId = fallbackTeam.id;
      await session.save();
      activeTeamId = fallbackTeam.id;
    }
  }

  return NextResponse.json({ ok: true, activeTeamId });
}
