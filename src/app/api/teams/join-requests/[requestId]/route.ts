import { NextResponse } from "next/server";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { getCurrentUser } from "@/lib/user-session";
import { ReviewTeamJoinRequestSchema } from "@/lib/validators";
import {
  getTeamJoinRequestById,
  reviewTeamJoinRequest,
} from "@/repositories/team-join-request.repo";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await params;
  const joinRequest = await getTeamJoinRequestById(requestId);
  if (!joinRequest) {
    return NextResponse.json({ error: "Join request not found" }, { status: 404 });
  }

  if (!currentUser.isSystemAdmin) {
    try {
      await requireTeamAccess(joinRequest.teamId, ["OWNER", "ADMIN"]);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("PUT /api/teams/join-requests/[requestId] failed:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  const body = await request.json();
  const parsed = ReviewTeamJoinRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const reviewed = await reviewTeamJoinRequest({
    requestId,
    reviewerId: currentUser.userId,
    action: parsed.data.action,
    role: parsed.data.role,
  });

  return NextResponse.json(reviewed);
}
