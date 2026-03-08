import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getActiveAuthRun } from "@/lib/session";
import { OIDCHandler } from "@/lib/oidc-handler";
import {
  completeAuthRun,
  createAuthRunEvent,
} from "@/repositories/auth-run.repo";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const [app, run] = await Promise.all([
    getAppInstanceBySlug(slug),
    getActiveAuthRun(slug),
  ]);

  if (!app || app.protocol !== "OIDC") {
    return NextResponse.json({ error: "OIDC app not found" }, { status: 404 });
  }
  if (!run?.refreshToken) {
    return NextResponse.json(
      { error: "No refresh token available for this run" },
      { status: 400 },
    );
  }

  try {
    const handler = new OIDCHandler(app);
    const result = await handler.refreshTokens(run.refreshToken);
    const updatedRun = await completeAuthRun(run.id, {
      claims: result.claims,
      rawTokenResponse: result.rawTokenResponse,
      idToken: result.idToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
    });
    await createAuthRunEvent({
      authRunId: run.id,
      type: "REFRESHED",
      request: { grant_type: "refresh_token" },
      response: result.rawTokenResponse ?? null,
      metadata: {
        replacedRefreshToken: result.refreshToken !== run.refreshToken,
      },
    });

    return NextResponse.json({
      run: updatedRun,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Token refresh failed";
    await createAuthRunEvent({
      authRunId: run.id,
      type: "FAILED",
      status: "FAILED",
      metadata: {
        action: "refresh",
        message,
      },
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
