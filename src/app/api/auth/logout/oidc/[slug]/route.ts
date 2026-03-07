import { NextResponse } from "next/server";
import * as client from "openid-client";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getActiveAuthRun } from "@/lib/session";
import { OIDCHandler } from "@/lib/oidc-handler";
import { setAuthRunLogoutState } from "@/repositories/auth-run.repo";

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

  if (!app || app.protocol !== "OIDC") {
    return NextResponse.json({ error: "OIDC app not found" }, { status: 404 });
  }
  if (!run?.idToken) {
    return NextResponse.json({ error: "No ID token available" }, { status: 400 });
  }

  const logoutState = client.randomState();
  await setAuthRunLogoutState(run.id, logoutState);

  const handler = new OIDCHandler(app);
  const logoutUrl = await handler.buildLogoutUrl(
    run.idToken,
    `${APP_URL}/api/auth/logout/oidc/${slug}/callback`,
    logoutState,
  );

  if (!logoutUrl) {
    return NextResponse.json(
      { error: "Provider does not advertise an end_session_endpoint" },
      { status: 400 },
    );
  }

  return NextResponse.redirect(logoutUrl);
}
