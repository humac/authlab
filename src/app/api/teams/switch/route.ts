import { NextResponse } from "next/server";
import { getCurrentUser, getUserSession } from "@/lib/user-session";
import { getTeamMembership } from "@/repositories/team.repo";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await request.json();
  if (!teamId || typeof teamId !== "string") {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  // Verify user is a member of the target team
  const membership = await getTeamMembership(user.userId, teamId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Update active team in session
  const session = await getUserSession();
  session.activeTeamId = teamId;
  await session.save();

  return NextResponse.json({ ok: true, activeTeamId: teamId });
}
