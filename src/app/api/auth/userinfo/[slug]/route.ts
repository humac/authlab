import { NextResponse } from "next/server";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { getActiveAuthRun } from "@/lib/session";
import { createAuthRunEvent, updateAuthRunUserInfo } from "@/repositories/auth-run.repo";
import { OIDCHandler } from "@/lib/oidc-handler";

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
  if (!run?.accessToken) {
    return NextResponse.json(
      { error: "No active access token available" },
      { status: 400 },
    );
  }

  const handler = new OIDCHandler(app);
  const userinfo = await handler.fetchUserInfo(
    run.accessToken,
    typeof run.claims.sub === "string" ? run.claims.sub : undefined,
  );
  const updatedRun = await updateAuthRunUserInfo(run.id, userinfo);
  await createAuthRunEvent({
    authRunId: run.id,
    type: "USERINFO_FETCHED",
    metadata: {
      keys: Object.keys(userinfo),
    },
    response: JSON.stringify(userinfo, null, 2),
  });

  return NextResponse.json({ userinfo: updatedRun.userinfo });
}
