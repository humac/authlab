import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { AdminCreateUserSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/password";
import {
  createUser,
  getUserByEmail,
  listUsersWithMemberships,
} from "@/repositories/user.repo";
import { addTeamMember, createTeam, getTeamById, getTeamMembership } from "@/repositories/team.repo";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  const result = await listUsersWithMemberships(page, limit);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = AdminCreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await getUserByEmail(parsed.data.email);
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.tempPassword);

  try {
    const user = await createUser({
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      isSystemAdmin: parsed.data.isSystemAdmin,
      mustChangePassword: true,
    });

    const personalTeam = await createTeam({
      name: `${user.name}'s Workspace`,
      slug: `personal-${user.id}`,
      isPersonal: true,
    });
    await addTeamMember(personalTeam.id, user.id, "OWNER");

    const dedupedMemberships = new Map(
      parsed.data.memberships.map((membership) => [membership.teamId, membership.role]),
    );

    for (const [teamId, role] of dedupedMemberships.entries()) {
      const team = await getTeamById(teamId);
      if (!team || team.isPersonal) {
        continue;
      }
      const existingMembership = await getTeamMembership(user.id, teamId);
      if (!existingMembership) {
        await addTeamMember(teamId, user.id, role);
      }
    }

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        isSystemAdmin: user.isSystemAdmin,
        mustChangePassword: user.mustChangePassword,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Unable to create user due to duplicate record" }, { status: 409 });
    }
    throw error;
  }
}
