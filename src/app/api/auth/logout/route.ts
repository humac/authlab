import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/session";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const session = await getAppSession(slug);
  session.destroy();

  return NextResponse.json({ ok: true });
}
