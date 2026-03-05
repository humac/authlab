import { NextResponse } from "next/server";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { getCurrentUser, getUserSession } from "@/lib/user-session";
import { UpdateTeamSchema } from "@/lib/validators";
import {
  deleteTeam,
  getTeamById,
  getTeamsByUserId,
  listTeamMembers,
  updateTeam,
} from "@/repositories/team.repo";

async function hasManagementAccess(teamId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { ok: false, status: 401, error: "Unauthorized" } as const;
  }

  if (currentUser.isSystemAdmin) {
    return { ok: true, user: currentUser } as const;
  }

  try {
    await requireTeamAccess(teamId, ["OWNER", "ADMIN"]);
    return { ok: true, user: currentUser } as const;
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, status: error.status, error: error.message } as const;
    }
    throw error;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!currentUser.isSystemAdmin) {
    try {
      await requireTeamAccess(id);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
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

  const access = await hasManagementAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
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

  const access = await hasManagementAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
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

  let activeTeamId = access.user.activeTeamId;
  if (access.user.activeTeamId === id) {
    const remainingTeams = await getTeamsByUserId(access.user.userId);
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
