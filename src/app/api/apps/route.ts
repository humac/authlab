import { NextResponse } from "next/server";
import { CreateAppInstanceSchema } from "@/lib/validators";
import { validatePemCertificate, validatePemPrivateKey } from "@/lib/pem";
import { getCurrentUser } from "@/lib/user-session";
import { getTeamMembership } from "@/repositories/team.repo";
import {
  createAppInstance,
  listAppInstancesByTeam,
} from "@/repositories/app-instance.repo";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listAppInstancesByTeam(user.activeTeamId);
  return NextResponse.json(apps);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is a member of the active team
  const membership = await getTeamMembership(user.userId, user.activeTeamId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateAppInstanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const payload = { ...parsed.data };
    if (payload.protocol === "SAML") {
      if (payload.spSigningCert) {
        payload.spSigningCert = validatePemCertificate(payload.spSigningCert);
      }
      if (payload.spSigningPrivateKey) {
        payload.spSigningPrivateKey = validatePemPrivateKey(
          payload.spSigningPrivateKey,
        );
      }
      if (payload.signAuthnRequests && (!payload.spSigningCert || !payload.spSigningPrivateKey)) {
        return NextResponse.json(
          { error: "Signed SAML requests require both a signing certificate and private key" },
          { status: 400 },
        );
      }
    }

    const app = await createAppInstance({
      ...payload,
      teamId: user.activeTeamId,
    });
    return NextResponse.json(app, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { error: "An app with this slug already exists" },
        { status: 409 },
      );
    }
    console.error("POST /api/apps failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
