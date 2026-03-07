import { NextResponse } from "next/server";
import { clearAppSession } from "@/lib/session";
import {
  getAuthRunByLogoutState,
  markAuthRunLoggedOut,
} from "@/repositories/auth-run.repo";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const state = new URL(request.url).searchParams.get("state");

  if (!state) {
    return NextResponse.json(
      { error: "Missing logout state" },
      { status: 400 },
    );
  }

  const run = await getAuthRunByLogoutState(state);
  if (!run) {
    return NextResponse.json(
      { error: "Invalid logout state" },
      { status: 400 },
    );
  }

  await markAuthRunLoggedOut(run.id);
  await clearAppSession(slug);

  return NextResponse.redirect(`${APP_URL}/test/${slug}`);
}
