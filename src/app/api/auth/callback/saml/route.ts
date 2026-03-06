import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { SAMLHandler } from "@/lib/saml-handler";
import { getState } from "@/lib/state-store";
import { getAppSession } from "@/lib/session";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(request: Request) {
  const formData = await request.formData();
  const samlResponse = formData.get("SAMLResponse") as string;
  const relayState = formData.get("RelayState") as string;

  if (!samlResponse) {
    return NextResponse.json(
      { error: "Missing SAMLResponse" },
      { status: 400 },
    );
  }

  if (!relayState) {
    return NextResponse.json(
      {
        error:
          "Missing RelayState. Start SAML from /test/{slug}/login and ensure your IdP preserves RelayState in the response.",
      },
      { status: 400 },
    );
  }

  // Look up RelayState to find slug
  const stateEntry = await getState(relayState);
  if (!stateEntry) {
    return NextResponse.json(
      {
        error:
          "Invalid or expired RelayState. This is often caused by an expired flow, missing state cookie, or IdP not returning RelayState.",
      },
      { status: 400 },
    );
  }

  const { slug } = stateEntry;

  // Load app instance
  const appInstance = await getAppInstanceBySlug(slug);
  if (!appInstance) {
    return NextResponse.json(
      { error: "App instance not found" },
      { status: 404 },
    );
  }

  const callbackUrl = `${APP_URL}/api/auth/callback/saml`;

  // Process the callback
  const handler = new SAMLHandler(appInstance);
  const result = await handler.handleCallback(samlResponse, callbackUrl);

  // Store in session
  const session = await getAppSession(slug);
  session.appSlug = slug;
  session.protocol = "SAML";
  session.claims = result.claims;
  session.rawXml = result.rawXml;
  session.authenticatedAt = new Date().toISOString();
  await session.save();

  return NextResponse.redirect(`${APP_URL}/test/${slug}/inspector`, 303);
}
