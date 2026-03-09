import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { validateOidcBackchannelLogoutToken } from "@/lib/oidc-backchannel-logout";
import {
  createAuthRunEvent,
  listBackchannelLogoutCandidates,
  markAuthRunsLoggedOut,
} from "@/repositories/auth-run.repo";

async function readLogoutToken(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  const rawBody = await request.text();

  if (!rawBody) {
    return null;
  }

  if (contentType.includes("application/json")) {
    try {
      const body = JSON.parse(rawBody) as { logout_token?: unknown };
      return typeof body.logout_token === "string" ? body.logout_token : null;
    } catch {
      return null;
    }
  }

  const params = new URLSearchParams(rawBody);
  const logoutToken = params.get("logout_token");
  return logoutToken && logoutToken.trim().length > 0 ? logoutToken : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const app = await getAppInstanceBySlug(slug);

  if (!app || app.protocol !== "OIDC") {
    return NextResponse.json({ error: "OIDC app not found" }, { status: 404 });
  }

  const logoutToken = await readLogoutToken(request);
  if (!logoutToken) {
    return NextResponse.json(
      { error: "Missing logout_token" },
      { status: 400 },
    );
  }

  try {
    const payload = await validateOidcBackchannelLogoutToken(app, logoutToken);
    const runs = await listBackchannelLogoutCandidates({
      appInstanceId: app.id,
      oidcSessionId: payload.sessionId,
      oidcSubject: payload.subject,
    });

    if (runs.length > 0) {
      await markAuthRunsLoggedOut(runs.map((run) => run.id));
      await Promise.all(
        runs.map((run) =>
          createAuthRunEvent({
            authRunId: run.id,
            type: "BACKCHANNEL_LOGGED_OUT",
            metadata: {
              oidcSessionId: payload.sessionId,
              oidcSubject: payload.subject,
              logoutTokenJti: payload.jwtId,
              logoutTokenIssuedAt: payload.issuedAt,
              signatureAlgorithm: payload.algorithm,
            },
          }),
        ),
      );
    }

    return NextResponse.json({
      acknowledged: true,
      matchedRuns: runs.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "OIDC back-channel logout validation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
