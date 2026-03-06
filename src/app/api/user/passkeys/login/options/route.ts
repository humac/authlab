import { NextResponse } from "next/server";
import { PasskeyLoginOptionsSchema } from "@/lib/validators";
import { getUserSession } from "@/lib/user-session";
import { getUserByEmail } from "@/repositories/user.repo";
import { listCredentialsByUser } from "@/repositories/credential.repo";
import { createPasskeyAuthenticationOptions } from "@/lib/webauthn";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = PasskeyLoginOptionsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let credentialIds: string[] | undefined;
  const email = parsed.data.email?.toLowerCase();

  if (email) {
    const user = await getUserByEmail(email);
    if (user) {
      const credentials = await listCredentialsByUser(user.id);
      credentialIds = credentials.map((credential) => credential.credentialId);
    }
  }

  const options = await createPasskeyAuthenticationOptions(credentialIds);

  const session = await getUserSession();
  session.webauthnChallenge = {
    challenge: options.challenge,
    purpose: "LOGIN",
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  await session.save();

  return NextResponse.json(options);
}
