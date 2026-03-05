import { getPrisma } from "@/lib/db";

export async function getSetting(key: string): Promise<string | null> {
  const prisma = await getPrisma();
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const prisma = await getPrisma();
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const prisma = await getPrisma();
  const settings = await prisma.systemSetting.findMany();
  return Object.fromEntries(settings.map((s) => [s.key, s.value]));
}
