import { NextResponse } from "next/server";
import { LoginSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/password";
import { getUserSession } from "@/lib/user-session";
import { getUserByEmail } from "@/repositories/user.repo";
import { getTeamsByUserId } from "@/repositories/team.repo";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = LoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  // Find user's first team (personal workspace) for activeTeamId
  const teams = await getTeamsByUserId(user.id);
  const personalTeam = teams.find((t) => t.isPersonal);
  const activeTeamId = personalTeam?.id || teams[0]?.id;

  if (!activeTeamId) {
    return NextResponse.json(
      { error: "No team found for user" },
      { status: 500 },
    );
  }

  // Set user session
  const session = await getUserSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isSystemAdmin = user.isSystemAdmin;
  session.activeTeamId = activeTeamId;
  await session.save();

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSystemAdmin: user.isSystemAdmin,
    activeTeamId,
  });
}
