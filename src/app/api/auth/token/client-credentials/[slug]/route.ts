import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getAppSession, saveAuthResultSession } from "@/lib/session";
import { OIDCHandler } from "@/lib/oidc-handler";
import {
  completeAuthRun,
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
    const run = await createAuthRun({
      appInstanceId: app.id,
      protocol: "OIDC",
      grantType: "CLIENT_CREDENTIALS",
      runtimeOverrides: scopes ? { scope: scopes } : {},
      outboundAuthParams: scopes ? { scope: scopes } : {},
    });
    const handler = new OIDCHandler(app);
    const result = await handler.exchangeClientCredentials(scopes || undefined);
    const completedRun = await completeAuthRun(run.id, {
      claims: result.claims,
      rawTokenResponse: result.rawTokenResponse,
      idToken: result.idToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
    });
    await createAuthRunEvent({
      authRunId: completedRun.id,
      type: "CLIENT_CREDENTIALS_ISSUED",
      request: {
        grant_type: "client_credentials",
        scope: scopes || null,
      },
      response: result.rawTokenResponse ?? null,
    });

    const session = await getAppSession(slug);
    await saveAuthResultSession(session, {
      runId: completedRun.id,
      slug,
      protocol: "OIDC",
      authenticatedAt:
        completedRun.authenticatedAt?.toISOString() ?? new Date().toISOString(),
    });

    return NextResponse.json({
      redirectTo: `${APP_URL}/test/${slug}/inspector`,
      runId: completedRun.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Client credentials exchange failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
