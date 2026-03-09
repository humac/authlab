import { getPrisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import type {
  AppInstanceInput,
  DecryptedAppInstance,
  KeyValueParam,
  RedactedAppInstance,
} from "@/types/app-instance";
import type { PrismaClient } from "@/generated/prisma/client/client";

const LEGACY_MIGRATION_TEAM_ID = "legacy_migration_team";

type AppInstanceRecord = NonNullable<
  Awaited<ReturnType<PrismaClient["appInstance"]["findUnique"]>>
>;

function parseCustomAuthParams(value: string | null): KeyValueParam[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const key = "key" in entry ? String(entry.key ?? "").trim() : "";
      const paramValue = "value" in entry ? String(entry.value ?? "") : "";
      return key ? [{ key, value: paramValue }] : [];
    });
  } catch {
    return [];
  }
}

function serializeCustomAuthParams(
  params: KeyValueParam[] | undefined,
): string | null | undefined {
  if (params === undefined) {
    return undefined;
  }

  const normalized = params
    .map((entry) => ({
      key: entry.key.trim(),
      value: entry.value,
    }))
    .filter((entry) => entry.key.length > 0);

  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function decryptRecord(record: AppInstanceRecord): DecryptedAppInstance {
  return {
    ...record,
    clientSecret: record.clientSecret ? decrypt(record.clientSecret) : null,
    idpCert: record.idpCert ? decrypt(record.idpCert) : null,
    spSigningPrivateKey: record.spSigningPrivateKey
      ? decrypt(record.spSigningPrivateKey)
      : null,
    spEncryptionPrivateKey: record.spEncryptionPrivateKey
      ? decrypt(record.spEncryptionPrivateKey)
      : null,
    customAuthParams: parseCustomAuthParams(record.customAuthParamsJson),
  };
}

function redactRecord(record: AppInstanceRecord): RedactedAppInstance {
  const {
    clientSecret,
    idpCert,
    spSigningPrivateKey,
    spEncryptionPrivateKey,
    customAuthParamsJson,
    ...rest
  } = record;
  return {
    ...rest,
    hasClientSecret: !!clientSecret,
    hasIdpCert: !!idpCert,
    hasSpSigningPrivateKey: !!spSigningPrivateKey,
    hasSpSigningCert: !!record.spSigningCert,
    hasSpEncryptionPrivateKey: !!spEncryptionPrivateKey,
    hasSpEncryptionCert: !!record.spEncryptionCert,
    customAuthParams: parseCustomAuthParams(customAuthParamsJson),
  };
}

export async function createAppInstance(
  data: AppInstanceInput
): Promise<RedactedAppInstance> {
  const prisma = await getPrisma();
  const {
    customAuthParams,
    spSigningPrivateKey,
    spEncryptionPrivateKey,
    ...rest
  } = data;
  const record = await prisma.appInstance.create({
    data: {
      ...rest,
      clientSecret: data.clientSecret ? encrypt(data.clientSecret) : null,
      idpCert: data.idpCert ? encrypt(data.idpCert) : null,
      customAuthParamsJson: serializeCustomAuthParams(customAuthParams),
      pkceMode: data.pkceMode ?? "S256",
      spSigningPrivateKey: spSigningPrivateKey
        ? encrypt(spSigningPrivateKey)
        : null,
      spEncryptionPrivateKey: spEncryptionPrivateKey
        ? encrypt(spEncryptionPrivateKey)
        : null,
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
  const updateData: Record<string, unknown> = { ...data };
  if (data.clientSecret !== undefined) {
    updateData.clientSecret = data.clientSecret
      ? encrypt(data.clientSecret)
      : null;
  }
  if (data.idpCert !== undefined) {
    updateData.idpCert = data.idpCert ? encrypt(data.idpCert) : null;
  }
  if (data.customAuthParams !== undefined) {
    updateData.customAuthParamsJson = serializeCustomAuthParams(
      data.customAuthParams,
    );
    delete updateData.customAuthParams;
  }
  if (data.spSigningPrivateKey !== undefined) {
    updateData.spSigningPrivateKey = data.spSigningPrivateKey
      ? encrypt(data.spSigningPrivateKey)
      : null;
  }
  if (data.spEncryptionPrivateKey !== undefined) {
    updateData.spEncryptionPrivateKey = data.spEncryptionPrivateKey
      ? encrypt(data.spEncryptionPrivateKey)
      : null;
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

async function generateCopySlug(
  prisma: PrismaClient,
  sourceSlug: string,
): Promise<string> {
  const base = `${sourceSlug}-copy`;
  let suffix = 1;

  while (true) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const existing = await prisma.appInstance.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    suffix += 1;
  }
}

function generateCopyName(sourceName: string, suffix: number): string {
  return suffix === 1 ? `${sourceName} (Copy)` : `${sourceName} (Copy ${suffix})`;
}

async function generateCopyNameAndSlug(
  prisma: PrismaClient,
  sourceName: string,
  sourceSlug: string,
): Promise<{ name: string; slug: string }> {
  const slug = await generateCopySlug(prisma, sourceSlug);
  const base = `${sourceSlug}-copy`;
  const suffixPart = slug.slice(base.length);
  const suffix = suffixPart.startsWith("-")
    ? Number.parseInt(suffixPart.slice(1), 10) || 1
    : 1;
  return {
    name: generateCopyName(sourceName, suffix),
    slug,
  };
}

export async function moveAppInstanceToTeam(
  id: string,
  targetTeamId: string,
): Promise<RedactedAppInstance> {
  const prisma = await getPrisma();
  const record = await prisma.appInstance.update({
    where: { id },
    data: { teamId: targetTeamId },
  });
  return redactRecord(record);
}

export async function copyAppInstanceToTeam(
  id: string,
  targetTeamId: string,
): Promise<RedactedAppInstance> {
  const prisma = await getPrisma();
  const source = await getAppInstanceById(id);
  if (!source) {
    throw new Error("App instance not found");
  }

  const { name, slug } = await generateCopyNameAndSlug(
    prisma,
    source.name,
    source.slug,
  );

  return createAppInstance({
    name,
    slug,
    protocol: source.protocol,
    teamId: targetTeamId,
    issuerUrl: source.issuerUrl,
    clientId: source.clientId,
    clientSecret: source.clientSecret,
    scopes: source.scopes,
    customAuthParams: source.customAuthParams,
    pkceMode: source.pkceMode,
    usePar: source.usePar,
    entryPoint: source.entryPoint,
    samlLogoutUrl: source.samlLogoutUrl,
    issuer: source.issuer,
    idpCert: source.idpCert,
    nameIdFormat: source.nameIdFormat,
    requestedAuthnContext: source.requestedAuthnContext,
    forceAuthnDefault: source.forceAuthnDefault,
    isPassiveDefault: source.isPassiveDefault,
    samlSignatureAlgorithm: source.samlSignatureAlgorithm,
    clockSkewToleranceSeconds: source.clockSkewToleranceSeconds,
    signAuthnRequests: source.signAuthnRequests,
    spSigningPrivateKey: source.spSigningPrivateKey,
    spSigningCert: source.spSigningCert,
    spEncryptionPrivateKey: source.spEncryptionPrivateKey,
    spEncryptionCert: source.spEncryptionCert,
    buttonColor: source.buttonColor,
  });
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
