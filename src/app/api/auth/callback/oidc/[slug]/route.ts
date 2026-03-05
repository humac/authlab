import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { OIDCHandler } from "@/lib/oidc-handler";
import { getState } from "@/lib/state-store";
import { getAppSession } from "@/lib/session";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
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
  const stateEntry = getState(state);
  if (!stateEntry) {
    return NextResponse.json(
      { error: "Invalid or expired state parameter" },
      { status: 400 },
    );
  }

  const { slug, codeVerifier } = stateEntry;
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
  session.appSlug = slug;
  session.protocol = "OIDC";
  session.claims = result.claims;
  session.rawToken = result.rawToken;
  session.idToken = result.idToken;
  session.accessToken = result.accessToken;
  session.authenticatedAt = new Date().toISOString();
  await session.save();

  return NextResponse.redirect(`${APP_URL}/test/${slug}/inspector`);
}
