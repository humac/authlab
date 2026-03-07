import { NextResponse } from "next/server";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { getCurrentUser } from "@/lib/user-session";
import { CreateTeamJoinRequestSchema } from "@/lib/validators";
import {
  createTeamJoinRequest,
  getPendingTeamJoinRequest,
  listTeamJoinRequests,
} from "@/repositories/team-join-request.repo";
import { getTeamById, getTeamMembership } from "@/repositories/team.repo";

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
      await requireTeamAccess(id, ["OWNER", "ADMIN"]);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("GET /api/teams/[id]/join-requests failed:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  const requests = await listTeamJoinRequests(id, "PENDING");
  return NextResponse.json(requests);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const team = await getTeamById(id);
  if (!team || team.isPersonal) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const membership = await getTeamMembership(currentUser.userId, id);
  if (membership) {
    return NextResponse.json({ error: "Already a team member" }, { status: 409 });
  }

  const existingPending = await getPendingTeamJoinRequest(id, currentUser.userId);
  if (existingPending) {
    return NextResponse.json(
      { error: "A pending join request already exists for this team" },
      { status: 409 },
    );
  }

  const body = await request.json();
  const parsed = CreateTeamJoinRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const created = await createTeamJoinRequest({
    teamId: id,
    userId: currentUser.userId,
    role: parsed.data.role,
    note: parsed.data.note,
  });

  return NextResponse.json(created, { status: 201 });
}
