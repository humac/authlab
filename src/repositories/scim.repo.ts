import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db";
import type { ScimResourceType } from "@/generated/prisma/client/enums";
import type { ScimRequestLog, ScimStoredResource } from "@/types/scim";

type ScimResourceRecord = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof getPrisma>>["scimResource"]["findUnique"]>>
>;

type ScimRequestLogRecord = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof getPrisma>>["scimRequestLog"]["findUnique"]>>
>;

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeResource(record: ScimResourceRecord): ScimStoredResource {
  return {
    id: record.id,
    appInstanceId: record.appInstanceId,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    externalId: record.externalId,
    displayName: record.displayName,
    payload: parseJson<Record<string, unknown>>(record.payloadJson) ?? {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeLog(record: ScimRequestLogRecord): ScimRequestLog {
  return {
    id: record.id,
    appInstanceId: record.appInstanceId,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    method: record.method,
    path: record.path,
    statusCode: record.statusCode,
    request: parseJson<Record<string, unknown>>(record.requestJson),
    response: parseJson<Record<string, unknown>>(record.responseJson),
    createdAt: record.createdAt,
  };
}

export async function listScimResources(
  appInstanceId: string,
  resourceType: ScimResourceType,
): Promise<ScimStoredResource[]> {
  const prisma = await getPrisma();
  const records = await prisma.scimResource.findMany({
    where: { appInstanceId, resourceType },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return records.map(normalizeResource);
}

export async function countScimResources(
  appInstanceId: string,
): Promise<{ users: number; groups: number }> {
  const prisma = await getPrisma();
  const [users, groups] = await Promise.all([
    prisma.scimResource.count({ where: { appInstanceId, resourceType: "USER" } }),
    prisma.scimResource.count({ where: { appInstanceId, resourceType: "GROUP" } }),
  ]);

  return { users, groups };
}

export async function getScimResourceByResourceId(
  appInstanceId: string,
  resourceType: ScimResourceType,
  resourceId: string,
): Promise<ScimStoredResource | null> {
  const prisma = await getPrisma();
  const record = await prisma.scimResource.findUnique({
    where: {
      appInstanceId_resourceType_resourceId: {
        appInstanceId,
        resourceType,
        resourceId,
      },
    },
  });
  return record ? normalizeResource(record) : null;
}

export async function createScimResource(input: {
  appInstanceId: string;
  resourceType: ScimResourceType;
  payload: Record<string, unknown>;
  externalId?: string | null;
  displayName?: string | null;
}): Promise<ScimStoredResource> {
  const prisma = await getPrisma();
  const record = await prisma.scimResource.create({
    data: {
      appInstanceId: input.appInstanceId,
      resourceType: input.resourceType,
      resourceId: randomUUID(),
      externalId: input.externalId ?? null,
      displayName: input.displayName ?? null,
      payloadJson: JSON.stringify(input.payload),
    },
  });
  return normalizeResource(record);
}

export async function updateScimResource(input: {
  appInstanceId: string;
  resourceType: ScimResourceType;
  resourceId: string;
  payload: Record<string, unknown>;
  externalId?: string | null;
  displayName?: string | null;
}): Promise<ScimStoredResource> {
  const prisma = await getPrisma();
  const record = await prisma.scimResource.update({
    where: {
      appInstanceId_resourceType_resourceId: {
        appInstanceId: input.appInstanceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    },
    data: {
      externalId: input.externalId ?? null,
      displayName: input.displayName ?? null,
      payloadJson: JSON.stringify(input.payload),
    },
  });
  return normalizeResource(record);
}

export async function deleteScimResource(
  appInstanceId: string,
  resourceType: ScimResourceType,
  resourceId: string,
): Promise<void> {
  const prisma = await getPrisma();
  await prisma.scimResource.delete({
    where: {
      appInstanceId_resourceType_resourceId: {
        appInstanceId,
        resourceType,
        resourceId,
      },
    },
  });
}

export async function listScimRequestLogs(
  appInstanceId: string,
  limit = 20,
): Promise<ScimRequestLog[]> {
  const prisma = await getPrisma();
  const records = await prisma.scimRequestLog.findMany({
    where: { appInstanceId },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
  return records.map(normalizeLog);
}

export async function createScimRequestLog(input: {
  appInstanceId: string;
  resourceType?: ScimResourceType | null;
  resourceId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  request?: Record<string, unknown> | null;
  response?: Record<string, unknown> | null;
}): Promise<ScimRequestLog> {
  const prisma = await getPrisma();
  const record = await prisma.scimRequestLog.create({
    data: {
      appInstanceId: input.appInstanceId,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      requestJson:
        input.request !== undefined ? JSON.stringify(input.request ?? null) : null,
      responseJson:
        input.response !== undefined ? JSON.stringify(input.response ?? null) : null,
    },
  });
  return normalizeLog(record);
}

