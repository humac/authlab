import { NextResponse } from "next/server";
import { VerifyEmailResendSchema } from "@/lib/validators";
import { getUserByEmail } from "@/repositories/user.repo";
import { createAuthToken } from "@/repositories/auth-token.repo";
import { sendEmailVerificationLink } from "@/lib/auth-email";

const GENERIC_RESPONSE = {
  message: "If the account exists, a verification email has been sent.",
};

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = VerifyEmailResendSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await getUserByEmail(parsed.data.email.toLowerCase());

  if (user && !user.isVerified) {
    try {
      const token = await createAuthToken({
        userId: user.id,
        purpose: "EMAIL_VERIFY",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await sendEmailVerificationLink({
        email: user.email,
        name: user.name,
        token,
      });
    } catch {
      // Keep response generic to prevent account enumeration.
    }
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
