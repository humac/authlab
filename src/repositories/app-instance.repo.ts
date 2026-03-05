import { getPrisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import type {
  AppInstanceInput,
  DecryptedAppInstance,
  RedactedAppInstance,
} from "@/types/app-instance";
import type { PrismaClient } from "@/generated/prisma/client/client";

const LEGACY_MIGRATION_TEAM_ID = "legacy_migration_team";

type AppInstanceRecord = NonNullable<
  Awaited<ReturnType<PrismaClient["appInstance"]["findUnique"]>>
>;

function decryptRecord(record: AppInstanceRecord): DecryptedAppInstance {
  return {
    ...record,
    clientSecret: record.clientSecret ? decrypt(record.clientSecret) : null,
    idpCert: record.idpCert ? decrypt(record.idpCert) : null,
  };
}

function redactRecord(record: AppInstanceRecord): RedactedAppInstance {
  const { clientSecret, idpCert, ...rest } = record;
  return {
    ...rest,
    hasClientSecret: !!clientSecret,
    hasIdpCert: !!idpCert,
  };
}

export async function createAppInstance(
  data: AppInstanceInput
): Promise<RedactedAppInstance> {
  const prisma = await getPrisma();
  const record = await prisma.appInstance.create({
    data: {
      ...data,
      clientSecret: data.clientSecret ? encrypt(data.clientSecret) : null,
      idpCert: data.idpCert ? encrypt(data.idpCert) : null,
    },
  });
  return redactRecord(record);
}

export async function getAppInstanceBySlug(
  slug: string
): Promise<DecryptedAppInstance | null> {
  const prisma = await getPrisma();
  const record = await prisma.appInstance.findUnique({ where: { slug } });
  if (!record) return null;
  return decryptRecord(record);
}

export async function getAppInstanceById(
  id: string
): Promise<DecryptedAppInstance | null> {
  const prisma = await getPrisma();
  const record = await prisma.appInstance.findUnique({ where: { id } });
  if (!record) return null;
  return decryptRecord(record);
}

export async function listAppInstances(): Promise<RedactedAppInstance[]> {
  const prisma = await getPrisma();
  const records = await prisma.appInstance.findMany({
    orderBy: { createdAt: "desc" },
  });
  return records.map(redactRecord);
}

export async function listAppInstancesByTeam(
  teamId: string,
): Promise<RedactedAppInstance[]> {
  const prisma = await getPrisma();
  const records = await prisma.appInstance.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });
  return records.map(redactRecord);
}

export async function countAppInstances(): Promise<number> {
  const prisma = await getPrisma();
  return prisma.appInstance.count();
}

export async function updateAppInstance(
  id: string,
  data: Partial<AppInstanceInput>
): Promise<RedactedAppInstance> {
  const prisma = await getPrisma();
  const updateData = { ...data };
  if (data.clientSecret !== undefined) {
    updateData.clientSecret = data.clientSecret
      ? encrypt(data.clientSecret)
      : null;
  }
  if (data.idpCert !== undefined) {
    updateData.idpCert = data.idpCert ? encrypt(data.idpCert) : null;
  }
  const record = await prisma.appInstance.update({
    where: { id },
    data: updateData,
  });
  return redactRecord(record);
}

export async function deleteAppInstance(id: string): Promise<void> {
  const prisma = await getPrisma();
  await prisma.appInstance.delete({ where: { id } });
}

export async function getRedactedAppInstanceById(
  id: string
): Promise<RedactedAppInstance | null> {
  const prisma = await getPrisma();
  const record = await prisma.appInstance.findUnique({ where: { id } });
  if (!record) return null;
  return redactRecord(record);
}

export async function claimLegacyMigrationAppsForTeam(
  teamId: string,
): Promise<number> {
  const prisma = await getPrisma();
  const result = await prisma.appInstance.updateMany({
    where: { teamId: LEGACY_MIGRATION_TEAM_ID },
    data: { teamId },
  });
  return result.count;
}
