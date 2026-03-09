import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getActiveAuthRun } from "@/lib/session";
import { OIDCHandler } from "@/lib/oidc-handler";
import { getLatestDeviceAuthorizationSnapshot } from "@/lib/oidc-device-flow";
import {
  completeAuthRun,
  createAuthRunEvent,
  listAuthRunEvents,
  markAuthRunFailed,
} from "@/repositories/auth-run.repo";

export async function POST(
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
  if (!run || run.grantType !== "DEVICE_AUTHORIZATION" || run.status !== "PENDING") {
    return NextResponse.json(
      { error: "No active device authorization run found" },
      { status: 400 },
    );
  }

  const events = await listAuthRunEvents(run.id);
  const snapshot = getLatestDeviceAuthorizationSnapshot(events);
  if (!snapshot) {
    return NextResponse.json(
      { error: "Device authorization details were not retained for this run" },
      { status: 400 },
    );
  }

  try {
    const handler = new OIDCHandler(app);
    const pollResult = await handler.pollDeviceAuthorization({
      deviceCode: snapshot.deviceCode,
      expiresIn: snapshot.expiresIn,
      interval: snapshot.interval,
    });

    if (pollResult.status === "pending" || pollResult.status === "slow_down") {
      return NextResponse.json(
        {
          pending: true,
          status: pollResult.status,
          error: pollResult.error ?? null,
          pollAfterSeconds: pollResult.interval ?? snapshot.interval ?? 5,
        },
        { status: 202 },
      );
    }

    const result = pollResult.result;
    if (!result) {
      return NextResponse.json(
        { error: "Device authorization poll completed without a token response" },
        { status: 400 },
      );
    }

    const oidcSubject =
      typeof result.claims.sub === "string" ? result.claims.sub : null;
    const oidcSessionId =
      typeof result.claims.sid === "string" ? result.claims.sid : null;
    const completedRun = await completeAuthRun(run.id, {
      claims: result.claims,
      rawTokenResponse: result.rawTokenResponse,
      idToken: result.idToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      oidcSubject,
      oidcSessionId,
    });
    await createAuthRunEvent({
      authRunId: run.id,
      type: "DEVICE_AUTHORIZATION_COMPLETED",
      request: {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      response: result.rawTokenResponse ?? null,
      metadata: {
        oidcSubject,
        oidcSessionId,
      },
    });

    return NextResponse.json({
      pending: false,
      run: completedRun,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Device authorization polling failed";
    await createAuthRunEvent({
      authRunId: run.id,
      type: "FAILED",
      status: "FAILED",
      metadata: {
        action: "device_authorization_poll",
        message,
      },
    }).catch(() => undefined);
    await markAuthRunFailed(run.id).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
