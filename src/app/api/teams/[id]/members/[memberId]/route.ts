import { NextResponse } from "next/server";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { getCurrentUser } from "@/lib/user-session";
import {
  updateTeamMemberRole,
  removeTeamMember,
  getTeamMembership,
  getTeamById,
} from "@/repositories/team.repo";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!currentUser.isSystemAdmin) {
    try {
      await requireTeamAccess(id, ["OWNER", "ADMIN"]);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  }

  const { role } = await request.json();
  if (!["ADMIN", "MEMBER"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Find the member by their TeamMember ID — memberId is the userId
  const membership = await getTeamMembership(memberId, id);
  if (!membership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Cannot change owner role
  if (membership.role === "OWNER") {
    return NextResponse.json(
      { error: "Cannot change owner role" },
      { status: 400 },
    );
  }

  const updated = await updateTeamMemberRole(id, memberId, role);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let accessor: Awaited<ReturnType<typeof requireTeamAccess>> | null = null;
  if (!currentUser.isSystemAdmin) {
    try {
      accessor = await requireTeamAccess(id, ["OWNER", "ADMIN"]);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  }

  const membership = await getTeamMembership(memberId, id);
  if (!membership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Cannot remove owner
  if (membership.role === "OWNER") {
    return NextResponse.json(
      { error: "Cannot remove team owner" },
      { status: 400 },
    );
  }

  // Admins cannot remove other admins (only owners can)
  if (
    membership.role === "ADMIN" &&
    !currentUser.isSystemAdmin &&
    accessor?.membership.role !== "OWNER"
  ) {
    return NextResponse.json(
      { error: "Only team owners can remove admins" },
      { status: 403 },
    );
  }

  const team = await getTeamById(id);
  if (team?.isPersonal) {
    return NextResponse.json(
      { error: "Cannot remove members from personal workspace" },
      { status: 400 },
    );
  }

  await removeTeamMember(id, memberId);
  return NextResponse.json({ ok: true });
}
