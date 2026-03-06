import { NextResponse } from "next/server";
import { PasswordResetCompleteSchema } from "@/lib/validators";
import { consumeAuthToken } from "@/repositories/auth-token.repo";
import { hashPassword } from "@/lib/password";
import { updateUser } from "@/repositories/user.repo";
import { decrypt } from "@/lib/encryption";
import { verifyTotpToken } from "@/lib/totp";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = PasswordResetCompleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const consumed = await consumeAuthToken({
    token: parsed.data.token,
    purpose: "PASSWORD_RESET",
  });

  if (!consumed) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const user = consumed.user;

  if (user.mfaEnabled) {
    if (!user.totpSecretEnc || !parsed.data.totpCode) {
      return NextResponse.json({ error: "TOTP code is required" }, { status: 400 });
    }

    const validTotp = verifyTotpToken(
      decrypt(user.totpSecretEnc),
      parsed.data.totpCode,
    );
    if (!validTotp) {
      return NextResponse.json({ error: "Invalid TOTP code" }, { status: 400 });
    }
  }

  await updateUser(user.id, {
    passwordHash: await hashPassword(parsed.data.newPassword),
    mustChangePassword: false,
  });

  return NextResponse.json({ ok: true });
}
