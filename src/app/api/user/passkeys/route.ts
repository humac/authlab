import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { listCredentialsByUser } from "@/repositories/credential.repo";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await listCredentialsByUser(currentUser.userId);

  return NextResponse.json({
    credentials: credentials.map((credential) => ({
      id: credential.id,
      credentialId: credential.credentialId,
      createdAt: credential.createdAt,
      lastUsedAt: credential.lastUsedAt,
    })),
  });
}
