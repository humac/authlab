import { NextResponse } from "next/server";
import { clearAppSession, getAppSession } from "@/lib/session";
import { markAuthRunLoggedOut } from "@/repositories/auth-run.repo";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const session = await getAppSession(slug);
  if (session.runId) {
    await markAuthRunLoggedOut(session.runId).catch(() => undefined);
  }
  await clearAppSession(slug);

  return NextResponse.json({ ok: true });
}
