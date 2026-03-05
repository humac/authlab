import { getPrisma } from "@/lib/db";

export class SystemSettingSchemaOutOfSyncError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SystemSettingSchemaOutOfSyncError";
  }
}

function matchesMissingSystemSettingTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (code === "P2021") {
    const meta = (error as { meta?: unknown }).meta;
    if (meta && typeof meta === "object") {
      const table = (meta as { table?: unknown }).table;
      const modelName = (meta as { modelName?: unknown }).modelName;
      if (
        (typeof table === "string" && /SystemSetting/i.test(table)) ||
        (typeof modelName === "string" && /SystemSetting/i.test(modelName))
      ) {
        return true;
      }
    }

    // Treat unknown P2021 metadata as schema drift for this repository.
    return true;
  }

  return (
    /no such table/i.test(error.message) && /SystemSetting/i.test(error.message)
  );
}

function isMissingSystemSettingTableError(error: unknown): boolean {
  let current: unknown = error;

  while (current) {
    if (matchesMissingSystemSettingTableError(current)) {
      return true;
    }

    if (!(current instanceof Error) || !("cause" in current)) {
      return false;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export async function getSetting(key: string): Promise<string | null> {
  const prisma = await getPrisma();
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ?? null;
  } catch (error) {
    if (isMissingSystemSettingTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const prisma = await getPrisma();
  try {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  } catch (error) {
    if (isMissingSystemSettingTableError(error)) {
      throw new SystemSettingSchemaOutOfSyncError(
        "System settings table is missing in the database. Apply the latest schema migration to production.",
        { cause: error },
      );
    }
    throw error;
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const prisma = await getPrisma();
  try {
    const settings = await prisma.systemSetting.findMany();
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  } catch (error) {
    if (isMissingSystemSettingTableError(error)) {
      return {};
    }
    throw error;
  }
}
