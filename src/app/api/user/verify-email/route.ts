import { NextResponse } from "next/server";
import { consumeAuthToken } from "@/repositories/auth-token.repo";
import { updateUser } from "@/repositories/user.repo";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const consumed = await consumeAuthToken({
    token,
    purpose: "EMAIL_VERIFY",
  });

  if (!consumed) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  await updateUser(consumed.userId, { isVerified: true });

  return NextResponse.json({ ok: true });
}
