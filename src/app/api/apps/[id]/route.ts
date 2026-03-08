import { NextResponse } from "next/server";
import { UpdateAppInstanceSchema } from "@/lib/validators";
import { validatePemCertificate, validatePemPrivateKey } from "@/lib/pem";
import { getCurrentUser } from "@/lib/user-session";
import { getTeamMembership } from "@/repositories/team.repo";
import {
  getRedactedAppInstanceById,
  updateAppInstance,
  deleteAppInstance,
} from "@/repositories/app-instance.repo";

async function verifyAppAccess(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 } as const;

  const app = await getRedactedAppInstanceById(id);
  if (!app) return { error: "Not found", status: 404 } as const;

  const membership = await getTeamMembership(user.userId, app.teamId);
  if (!membership) return { error: "Not found", status: 404 } as const;

  return { user, app, membership } as const;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await verifyAppAccess(id);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(result.app);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await verifyAppAccess(id);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  const body = await request.json();
  const parsed = UpdateAppInstanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const payload = { ...parsed.data };
    if (payload.spSigningCert) {
      payload.spSigningCert = validatePemCertificate(payload.spSigningCert);
    }
    if (payload.spSigningPrivateKey) {
      payload.spSigningPrivateKey = validatePemPrivateKey(
        payload.spSigningPrivateKey,
      );
    }
    if (
      payload.signAuthnRequests &&
      !result.app.hasSpSigningPrivateKey &&
      !payload.spSigningPrivateKey
    ) {
      return NextResponse.json(
        { error: "Signed SAML requests require a stored signing private key" },
        { status: 400 },
      );
    }
    if (
      payload.signAuthnRequests &&
      !result.app.hasSpSigningCert &&
      !payload.spSigningCert
    ) {
      return NextResponse.json(
        { error: "Signed SAML requests require a stored signing certificate" },
        { status: 400 },
      );
    }

    const app = await updateAppInstance(id, payload);
    return NextResponse.json(app);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("PUT /api/apps/[id] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await verifyAppAccess(id);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  try {
    await deleteAppInstance(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("DELETE /api/apps/[id] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
