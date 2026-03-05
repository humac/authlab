import crypto from "crypto";
import { NextResponse } from "next/server";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { getCurrentUser } from "@/lib/user-session";
import { AddOrInviteMemberSchema } from "@/lib/validators";
import { getUserByEmail } from "@/repositories/user.repo";
import { createInvite } from "@/repositories/invite.repo";
import {
  addTeamMember,
  getTeamById,
  getTeamMembership,
} from "@/repositories/team.repo";

export async function POST(
  request: Request,
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
      throw error;
    }
  }

  const team = await getTeamById(id);
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  if (team.isPersonal) {
    return NextResponse.json(
      { error: "Cannot modify members of personal workspace" },
      { status: 400 },
    );
  }

  const body = await request.json();
  const parsed = AddOrInviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existingUser = await getUserByEmail(parsed.data.email);
  if (existingUser) {
    const membership = await getTeamMembership(existingUser.id, id);
    if (membership) {
      return NextResponse.json(
        { error: "User is already a team member" },
        { status: 409 },
      );
    }

    const addedMember = await addTeamMember(id, existingUser.id, parsed.data.role);
    return NextResponse.json({ mode: "added", member: addedMember });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invite = await createInvite({
    token,
    email: parsed.data.email,
    role: parsed.data.role,
    teamId: id,
    invitedById: currentUser.userId,
    expiresAt,
  });
  return NextResponse.json({ mode: "invited", invite });
}
