import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { listUsers } from "@/repositories/user.repo";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  const result = await listUsers(page, limit);
  return NextResponse.json(result);
}
