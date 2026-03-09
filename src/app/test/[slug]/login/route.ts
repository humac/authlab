import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { createAuthHandler } from "@/lib/auth-factory";
import { decodeSamlRedirectRequest } from "@/lib/auth-trace";
import { setState } from "@/lib/state-store";
import { createAuthRun, createAuthRunEvent } from "@/repositories/auth-run.repo";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function parseRuntimeOverrides(request: Request): Record<string, string> {
  const runtime = new URL(request.url).searchParams.get("runtime");
  if (!runtime) {
    return {};
  }

  try {
    const parsed = JSON.parse(runtime) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : [],
      ),
    );
  } catch {
    return {};
  }
}

export async function GET(
  request: Request,
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
      : `${APP_URL}/api/auth/callback/saml/${slug}`;

  const runtimeOverrides = parseRuntimeOverrides(request);
  const result = await handler.getAuthorizationUrl(callbackUrl, {
    runtimeOverrides,
  });
  const run = await createAuthRun({
    appInstanceId: appInstance.id,
    protocol: appInstance.protocol,
    loginState: result.state,
    nonce: result.nonce,
    runtimeOverrides,
    outboundAuthParams: result.outboundParams,
  });

  // Store state → slug mapping for callback routing
  await setState(result.state, {
    slug,
    runId: run.id,
    codeVerifier: result.codeVerifier ?? undefined,
  });

  const redirectUrl = new URL(result.url);
  const authRequestXml =
    appInstance.protocol === "SAML"
      ? decodeSamlRedirectRequest(redirectUrl.searchParams.get("SAMLRequest") ?? "")
      : null;

  await createAuthRunEvent({
    authRunId: run.id,
    type: "AUTHORIZATION_STARTED",
    request:
      result.traceRequest ??
      {
        method: "GET",
        endpoint: `${redirectUrl.origin}${redirectUrl.pathname}`,
        protocol: appInstance.protocol,
      },
    response:
      result.traceResponse ??
      (appInstance.protocol === "SAML" && authRequestXml
        ? authRequestXml
        : JSON.stringify(
            {
              redirectUrl: result.url,
              parameters: result.outboundParams ?? {},
            },
            null,
            2,
          )),
    metadata: {
      runtimeOverrideKeys: Object.keys(runtimeOverrides),
      ...(result.traceMetadata ?? {}),
    },
  });

  return NextResponse.redirect(result.url);
}
