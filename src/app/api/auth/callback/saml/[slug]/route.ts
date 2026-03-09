import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { SAMLHandler } from "@/lib/saml-handler";
import { getState } from "@/lib/state-store";
import { getAppSession, saveAuthResultSession } from "@/lib/session";
import {
  completeAuthRun,
  createAuthRunEvent,
  createAuthRun,
  getAuthRunById,
  markAuthRunFailed,
} from "@/repositories/auth-run.repo";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  let activeRunId: string | null = null;
  try {
    const { slug: expectedSlug } = await params;
    const formData = await request.formData();
    const samlResponse = formData.get("SAMLResponse") as string;
    const relayState = formData.get("RelayState") as string;

    if (!samlResponse) {
      return NextResponse.json(
        { error: "Missing SAMLResponse" },
        { status: 400 },
      );
    }

    // SP-initiated flow should include RelayState; IdP-initiated often does not.
    let slug = expectedSlug;
    if (relayState) {
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

      slug = stateEntry.slug;
      activeRunId = stateEntry.runId ?? null;
      if (slug !== expectedSlug) {
        return NextResponse.json(
          { error: "Callback slug does not match login session" },
          { status: 400 },
        );
      }
    }

    // Load app instance
    const appInstance = await getAppInstanceBySlug(slug);
    if (!appInstance) {
      return NextResponse.json(
        { error: "App instance not found" },
        { status: 404 },
      );
    }
    const run =
      activeRunId
        ? await getAuthRunById(activeRunId)
        : await createAuthRun({
            appInstanceId: appInstance.id,
            protocol: "SAML",
          });
    if (!run) {
      return NextResponse.json(
        { error: "Auth run not found" },
        { status: 404 },
      );
    }
    activeRunId = run.id;

    const callbackUrl = `${APP_URL}/api/auth/callback/saml/${slug}`;

    // Process the callback
    const handler = new SAMLHandler(appInstance);
    const result = await handler.handleCallback(samlResponse, callbackUrl);
    const completedRun = await completeAuthRun(run.id, {
      claims: result.claims,
      rawSamlResponseXml: result.rawXml,
    });
    await createAuthRunEvent({
      authRunId: completedRun.id,
      type: "AUTHENTICATED",
      request: {
        method: "POST",
        endpoint: callbackUrl,
        binding: "HTTP_POST",
        relayStatePresent: Boolean(relayState),
      },
      response: result.rawXml ?? null,
      metadata: {
        claimKeys: Object.keys(result.claims),
        nameId:
          typeof result.claims.NameID === "string" ? result.claims.NameID : null,
      },
    });

    // Store in session
    const session = await getAppSession(slug);
    await saveAuthResultSession(session, {
      runId: completedRun.id,
      slug,
      protocol: "SAML",
      authenticatedAt:
        completedRun.authenticatedAt?.toISOString() ?? new Date().toISOString(),
    });

    return NextResponse.redirect(`${APP_URL}/test/${slug}/inspector`, 303);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected callback error";
    const normalized = message.toLowerCase();
    const isValidationError =
      normalized.includes("saml") ||
      normalized.includes("assertion") ||
      normalized.includes("relaystate") ||
      normalized.includes("inresponseto") ||
      normalized.includes("signature") ||
      normalized.includes("audience") ||
      normalized.includes("destination") ||
      normalized.includes("invalid");

    console.error("SAML callback failed:", message);
    if (activeRunId) {
      await createAuthRunEvent({
        authRunId: activeRunId,
        type: "FAILED",
        status: "FAILED",
        metadata: {
          action: "saml_callback",
          message,
        },
      }).catch(() => undefined);
      await markAuthRunFailed(activeRunId).catch(() => undefined);
    }
    return NextResponse.json(
      {
        error: isValidationError
          ? "SAML validation failed"
          : "SAML callback failed",
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
