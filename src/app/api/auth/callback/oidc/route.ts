import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { OIDCHandler } from "@/lib/oidc-handler";
import { getState } from "@/lib/state-store";
import { getAppSession, saveAuthResultSession } from "@/lib/session";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: Request) {
  try {
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

    const { slug, codeVerifier } = stateEntry;
    if (!codeVerifier) {
      return NextResponse.json(
        { error: "Missing code verifier for OIDC flow" },
        { status: 400 },
      );
    }

    // Load app instance
    const appInstance = await getAppInstanceBySlug(slug);
    if (!appInstance) {
      return NextResponse.json(
        { error: "App instance not found" },
        { status: 404 },
      );
    }

    // Process the callback
    const handler = new OIDCHandler(appInstance);
    const result = await handler.handleCallback(url, codeVerifier, state);

    // Store in session
    const session = await getAppSession(slug);
    await saveAuthResultSession(session, {
      slug,
      protocol: "OIDC",
      claims: result.claims,
      rawToken: result.rawToken,
      idToken: result.idToken,
      accessToken: result.accessToken,
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
