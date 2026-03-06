import { NextResponse } from "next/server";
import { LoginSchema } from "@/lib/validators";
import { verifyPasswordAndMaybeUpgrade } from "@/lib/password";
import {
  getUserSession,
  setAuthenticatedUserSession,
  clearAuthState,
} from "@/lib/user-session";
import { getUserByEmail, updateUser } from "@/repositories/user.repo";
import { resolveUserActiveTeamId } from "@/lib/auth-login";

const INVALID_LOGIN_RESPONSE = { error: "Invalid email or password" };

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

  const user = await getUserByEmail(email.toLowerCase());
  if (!user) {
    return NextResponse.json(INVALID_LOGIN_RESPONSE, { status: 401 });
  }

  const passwordResult = await verifyPasswordAndMaybeUpgrade(
    password,
    user.passwordHash,
  );
  if (!passwordResult.valid) {
    return NextResponse.json(INVALID_LOGIN_RESPONSE, { status: 401 });
  }

  if (!user.isVerified) {
    return NextResponse.json(INVALID_LOGIN_RESPONSE, { status: 401 });
  }

  if (passwordResult.upgradedHash) {
    await updateUser(user.id, { passwordHash: passwordResult.upgradedHash });
  }

  const activeTeamId = await resolveUserActiveTeamId(user.id);
  if (!activeTeamId) {
    return NextResponse.json(
      { error: "No team found for user" },
      { status: 500 },
    );
  }

  const session = await getUserSession();
  clearAuthState(session);

  if (user.mfaEnabled) {
    delete session.userId;
    delete session.email;
    delete session.name;
    delete session.isSystemAdmin;
    delete session.mustChangePassword;
    delete session.isVerified;
    delete session.mfaEnabled;
    delete session.activeTeamId;

    session.pendingAuth = {
      userId: user.id,
      activeTeamId,
      method: "PASSWORD",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    await session.save();

    return NextResponse.json({ mfaRequired: true, method: "TOTP" });
  }

  setAuthenticatedUserSession(session, user, activeTeamId);
  await session.save();

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSystemAdmin: user.isSystemAdmin,
    mustChangePassword: user.mustChangePassword,
    isVerified: user.isVerified,
    mfaEnabled: user.mfaEnabled,
    activeTeamId,
  });
}
