import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { createAuthHandler } from "@/lib/auth-factory";
import { setState } from "@/lib/state-store";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const appInstance = await getAppInstanceBySlug(slug);
  if (!appInstance) {
    return NextResponse.json(
      { error: "App instance not found" },
      { status: 404 },
    );
  }

  const handler = createAuthHandler(appInstance);

  const callbackUrl =
    appInstance.protocol === "OIDC"
      ? `${APP_URL}/api/auth/callback/oidc/${slug}`
      : `${APP_URL}/api/auth/callback/saml`;

  const result = await handler.getAuthorizationUrl(callbackUrl);

  // Store state → slug mapping for callback routing
  setState(result.state, {
    slug,
    codeVerifier: result.codeVerifier,
  });

  return NextResponse.redirect(result.url);
}
