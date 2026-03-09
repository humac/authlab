import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import {
  createAuthRunEvent,
  listBackchannelLogoutCandidates,
  markAuthRunsLoggedOut,
} from "@/repositories/auth-run.repo";
import { clearAppSession, getActiveAuthRun } from "@/lib/session";
import { OIDCHandler } from "@/lib/oidc-handler";

function renderHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Front-channel logout received</title>
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f5f7fb; color: #132238; }
      .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .card { max-width: 560px; border: 1px solid #d8dfeb; background: white; border-radius: 16px; padding: 20px; box-shadow: 0 10px 24px rgba(19,34,56,.06); }
      .eyebrow { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #5c6f87; }
      h1 { margin: 8px 0 10px; font-size: 18px; line-height: 1.35; }
      p { margin: 0; font-size: 14px; line-height: 1.6; color: #5c6f87; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="eyebrow">AuthLab</div>
        <h1>Front-channel logout received</h1>
        <p>${message}</p>
      </div>
    </div>
    <script>
      window.parent?.postMessage({ type: "authlab:frontchannel-logout" }, "*");
    </script>
  </body>
</html>`;
}

async function resolveExpectedIssuer(slug: string): Promise<string | null> {
  const app = await getAppInstanceBySlug(slug);
  if (!app || app.protocol !== "OIDC") {
    return null;
  }

  try {
    const metadata = await new OIDCHandler(app).getDiscoveryMetadata();
    return typeof metadata.issuer === "string" ? metadata.issuer : app.issuerUrl;
  } catch {
    return app.issuerUrl;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const app = await getAppInstanceBySlug(slug);

  if (!app || app.protocol !== "OIDC") {
    return NextResponse.json({ error: "OIDC app not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const sid = url.searchParams.get("sid");
  const issuer = url.searchParams.get("iss");
  const expectedIssuer = await resolveExpectedIssuer(slug);

  if (issuer && expectedIssuer && issuer !== expectedIssuer) {
    return new NextResponse(
      renderHtml("The callback issuer did not match the configured provider issuer, so no runs were invalidated."),
      {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  }

  const sessionRun = await getActiveAuthRun(slug);
  const matchedRuns = sid
    ? await listBackchannelLogoutCandidates({
        appInstanceId: app.id,
        oidcSessionId: sid,
      })
    : sessionRun && sessionRun.protocol === "OIDC"
      ? [sessionRun]
      : [];

  const affectedRunIds = matchedRuns.map((run) => run.id);
  const affectedCount = await markAuthRunsLoggedOut(affectedRunIds);

  await Promise.all(
    matchedRuns.map((run) =>
      createAuthRunEvent({
        authRunId: run.id,
        type: "FRONTCHANNEL_LOGGED_OUT",
        metadata: {
          issuer,
          sid,
          matchedBy: sid ? "sid" : "session",
        },
      }),
    ),
  );

  if (sessionRun && affectedRunIds.includes(sessionRun.id)) {
    await clearAppSession(slug);
  }

  const message =
    affectedCount > 0
      ? `AuthLab invalidated ${affectedCount} matching run${affectedCount === 1 ? "" : "s"} for ${slug}.`
      : "The callback was accepted, but no active AuthLab run matched the provided session context.";

  return new NextResponse(renderHtml(message), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
