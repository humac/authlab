import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import type {
  AppInstanceInput,
  DecryptedAppInstance,
  RedactedAppInstance,
} from "@/types/app-instance";

function decryptRecord(
  record: NonNullable<Awaited<ReturnType<typeof prisma.appInstance.findUnique>>>
): DecryptedAppInstance {
  return {
    ...record,
    clientSecret: record.clientSecret ? decrypt(record.clientSecret) : null,
    idpCert: record.idpCert ? decrypt(record.idpCert) : null,
  };
}

function redactRecord(
  record: NonNullable<Awaited<ReturnType<typeof prisma.appInstance.findUnique>>>
): RedactedAppInstance {
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
  const record = await prisma.appInstance.findUnique({ where: { slug } });
  if (!record) return null;
  return decryptRecord(record);
}

export async function getAppInstanceById(
  id: string
): Promise<DecryptedAppInstance | null> {
  const record = await prisma.appInstance.findUnique({ where: { id } });
  if (!record) return null;
  return decryptRecord(record);
}

export async function listAppInstances(): Promise<RedactedAppInstance[]> {
  const records = await prisma.appInstance.findMany({
    orderBy: { createdAt: "desc" },
  });
  return records.map(redactRecord);
}

export async function updateAppInstance(
  id: string,
  data: Partial<AppInstanceInput>
): Promise<RedactedAppInstance> {
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
  await prisma.appInstance.delete({ where: { id } });
}

export async function getRedactedAppInstanceById(
  id: string
): Promise<RedactedAppInstance | null> {
  const record = await prisma.appInstance.findUnique({ where: { id } });
  if (!record) return null;
  return redactRecord(record);
}
