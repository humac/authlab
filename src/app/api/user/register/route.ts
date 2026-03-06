import { NextResponse } from "next/server";
import { RegisterSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/password";
import { createUser, getUserByEmail, countUsers } from "@/repositories/user.repo";
import { createTeam, addTeamMember } from "@/repositories/team.repo";
import { claimLegacyMigrationAppsForTeam } from "@/repositories/app-instance.repo";
import { getSetting } from "@/repositories/system-setting.repo";
import { createAuthToken } from "@/repositories/auth-token.repo";
import { sendEmailVerificationLink } from "@/lib/auth-email";

const GENERIC_RESPONSE = {
  message: "If an account can be created, a verification email has been sent.",
};

export async function POST(request: Request) {
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

  const email = parsed.data.email.toLowerCase();
  const { name, password } = parsed.data;

  const existing = await getUserByEmail(email);
  if (existing) {
    if (!existing.isVerified) {
      try {
        const token = await createAuthToken({
          userId: existing.id,
          purpose: "EMAIL_VERIFY",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        await sendEmailVerificationLink({
          email: existing.email,
          name: existing.name,
          token,
        });
      } catch {
        // Intentionally suppress errors to keep response generic.
      }
    }

    return NextResponse.json(GENERIC_RESPONSE);
  }

  const userCount = await countUsers();
  const isSystemAdmin = userCount === 0;

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    email,
    name,
    passwordHash,
    isSystemAdmin,
    mustChangePassword: false,
    isVerified: false,
    mfaEnabled: false,
  });

  const personalTeam = await createTeam({
    name: `${name}'s Workspace`,
    slug: `personal-${user.id}`,
    isPersonal: true,
  });

  await addTeamMember(personalTeam.id, user.id, "OWNER");

  if (isSystemAdmin) {
    await claimLegacyMigrationAppsForTeam(personalTeam.id);
  }

  try {
    const token = await createAuthToken({
      userId: user.id,
      purpose: "EMAIL_VERIFY",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await sendEmailVerificationLink({
      email: user.email,
      name: user.name,
      token,
    });
  } catch {
    // Intentionally suppress errors to keep response generic.
  }

  return NextResponse.json(GENERIC_RESPONSE, { status: 201 });
}
