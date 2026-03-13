import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { getTeamMembership } from "@/repositories/team.repo";
import { getAppInstanceNotesById } from "@/repositories/app-instance.repo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getAppInstanceNotesById(id);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await getTeamMembership(user.userId, result.teamId);
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ notes: result.notes });
}
