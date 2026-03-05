import { NextResponse } from "next/server";
import { RegisterSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/password";
import { getUserSession } from "@/lib/user-session";
import { createUser, getUserByEmail, countUsers } from "@/repositories/user.repo";
import { createTeam } from "@/repositories/team.repo";
import { addTeamMember } from "@/repositories/team.repo";
import { claimLegacyMigrationAppsForTeam } from "@/repositories/app-instance.repo";
import { getSetting } from "@/repositories/system-setting.repo";

export async function POST(request: Request) {
  // Check if registration is enabled
  const registrationEnabled = await getSetting("registrationEnabled");
  if (registrationEnabled === "false") {
    return NextResponse.json(
      { error: "Registration is currently disabled" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email, name, password } = parsed.data;

  // Check if email already taken
  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  // First user becomes system admin
  const userCount = await countUsers();
  const isSystemAdmin = userCount === 0;

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    email,
    name,
    passwordHash,
    isSystemAdmin,
    mustChangePassword: false,
  });

  // Create personal team
  const personalTeam = await createTeam({
    name: `${name}'s Workspace`,
    slug: `personal-${user.id}`,
    isPersonal: true,
  });

  await addTeamMember(personalTeam.id, user.id, "OWNER");

  if (isSystemAdmin) {
    await claimLegacyMigrationAppsForTeam(personalTeam.id);
  }

  // Set user session
  const session = await getUserSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isSystemAdmin = user.isSystemAdmin;
  session.mustChangePassword = user.mustChangePassword;
  session.activeTeamId = personalTeam.id;
  await session.save();

  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      isSystemAdmin: user.isSystemAdmin,
      mustChangePassword: user.mustChangePassword,
      activeTeamId: personalTeam.id,
    },
    { status: 201 },
  );
}
