import { NextResponse } from "next/server";
import { getCurrentUser, getUserSession } from "@/lib/user-session";
import { getUserById } from "@/repositories/user.repo";
import { listCredentialsByUser } from "@/repositories/credential.repo";
import { createPasskeyRegistrationOptions } from "@/lib/webauthn";

export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserById(currentUser.userId);
  if (!user || !user.isVerified) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingCredentials = await listCredentialsByUser(user.id);

  const options = await createPasskeyRegistrationOptions({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    excludeCredentialIds: existingCredentials.map((credential) => credential.credentialId),
  });

  const session = await getUserSession();
  session.webauthnChallenge = {
    challenge: options.challenge,
    purpose: "REGISTER",
    userId: user.id,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  await session.save();

  return NextResponse.json(options);
}
