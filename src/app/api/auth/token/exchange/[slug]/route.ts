import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getAppSession, getActiveAuthRun, saveAuthResultSession } from "@/lib/session";
import { OIDCHandler } from "@/lib/oidc-handler";
import {
  completeAuthRun,
  createAuthRun,
  createAuthRunEvent,
  markAuthRunFailed,
} from "@/repositories/auth-run.repo";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const SUBJECT_TOKEN_TYPES = {
  access_token: "urn:ietf:params:oauth:token-type:access_token",
  id_token: "urn:ietf:params:oauth:token-type:id_token",
} as const;

const REQUESTED_TOKEN_TYPES = new Set([
  "urn:ietf:params:oauth:token-type:access_token",
  "urn:ietf:params:oauth:token-type:refresh_token",
  "urn:ietf:params:oauth:token-type:id_token",
]);

type RequestedTokenType =
  | "urn:ietf:params:oauth:token-type:access_token"
  | "urn:ietf:params:oauth:token-type:refresh_token"
  | "urn:ietf:params:oauth:token-type:id_token";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  let exchangeRunId: string | null = null;
  const { slug } = await params;
  const [app, activeRun] = await Promise.all([
    getAppInstanceBySlug(slug),
    getActiveAuthRun(slug),
  ]);

  if (!app || app.protocol !== "OIDC") {
    return NextResponse.json({ error: "OIDC app not found" }, { status: 404 });
  }
  if (!activeRun) {
    return NextResponse.json(
      { error: "Start and complete an OIDC run before testing token exchange" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const subjectTokenSource =
    body.subjectTokenSource === "id_token" ? "id_token" : "access_token";
  const subjectToken =
    subjectTokenSource === "id_token" ? activeRun.idToken : activeRun.accessToken;

  if (!subjectToken) {
    return NextResponse.json(
      {
        error:
          subjectTokenSource === "id_token"
            ? "No ID token is available on the active run"
            : "No access token is available on the active run",
      },
      { status: 400 },
    );
  }

  const audience =
    typeof body.audience === "string" && body.audience.trim().length > 0
      ? body.audience.trim()
      : "";
  const scope =
    typeof body.scope === "string" && body.scope.trim().length > 0
      ? body.scope.trim()
      : "";
  const requestedTokenType: RequestedTokenType =
    typeof body.requestedTokenType === "string" &&
    REQUESTED_TOKEN_TYPES.has(body.requestedTokenType)
      ? (body.requestedTokenType as RequestedTokenType)
      : "urn:ietf:params:oauth:token-type:access_token";

  try {
    const run = await createAuthRun({
      appInstanceId: app.id,
      protocol: "OIDC",
      grantType: "TOKEN_EXCHANGE",
      runtimeOverrides: {
        ...(audience ? { audience } : {}),
        ...(scope ? { scope } : {}),
        subjectTokenSource,
        requestedTokenType,
      },
      outboundAuthParams: {
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token_type: SUBJECT_TOKEN_TYPES[subjectTokenSource],
        ...(requestedTokenType ? { requested_token_type: requestedTokenType } : {}),
        ...(audience ? { audience } : {}),
        ...(scope ? { scope } : {}),
      },
      oidcSubject: activeRun.oidcSubject,
      oidcSessionId: activeRun.oidcSessionId,
    });
    exchangeRunId = run.id;

    const handler = new OIDCHandler(app);
    const result = await handler.exchangeToken({
      subjectToken,
      subjectTokenType: SUBJECT_TOKEN_TYPES[subjectTokenSource],
      requestedTokenType,
      audience: audience || undefined,
      scope: scope || undefined,
    });
    const oidcSubject =
      typeof result.claims.sub === "string" ? result.claims.sub : activeRun.oidcSubject;
    const oidcSessionId =
      typeof result.claims.sid === "string" ? result.claims.sid : activeRun.oidcSessionId;
    const completedRun = await completeAuthRun(run.id, {
      claims: result.claims,
      rawTokenResponse: result.rawTokenResponse,
      idToken: result.idToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      oidcSubject,
      oidcSessionId,
    });
    await createAuthRunEvent({
      authRunId: completedRun.id,
      type: "TOKEN_EXCHANGED",
      request: {
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token_source: subjectTokenSource,
        subject_token_type: SUBJECT_TOKEN_TYPES[subjectTokenSource],
        requested_token_type: requestedTokenType,
        audience: audience || null,
        scope: scope || null,
      },
      response: result.rawTokenResponse ?? null,
      metadata: {
        sourceRunId: activeRun.id,
        inheritedSubject: activeRun.oidcSubject ?? null,
        oidcSubject,
        oidcSessionId,
      },
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
      error instanceof Error ? error.message : "Token exchange failed";
    if (exchangeRunId) {
      await createAuthRunEvent({
        authRunId: exchangeRunId,
        type: "FAILED",
        status: "FAILED",
        metadata: {
          action: "token_exchange",
          message,
        },
      }).catch(() => undefined);
      await markAuthRunFailed(exchangeRunId).catch(() => undefined);
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
