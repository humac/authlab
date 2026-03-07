import { NextResponse } from "next/server";
import { PasswordResetRequestSchema } from "@/lib/validators";
import { getUserByEmail } from "@/repositories/user.repo";
import { createAuthToken } from "@/repositories/auth-token.repo";
import { sendPasswordResetLink } from "@/lib/auth-email";
import {
  checkRateLimit,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";

const GENERIC_RESPONSE = {
  message: "If an account exists, a password reset email has been sent.",
};

const RESET_RATE_LIMIT = {
  namespace: "password-reset",
  maxAttempts: 3,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(RESET_RATE_LIMIT, ip);
  if (!rl.allowed) {
    return rateLimitExceededResponse(rl.retryAfterMs);
  }

  const body = await request.json();
  const parsed = PasswordResetRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await getUserByEmail(parsed.data.email.toLowerCase());

  if (user && user.isVerified) {
    try {
      const token = await createAuthToken({
        userId: user.id,
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      await sendPasswordResetLink({
        email: user.email,
        name: user.name,
        token,
      });
    } catch {
      // Keep generic outward response.
    }
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
