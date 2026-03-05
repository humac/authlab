import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { UpdateSystemSettingSchema } from "@/lib/validators";
import {
  getAllSettings,
  setSetting,
  SystemSettingSchemaOutOfSyncError,
} from "@/repositories/system-setting.repo";

function schemaOutOfSyncResponse() {
  return NextResponse.json(
    {
      error: "System settings schema is out of sync with this deployment.",
      hint: 'Create the "SystemSetting" table in Turso and apply the latest schema migration.',
    },
    { status: 503 },
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const settings = await getAllSettings();
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof SystemSettingSchemaOutOfSyncError) {
      return schemaOutOfSyncResponse();
    }

    console.error("Failed to load system settings", error);
    return NextResponse.json(
      { error: "Failed to load system settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = UpdateSystemSettingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await setSetting(parsed.data.key, parsed.data.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SystemSettingSchemaOutOfSyncError) {
      return schemaOutOfSyncResponse();
    }

    console.error("Failed to update system settings", error);
    return NextResponse.json(
      { error: "Failed to update system settings" },
      { status: 500 },
    );
  }
}
