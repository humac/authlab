import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { CreateTeamSchema } from "@/lib/validators";
import {
  createTeam,
  getTeamsByUserId,
  addTeamMember,
} from "@/repositories/team.repo";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teams = await getTeamsByUserId(user.userId);
  return NextResponse.json(teams);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.isSystemAdmin) {
    return NextResponse.json(
      { error: "Only system admins can create teams" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const parsed = CreateTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const team = await createTeam(parsed.data);
    await addTeamMember(team.id, user.userId, "OWNER");
    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { error: "A team with this slug already exists" },
        { status: 409 },
      );
    }
    throw error;
  }
}
