import type { ScimResourceType } from "@/generated/prisma/client/enums";

export interface ScimStoredResource {
  id: string;
  appInstanceId: string;
  resourceType: ScimResourceType;
  resourceId: string;
  externalId: string | null;
  displayName: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScimRequestLog {
  id: string;
  appInstanceId: string;
  resourceType: ScimResourceType | null;
  resourceId: string | null;
  method: string;
  path: string;
  statusCode: number;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  createdAt: Date;
}

