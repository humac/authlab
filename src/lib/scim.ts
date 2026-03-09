import { createHmac, timingSafeEqual } from "node:crypto";
import type { DecryptedAppInstance } from "@/types/app-instance";
import type { ScimResourceType } from "@/generated/prisma/client/enums";
import type { ScimStoredResource } from "@/types/scim";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const LIST_RESPONSE_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const PATCH_OP_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

function getSigningKey(): Buffer {
  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("MASTER_ENCRYPTION_KEY is required for SCIM bearer token derivation");
  }
  return Buffer.from(raw, "hex");
}

function normalizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeObject(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        normalizeObject(nested),
      ]),
    );
  }

  return value;
}

function getCoreSchema(resourceType: ScimResourceType): string {
  return resourceType === "USER" ? USER_SCHEMA : GROUP_SCHEMA;
}

export function deriveScimBearerToken(appId: string): string {
  return createHmac("sha256", getSigningKey()).update(`scim:${appId}`).digest("hex");
}

export function verifyScimBearerToken(
  appId: string,
  authHeader: string | null,
): boolean {
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const expected = Buffer.from(deriveScimBearerToken(appId), "utf8");
  const actual = Buffer.from(authHeader.slice("Bearer ".length).trim(), "utf8");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

export function buildScimBaseUrl(slug: string): string {
  return `${APP_URL}/api/scim/${slug}`;
}

export function buildScimResourceLocation(
  slug: string,
  resourceType: ScimResourceType,
  resourceId: string,
): string {
  return `${buildScimBaseUrl(slug)}/${resourceType === "USER" ? "Users" : "Groups"}/${resourceId}`;
}

export function buildScimResourceResponse(input: {
  slug: string;
  resourceType: ScimResourceType;
  resource: ScimStoredResource;
}) {
  const schema = getCoreSchema(input.resourceType);
  const payload = normalizeObject(input.resource.payload) as Record<string, unknown>;
  return {
    ...payload,
    schemas: [schema],
    id: input.resource.resourceId,
    externalId: input.resource.externalId ?? undefined,
    meta: {
      resourceType: input.resourceType === "USER" ? "User" : "Group",
      created: input.resource.createdAt.toISOString(),
      lastModified: input.resource.updatedAt.toISOString(),
      location: buildScimResourceLocation(
        input.slug,
        input.resourceType,
        input.resource.resourceId,
      ),
    },
  };
}

export function buildScimListResponse(input: {
  resources: Array<Record<string, unknown>>;
  startIndex?: number;
  count?: number;
}) {
  const startIndex = input.startIndex && input.startIndex > 0 ? input.startIndex : 1;
  const count = input.count && input.count > 0 ? input.count : input.resources.length || 100;
  const start = startIndex - 1;
  const resources = input.resources.slice(start, start + count);

  return {
    schemas: [LIST_RESPONSE_SCHEMA],
    totalResults: input.resources.length,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

export function parseScimListParams(url: URL): {
  startIndex: number;
  count: number;
  filter: string | null;
} {
  const startIndex = Number.parseInt(url.searchParams.get("startIndex") ?? "1", 10);
  const count = Number.parseInt(url.searchParams.get("count") ?? "100", 10);
  return {
    startIndex: Number.isFinite(startIndex) && startIndex > 0 ? startIndex : 1,
    count: Number.isFinite(count) && count > 0 ? count : 100,
    filter: url.searchParams.get("filter"),
  };
}

export function filterScimResources(
  resources: ScimStoredResource[],
  filter: string | null,
): ScimStoredResource[] {
  if (!filter) {
    return resources;
  }

  const match = filter.match(/^(userName|displayName|externalId)\s+eq\s+"([^"]+)"$/i);
  if (!match) {
    return resources;
  }

  const [, rawField, expected] = match;
  const field = rawField.toLowerCase();

  return resources.filter((resource) => {
    const payload = resource.payload;
    if (field === "externalid") {
      return resource.externalId === expected;
    }

    if (field === "username") {
      return typeof payload.userName === "string" && payload.userName === expected;
    }

    return resource.displayName === expected;
  });
}

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown) {
  let cursor: Record<string, unknown> = target;

  for (const segment of path.slice(0, -1)) {
    const existing = cursor[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[path[path.length - 1]!] = normalizeObject(value);
}

function removeNestedValue(target: Record<string, unknown>, path: string[]) {
  let cursor: Record<string, unknown> = target;

  for (const segment of path.slice(0, -1)) {
    const existing = cursor[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      return;
    }
    cursor = existing as Record<string, unknown>;
  }

  delete cursor[path[path.length - 1]!];
}

export function applyScimPatch(
  payload: Record<string, unknown>,
  operations: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const next = structuredClone(normalizeObject(payload)) as Record<string, unknown>;

  for (const operation of operations) {
    const op = typeof operation.op === "string" ? operation.op.toLowerCase() : "";
    const path =
      typeof operation.path === "string" && operation.path.trim().length > 0
        ? operation.path
            .split(".")
            .map((segment) => segment.trim())
            .filter(Boolean)
        : [];

    if (op === "remove" && path.length > 0) {
      removeNestedValue(next, path);
      continue;
    }

    if ((op === "add" || op === "replace") && path.length === 0) {
      if (operation.value && typeof operation.value === "object" && !Array.isArray(operation.value)) {
        Object.assign(next, normalizeObject(operation.value));
      }
      continue;
    }

    if ((op === "add" || op === "replace") && path.length > 0) {
      setNestedValue(next, path, operation.value);
    }
  }

  return next;
}

export function getScimDisplayName(
  resourceType: ScimResourceType,
  payload: Record<string, unknown>,
): string | null {
  if (resourceType === "USER") {
    return typeof payload.userName === "string" ? payload.userName : null;
  }

  return typeof payload.displayName === "string" ? payload.displayName : null;
}

export function getScimExternalId(payload: Record<string, unknown>): string | null {
  return typeof payload.externalId === "string" ? payload.externalId : null;
}

export function validateScimCreatePayload(
  resourceType: ScimResourceType,
  payload: Record<string, unknown>,
): string | null {
  if (resourceType === "USER") {
    return typeof payload.userName === "string" && payload.userName.trim().length > 0
      ? null
      : "SCIM user creation requires userName";
  }

  return typeof payload.displayName === "string" && payload.displayName.trim().length > 0
    ? null
    : "SCIM group creation requires displayName";
}

export function buildScimServiceProviderConfig(slug: string) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: `${APP_URL}/docs/enterprise-idp-roadmap.md`,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "Bearer Token",
        description: "Per-app bearer token derived from AuthLab server secrets.",
        specUri: "https://datatracker.ietf.org/doc/html/rfc6750",
        primary: true,
      },
    ],
    meta: {
      resourceType: "ServiceProviderConfig",
      location: `${buildScimBaseUrl(slug)}/ServiceProviderConfig`,
    },
  };
}

export function buildScimResourceTypes(slug: string) {
  return buildScimListResponse({
    resources: [
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
        id: "User",
        name: "User",
        endpoint: "/Users",
        description: "SCIM user accounts",
        schema: USER_SCHEMA,
        meta: {
          resourceType: "ResourceType",
          location: `${buildScimBaseUrl(slug)}/ResourceTypes/User`,
        },
      },
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
        id: "Group",
        name: "Group",
        endpoint: "/Groups",
        description: "SCIM groups",
        schema: GROUP_SCHEMA,
        meta: {
          resourceType: "ResourceType",
          location: `${buildScimBaseUrl(slug)}/ResourceTypes/Group`,
        },
      },
    ],
  });
}

export function buildScimSchemas(slug: string) {
  return buildScimListResponse({
    resources: [
      {
        id: USER_SCHEMA,
        name: "User",
        description: "Core SCIM User schema",
        attributes: [],
        meta: {
          resourceType: "Schema",
          location: `${buildScimBaseUrl(slug)}/Schemas/${encodeURIComponent(USER_SCHEMA)}`,
        },
      },
      {
        id: GROUP_SCHEMA,
        name: "Group",
        description: "Core SCIM Group schema",
        attributes: [],
        meta: {
          resourceType: "Schema",
          location: `${buildScimBaseUrl(slug)}/Schemas/${encodeURIComponent(GROUP_SCHEMA)}`,
        },
      },
      {
        id: PATCH_OP_SCHEMA,
        name: "PatchOp",
        description: "SCIM PatchOp message schema",
        attributes: [],
        meta: {
          resourceType: "Schema",
          location: `${buildScimBaseUrl(slug)}/Schemas/${encodeURIComponent(PATCH_OP_SCHEMA)}`,
        },
      },
    ],
  });
}

export function assertScimAuthorized(
  app: DecryptedAppInstance,
  request: Request,
): { ok: true } | { ok: false; response: Response } {
  if (verifyScimBearerToken(app.id, request.headers.get("authorization"))) {
    return { ok: true };
  }

  return {
    ok: false,
    response: Response.json(
      {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "401",
        detail: "Invalid or missing SCIM bearer token",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="AuthLab SCIM"',
        },
      },
    ),
  };
}
