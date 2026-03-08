import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { OIDCHandler } from "@/lib/oidc-handler";
import { computeExpectedOidcHashClaim } from "@/lib/oidc-token-validation";
import { getState } from "@/lib/state-store";
import { getAppSession, saveAuthResultSession } from "@/lib/session";
import {
  completeAuthRun,
  createAuthRunEvent,
  getAuthRunById,
  markAuthRunFailed,
} from "@/repositories/auth-run.repo";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  let activeRunId: string | null = null;
  try {
    const { slug: expectedSlug } = await params;
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const errorDescription =
        url.searchParams.get("error_description") || "Unknown error";
      return NextResponse.json(
        { error, description: errorDescription },
        { status: 400 },
      );
    }

    if (!state) {
      return NextResponse.json(
        { error: "Missing state parameter" },
        { status: 400 },
      );
    }

    // Look up state to find slug and code verifier
    const stateEntry = await getState(state);
    if (!stateEntry) {
      return NextResponse.json(
        { error: "Invalid or expired state parameter" },
        { status: 400 },
      );
    }

    const { slug, codeVerifier, runId } = stateEntry;
    if (slug !== expectedSlug) {
      return NextResponse.json(
        { error: "Callback slug does not match login session" },
        { status: 400 },
      );
    }
    if (!codeVerifier) {
      return NextResponse.json(
        { error: "Missing code verifier for OIDC flow" },
        { status: 400 },
      );
    }
    if (!runId) {
      return NextResponse.json(
        { error: "Missing auth run for OIDC flow" },
        { status: 400 },
      );
    }
    activeRunId = runId;

    // Load app instance
    const appInstance = await getAppInstanceBySlug(slug);
    if (!appInstance) {
      return NextResponse.json(
        { error: "App instance not found" },
        { status: 404 },
      );
    }
    const run = await getAuthRunById(runId);
    if (!run) {
      return NextResponse.json(
        { error: "Auth run not found" },
        { status: 404 },
      );
    }

    // Process the callback
    const handler = new OIDCHandler(appInstance);
    const result = await handler.handleCallback(
      url,
      codeVerifier,
      state,
      run.nonce || undefined,
    );
    const authorizationCode = url.searchParams.get("code");
    const expectedCHash =
      result.idToken && authorizationCode
        ? await computeExpectedOidcHashClaim(authorizationCode, result.idToken)
        : null;
    const completedRun = await completeAuthRun(run.id, {
      claims: result.claims,
      rawTokenResponse: result.rawTokenResponse,
      idToken: result.idToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      nonceStatus: result.nonceStatus,
    });
    await createAuthRunEvent({
      authRunId: completedRun.id,
      type: "AUTHENTICATED",
      request: {
        grant_type: "authorization_code",
      },
      response: result.rawTokenResponse ?? null,
      metadata: {
        nonceStatus: result.nonceStatus ?? null,
        expectedCHash,
      },
    });

    // Store in session
    const session = await getAppSession(slug);
    await saveAuthResultSession(session, {
      runId: completedRun.id,
      slug,
      protocol: "OIDC",
      authenticatedAt:
        completedRun.authenticatedAt?.toISOString() ?? new Date().toISOString(),
    });

    return NextResponse.redirect(`${APP_URL}/test/${slug}/inspector`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected callback error";
    const normalized = message.toLowerCase();
    const isValidationError =
      normalized.includes("invalid") ||
      normalized.includes("issuer") ||
      normalized.includes("audience") ||
      normalized.includes("nonce") ||
      normalized.includes("state") ||
      normalized.includes("code");

    console.error("OIDC callback failed", error);
    if (activeRunId) {
      await createAuthRunEvent({
        authRunId: activeRunId,
        type: "FAILED",
        status: "FAILED",
        metadata: { message },
      }).catch(() => undefined);
      await markAuthRunFailed(activeRunId).catch(() => undefined);
    }
    return NextResponse.json(
      {
        error: isValidationError
          ? `OIDC validation failed: ${message}`
          : "OIDC callback failed",
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
