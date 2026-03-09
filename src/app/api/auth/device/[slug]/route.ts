import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getAppSession, saveAuthResultSession } from "@/lib/session";
import { OIDCHandler } from "@/lib/oidc-handler";
import {
  createAuthRun,
  createAuthRunEvent,
} from "@/repositories/auth-run.repo";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const app = await getAppInstanceBySlug(slug);

  if (!app || app.protocol !== "OIDC") {
    return NextResponse.json({ error: "OIDC app not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const scopes =
    body && typeof body.scopes === "string" ? body.scopes.trim() : "";

  try {
    const handler = new OIDCHandler(app);
    const deviceAuthorization = await handler.initiateDeviceAuthorization(
      scopes || undefined,
    );
    const run = await createAuthRun({
      appInstanceId: app.id,
      protocol: "OIDC",
      grantType: "DEVICE_AUTHORIZATION",
      runtimeOverrides: scopes ? { scope: scopes } : {},
      outboundAuthParams: scopes ? { scope: scopes } : {},
    });

    await createAuthRunEvent({
      authRunId: run.id,
      type: "DEVICE_AUTHORIZATION_STARTED",
      request: {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        scope: scopes || null,
      },
      response: deviceAuthorization.rawResponse,
      metadata: {
        deviceCode: deviceAuthorization.deviceCode,
        userCode: deviceAuthorization.userCode,
        verificationUri: deviceAuthorization.verificationUri,
        verificationUriComplete: deviceAuthorization.verificationUriComplete,
        expiresIn: deviceAuthorization.expiresIn,
        interval: deviceAuthorization.interval,
        requestedScopes: scopes || null,
        startedAt: new Date().toISOString(),
      },
    });

    const session = await getAppSession(slug);
    await saveAuthResultSession(session, {
      runId: run.id,
      slug,
      protocol: "OIDC",
      authenticatedAt: run.createdAt.toISOString(),
    });

    return NextResponse.json({
      redirectTo: `${APP_URL}/test/${slug}/inspector`,
      runId: run.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Device authorization request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
