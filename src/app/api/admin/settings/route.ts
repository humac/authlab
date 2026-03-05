import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import {
  getAllSettings,
  setSetting,
} from "@/repositories/system-setting.repo";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getAllSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { key, value } = body;

  if (!key || typeof key !== "string" || typeof value !== "string") {
    return NextResponse.json(
      { error: "key and value are required strings" },
      { status: 400 },
    );
  }

  await setSetting(key, value);
  return NextResponse.json({ ok: true });
}
