import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { UpdateEmailProviderSchema } from "@/lib/validators";
import {
  getMaskedEmailProviderConfig,
  saveEmailProviderConfig,
} from "@/lib/email-provider";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getMaskedEmailProviderConfig();
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = UpdateEmailProviderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await saveEmailProviderConfig(parsed.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save config" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
