import { NextResponse } from "next/server";
import crypto from "crypto";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { CreateInviteSchema } from "@/lib/validators";
import { createInvite, listInvitesByTeam } from "@/repositories/invite.repo";
import { getTeamById } from "@/repositories/team.repo";

export async function GET(
  _request: Request,
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

  const invites = await listInvitesByTeam(id);
  return NextResponse.json(invites);
}

export async function POST(
  request: Request,
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
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  if (team.isPersonal) {
    return NextResponse.json(
      { error: "Cannot invite to personal workspace" },
      { status: 400 },
    );
  }

  const body = await request.json();
  const parsed = CreateInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await createInvite({
    token,
    email: parsed.data.email,
    role: parsed.data.role,
    teamId: id,
    invitedById: accessor.user.userId,
    expiresAt,
  });

  return NextResponse.json(invite, { status: 201 });
}
