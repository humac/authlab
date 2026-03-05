import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { TransferAppSchema } from "@/lib/validators";
import {
  copyAppInstanceToTeam,
  getRedactedAppInstanceById,
  moveAppInstanceToTeam,
} from "@/repositories/app-instance.repo";
import { getTeamById, getTeamMembership } from "@/repositories/team.repo";

function canManageTeam(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = TransferAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const app = await getRedactedAppInstanceById(id);
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  if (parsed.data.targetTeamId === app.teamId) {
    return NextResponse.json(
      { error: "Target team must be different from source team" },
      { status: 400 },
    );
  }

  const targetTeam = await getTeamById(parsed.data.targetTeamId);
  if (!targetTeam) {
    return NextResponse.json({ error: "Target team not found" }, { status: 404 });
  }

  const [sourceMembership, targetMembership] = await Promise.all([
    getTeamMembership(user.userId, app.teamId),
    getTeamMembership(user.userId, parsed.data.targetTeamId),
  ]);

  if (!canManageTeam(sourceMembership?.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions on source team" },
      { status: 403 },
    );
  }

  if (!canManageTeam(targetMembership?.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions on target team" },
      { status: 403 },
    );
  }

  const transferredApp =
    parsed.data.mode === "MOVE"
      ? await moveAppInstanceToTeam(id, parsed.data.targetTeamId)
      : await copyAppInstanceToTeam(id, parsed.data.targetTeamId);

  return NextResponse.json({
    mode: parsed.data.mode,
    app: transferredApp,
  });
}
