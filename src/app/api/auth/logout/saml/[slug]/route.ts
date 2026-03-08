import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getActiveAuthRun } from "@/lib/session";
import { setAuthRunLogoutState } from "@/repositories/auth-run.repo";
import { SAMLHandler } from "@/lib/saml-handler";
import { getSamlLogoutProfileFromRun } from "@/lib/saml-logout";
import { generateOpaqueToken } from "@/lib/token";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const [app, run] = await Promise.all([
    getAppInstanceBySlug(slug),
    getActiveAuthRun(slug),
  ]);

  if (!app || app.protocol !== "SAML") {
    return NextResponse.json({ error: "SAML app not found" }, { status: 404 });
  }
  if (!app.samlLogoutUrl) {
    return NextResponse.json(
      { error: "SAML single logout URL is not configured" },
      { status: 400 },
    );
  }
  if (!run) {
    return NextResponse.json(
      { error: "No active SAML session available" },
      { status: 400 },
    );
  }

  const logoutProfile = getSamlLogoutProfileFromRun(run);
  if (!logoutProfile) {
    return NextResponse.json(
      { error: "The active SAML run does not contain NameID/logout session data" },
      { status: 400 },
    );
  }

  const logoutState = generateOpaqueToken(16);
  await setAuthRunLogoutState(run.id, logoutState);

  const handler = new SAMLHandler(app);
  const logoutUrl = await handler.buildLogoutUrl(
    `${APP_URL}/api/auth/callback/saml/${slug}`,
    `${APP_URL}/api/auth/logout/saml/${slug}/callback`,
    logoutState,
    logoutProfile,
  );

  if (!logoutUrl) {
    return NextResponse.json(
      { error: "SAML single logout is not available for this app" },
      { status: 400 },
    );
  }

  return NextResponse.redirect(logoutUrl);
}
