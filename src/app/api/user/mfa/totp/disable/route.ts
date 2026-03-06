import { NextResponse } from "next/server";
import { TotpDisableSchema } from "@/lib/validators";
import { getCurrentUser, getUserSession } from "@/lib/user-session";
import { getUserById, updateUser } from "@/repositories/user.repo";
import { decrypt } from "@/lib/encryption";
import { verifyTotpToken } from "@/lib/totp";
import { verifyPasswordAndMaybeUpgrade } from "@/lib/password";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = TotpDisableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await getUserById(currentUser.userId);
  if (!user || !user.totpSecretEnc || !user.mfaEnabled) {
    return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
  }

  const passwordResult = await verifyPasswordAndMaybeUpgrade(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!passwordResult.valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const totpValid = verifyTotpToken(
    decrypt(user.totpSecretEnc),
    parsed.data.code,
  );
  if (!totpValid) {
    return NextResponse.json({ error: "Invalid TOTP code" }, { status: 400 });
  }

  await updateUser(user.id, {
    mfaEnabled: false,
    totpSecretEnc: null,
    totpEnabledAt: null,
    ...(passwordResult.upgradedHash
      ? { passwordHash: passwordResult.upgradedHash }
      : {}),
  });

  const session = await getUserSession();
  session.mfaEnabled = false;
  await session.save();

  return NextResponse.json({ ok: true });
}
