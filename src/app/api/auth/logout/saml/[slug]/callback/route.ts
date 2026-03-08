import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { clearAppSession, getActiveAuthRun } from "@/lib/session";
import {
  getAuthRunByLogoutState,
  markAuthRunLoggedOut,
} from "@/repositories/auth-run.repo";
import { SAMLHandler } from "@/lib/saml-handler";
import { getSamlLogoutProfileFromRun, matchesSamlLogoutProfile } from "@/lib/saml-logout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function handleLogout(
  slug: string,
  payload: { relayState: string | null; result: Awaited<ReturnType<SAMLHandler["handleLogoutRedirect"]>> },
) {
  const { relayState, result } = payload;

  if (result.kind === "response") {
    if (!relayState) {
      return NextResponse.json({ error: "Missing logout state" }, { status: 400 });
    }

    const run = await getAuthRunByLogoutState(relayState);
    if (!run) {
      return NextResponse.json({ error: "Invalid logout state" }, { status: 400 });
    }

    await markAuthRunLoggedOut(run.id);
    await clearAppSession(slug);

    return NextResponse.redirect(`${APP_URL}/test/${slug}`);
  }

  const activeRun = await getActiveAuthRun(slug);
  const activeProfile = getSamlLogoutProfileFromRun(activeRun);
  const success = matchesSamlLogoutProfile(activeProfile, result.profile);

  if (success && activeRun) {
    await markAuthRunLoggedOut(activeRun.id);
    await clearAppSession(slug);
  }

  const app = await getAppInstanceBySlug(slug);
  if (!app || app.protocol !== "SAML") {
    return NextResponse.json({ error: "SAML app not found" }, { status: 404 });
  }

  const handler = new SAMLHandler(app);
  const responseUrl = await handler.buildLogoutResponseUrl(
    `${APP_URL}/api/auth/callback/saml/${slug}`,
    `${APP_URL}/api/auth/logout/saml/${slug}/callback`,
    relayState ?? "",
    (result.profile ?? {}) as Record<string, unknown>,
    success,
  );

  return NextResponse.redirect(responseUrl);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const app = await getAppInstanceBySlug(slug);

  if (!app || app.protocol !== "SAML") {
    return NextResponse.json({ error: "SAML app not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  if (!url.searchParams.has("SAMLRequest") && !url.searchParams.has("SAMLResponse")) {
    return NextResponse.json({ error: "Missing SAML logout payload" }, { status: 400 });
  }

  const handler = new SAMLHandler(app);
  const result = await handler.handleLogoutRedirect(
    request.url,
    `${APP_URL}/api/auth/callback/saml/${slug}`,
    `${APP_URL}/api/auth/logout/saml/${slug}/callback`,
  );

  return handleLogout(slug, {
    relayState: url.searchParams.get("RelayState"),
    result,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const app = await getAppInstanceBySlug(slug);

  if (!app || app.protocol !== "SAML") {
    return NextResponse.json({ error: "SAML app not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const payload = {
    SAMLRequest: formData.get("SAMLRequest"),
    SAMLResponse: formData.get("SAMLResponse"),
    RelayState: formData.get("RelayState"),
  };

  if (
    typeof payload.SAMLRequest !== "string" &&
    typeof payload.SAMLResponse !== "string"
  ) {
    return NextResponse.json({ error: "Missing SAML logout payload" }, { status: 400 });
  }

  const handler = new SAMLHandler(app);
  const result = await handler.handleLogoutPost(
    Object.fromEntries(
      Object.entries(payload).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : [],
      ),
    ),
    `${APP_URL}/api/auth/callback/saml/${slug}`,
    `${APP_URL}/api/auth/logout/saml/${slug}/callback`,
  );

  return handleLogout(slug, {
    relayState: typeof payload.RelayState === "string" ? payload.RelayState : null,
    result,
  });
}
