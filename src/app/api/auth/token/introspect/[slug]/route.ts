import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getActiveAuthRun } from "@/lib/session";
import { OIDCHandler } from "@/lib/oidc-handler";
import {
  completeAuthRun,
  createAuthRunEvent,
} from "@/repositories/auth-run.repo";

type TokenTypeHint = "access_token" | "refresh_token";

export async function POST(
  request: Request,
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
  if (!run) {
    return NextResponse.json({ error: "No active auth run found" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const target =
    body && typeof body.target === "string" && body.target === "refresh_token"
      ? ("refresh_token" as TokenTypeHint)
      : ("access_token" as TokenTypeHint);
  const token = target === "refresh_token" ? run.refreshToken : run.accessToken;
  if (!token) {
    return NextResponse.json(
      { error: `No ${target.replace("_", " ")} available for this run` },
      { status: 400 },
    );
  }

  try {
    const handler = new OIDCHandler(app);
    const introspection = await handler.introspectToken(token, target);
    const updatedRun = await completeAuthRun(run.id, {
      lastIntrospection: introspection,
    });
    await createAuthRunEvent({
      authRunId: run.id,
      type: "INTROSPECTED",
      request: { token_type_hint: target },
      response: JSON.stringify(introspection, null, 2),
      metadata: {
        active:
          "active" in introspection ? Boolean(introspection.active) : null,
      },
    });

    return NextResponse.json({
      introspection: updatedRun.lastIntrospection,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Token introspection failed";
    await createAuthRunEvent({
      authRunId: run.id,
      type: "FAILED",
      status: "FAILED",
      metadata: {
        action: "introspection",
        message,
      },
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
