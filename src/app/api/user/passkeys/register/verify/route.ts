import { NextResponse } from "next/server";
import { PasskeyRegistrationSchema } from "@/lib/validators";
import { getCurrentUser, getUserSession } from "@/lib/user-session";
import { createCredential } from "@/repositories/credential.repo";
import { verifyPasskeyRegistration } from "@/lib/webauthn";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = PasskeyRegistrationSchema.safeParse(body);

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
    challenge.purpose !== "REGISTER" ||
    challenge.userId !== currentUser.userId ||
    challenge.expiresAt < Date.now()
  ) {
    delete session.webauthnChallenge;
    await session.save();
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const verification = await verifyPasskeyRegistration({
    response: parsed.data.response,
    expectedChallenge: challenge.challenge,
  }).catch(() => null);

  if (!verification?.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Invalid registration" }, { status: 400 });
  }

  const credentialId = verification.registrationInfo.credential.id;
  const publicKey = Buffer.from(
    verification.registrationInfo.credential.publicKey,
  ).toString("base64url");

  try {
    await createCredential({
      userId: currentUser.userId,
      credentialId,
      publicKey,
      signCount: verification.registrationInfo.credential.counter,
    });
  } catch {
    return NextResponse.json({ error: "Credential already exists" }, { status: 409 });
  }

  delete session.webauthnChallenge;
  await session.save();

  return NextResponse.json({ ok: true });
}
