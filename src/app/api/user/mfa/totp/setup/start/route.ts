import { NextResponse } from "next/server";
import { getCurrentUser, getUserSession } from "@/lib/user-session";
import { getUserById } from "@/repositories/user.repo";
import { createTotpSetup } from "@/lib/totp";
import { encrypt } from "@/lib/encryption";

export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserById(currentUser.userId);
  if (!user || !user.isVerified) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const setup = await createTotpSetup({
    accountName: user.email,
    issuer: "AuthLab",
  });

  const session = await getUserSession();
  session.pendingTotpSetup = {
    secretEnc: encrypt(setup.secret),
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  await session.save();

  return NextResponse.json({
    qrCodeDataUrl: setup.qrCodeDataUrl,
    manualKey: setup.secret,
    otpauthUrl: setup.otpauthUrl,
  });
}
