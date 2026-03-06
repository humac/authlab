import { NextResponse } from "next/server";
import { TotpSetupVerifySchema } from "@/lib/validators";
import { decrypt } from "@/lib/encryption";
import { verifyTotpToken } from "@/lib/totp";
import { getCurrentUser, getUserSession } from "@/lib/user-session";
import { updateUser } from "@/repositories/user.repo";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = TotpSetupVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const session = await getUserSession();
  const pending = session.pendingTotpSetup;
  if (!pending || pending.expiresAt < Date.now()) {
    delete session.pendingTotpSetup;
    await session.save();
    return NextResponse.json({ error: "TOTP setup expired" }, { status: 400 });
  }

  const secret = decrypt(pending.secretEnc);
  const valid = verifyTotpToken(secret, parsed.data.code);
  if (!valid) {
    return NextResponse.json({ error: "Invalid TOTP code" }, { status: 400 });
  }

  const now = new Date();
  await updateUser(currentUser.userId, {
    mfaEnabled: true,
    totpSecretEnc: pending.secretEnc,
    totpEnabledAt: now,
  });

  session.mfaEnabled = true;
  delete session.pendingTotpSetup;
  await session.save();

  return NextResponse.json({ ok: true });
}
