import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { updateUser } from "@/repositories/user.repo";
import { getTeamMembership } from "@/repositories/team.repo";
import { z } from "zod/v4";

const SetDefaultTeamSchema = z.object({
  teamId: z.nullable(z.string().min(1)),
});

export async function PUT(request: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = SetDefaultTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { teamId } = parsed.data;

  if (teamId) {
    const membership = await getTeamMembership(sessionUser.userId, teamId);
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this team" }, { status: 403 });
    }
  }

  await updateUser(sessionUser.userId, { defaultTeamId: teamId });

  return NextResponse.json({ defaultTeamId: teamId });
}
