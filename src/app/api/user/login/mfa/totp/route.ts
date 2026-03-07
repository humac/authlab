import { NextResponse } from "next/server";
import { LoginMfaTotpSchema } from "@/lib/validators";
import { getUserSession, setAuthenticatedUserSession } from "@/lib/user-session";
import { getUserById } from "@/repositories/user.repo";
import { decrypt } from "@/lib/encryption";
import { verifyTotpToken } from "@/lib/totp";
import {
  checkRateLimit,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";

const MFA_RATE_LIMIT = {
  namespace: "mfa-totp",
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

const MAX_MFA_ATTEMPTS = 5;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(MFA_RATE_LIMIT, ip);
  if (!rl.allowed) {
    return rateLimitExceededResponse(rl.retryAfterMs);
  }

  const body = await request.json();
  const parsed = LoginMfaTotpSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const session = await getUserSession();
  const pending = session.pendingAuth;

  if (!pending || pending.expiresAt < Date.now()) {
    delete session.pendingAuth;
    await session.save();
    return NextResponse.json({ error: "MFA challenge expired" }, { status: 401 });
  }

  const attempts = pending.mfaAttempts ?? 0;
  if (attempts >= MAX_MFA_ATTEMPTS) {
    delete session.pendingAuth;
    await session.save();
    return NextResponse.json(
      { error: "Too many failed MFA attempts. Please log in again." },
      { status: 401 },
    );
  }

  const user = await getUserById(pending.userId);
  if (!user || !user.mfaEnabled || !user.totpSecretEnc || !user.isVerified) {
    delete session.pendingAuth;
    await session.save();
    return NextResponse.json({ error: "MFA challenge invalid" }, { status: 401 });
  }

  const secret = decrypt(user.totpSecretEnc);
  const valid = verifyTotpToken(secret, parsed.data.code);
  if (!valid) {
    pending.mfaAttempts = attempts + 1;
    await session.save();
    return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
  }

  setAuthenticatedUserSession(session, user, pending.activeTeamId);
  delete session.pendingAuth;
  await session.save();

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSystemAdmin: user.isSystemAdmin,
    mustChangePassword: user.mustChangePassword,
    isVerified: user.isVerified,
    mfaEnabled: user.mfaEnabled,
    activeTeamId: pending.activeTeamId,
  });
}
