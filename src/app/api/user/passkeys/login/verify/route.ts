import { NextResponse } from "next/server";
import { PasskeyAssertionSchema } from "@/lib/validators";
import {
  getUserSession,
  clearAuthState,
  setAuthenticatedUserSession,
} from "@/lib/user-session";
import {
  getCredentialByCredentialId,
  updateCredentialCounter,
} from "@/repositories/credential.repo";
import { getUserById } from "@/repositories/user.repo";
import { resolveUserActiveTeamId } from "@/lib/auth-login";
import { verifyPasskeyAuthentication } from "@/lib/webauthn";

function getCredentialIdFromAssertion(response: unknown): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const id = (response as { id?: unknown }).id;
  if (typeof id === "string") {
    return id;
  }

  return null;
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = PasskeyAssertionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const session = await getUserSession();
  const challenge = session.webauthnChallenge;
  if (
    !challenge ||
    challenge.purpose !== "LOGIN" ||
    challenge.expiresAt < Date.now()
  ) {
    delete session.webauthnChallenge;
    await session.save();
    return NextResponse.json({ error: "Challenge expired" }, { status: 401 });
  }

  const credentialId = getCredentialIdFromAssertion(parsed.data.response);
  if (!credentialId) {
    return NextResponse.json({ error: "Invalid assertion" }, { status: 400 });
  }

  const credential = await getCredentialByCredentialId(credentialId);
  if (!credential) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const verification = await verifyPasskeyAuthentication({
    response: parsed.data.response,
    expectedChallenge: challenge.challenge,
    credential: {
      id: credential.credentialId,
      publicKey: credential.publicKey,
      signCount: credential.signCount,
    },
  }).catch(() => null);

  if (!verification?.verified) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await updateCredentialCounter({
    id: credential.id,
    signCount: verification.authenticationInfo.newCounter,
  });

  const user = await getUserById(credential.userId);
  if (!user || !user.isVerified) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const activeTeamId = await resolveUserActiveTeamId(user.id);
  if (!activeTeamId) {
    return NextResponse.json({ error: "No team found for user" }, { status: 500 });
  }

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
      method: "PASSKEY",
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
