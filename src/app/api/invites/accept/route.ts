import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { AcceptInviteSchema } from "@/lib/validators";
import { getInviteByToken, deleteInvite } from "@/repositories/invite.repo";
import { addTeamMember, getTeamMembership } from "@/repositories/team.repo";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = AcceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const invite = await getInviteByToken(parsed.data.token);
  if (!invite) {
    return NextResponse.json(
      { error: "Invalid or expired invitation" },
      { status: 404 },
    );
  }

  // Check if invite is expired
  if (new Date() > invite.expiresAt) {
    await deleteInvite(invite.id);
    return NextResponse.json(
      { error: "This invitation has expired" },
      { status: 410 },
    );
  }

  // Check if user is already a member
  const existing = await getTeamMembership(user.userId, invite.teamId);
  if (existing) {
    await deleteInvite(invite.id);
    return NextResponse.json(
      { error: "You are already a member of this team" },
      { status: 409 },
    );
  }

  await addTeamMember(invite.teamId, user.userId, invite.role);
  await deleteInvite(invite.id);

  return NextResponse.json({
    ok: true,
    teamId: invite.teamId,
    teamName: invite.team.name,
    role: invite.role,
  });
}
