import { NextResponse } from "next/server";
import type { ScimResourceType } from "@/generated/prisma/client/enums";
import {
  applyScimPatch,
  buildScimListResponse,
  buildScimResourceResponse,
  filterScimResources,
  getScimDisplayName,
  getScimExternalId,
  parseScimListParams,
  validateScimCreatePayload,
} from "@/lib/scim";
import { getScimApp, logScimResponse } from "@/lib/scim-route";
import {
  createScimResource,
  deleteScimResource,
  getScimResourceByResourceId,
  listScimResources,
  updateScimResource,
} from "@/repositories/scim.repo";

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  const payload = (await request.json().catch(() => null)) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function sanitizeScimPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  delete next.id;
  delete next.meta;
  delete next.schemas;
  return next;
}

export async function listScimCollection(
  request: Request,
  slug: string,
  resourceType: ScimResourceType,
) {
  const appResult = await getScimApp(slug, request);
  if (!appResult.ok) {
    return appResult.response;
  }

  const { app } = appResult;
  const url = new URL(request.url);
  const params = parseScimListParams(url);
  const resources = await listScimResources(app.id, resourceType);
  const responseBody = buildScimListResponse({
    resources: filterScimResources(resources, params.filter).map((resource) =>
      buildScimResourceResponse({ slug, resourceType, resource }),
    ),
    startIndex: params.startIndex,
    count: params.count,
  });

  await logScimResponse({
    appInstanceId: app.id,
    resourceType,
    method: request.method,
    path: url.pathname + url.search,
    statusCode: 200,
    request: {
      startIndex: params.startIndex,
      count: params.count,
      filter: params.filter,
    },
    response: responseBody,
  });

  return NextResponse.json(responseBody);
}

export async function createScimCollectionResource(
  request: Request,
  slug: string,
  resourceType: ScimResourceType,
) {
  const appResult = await getScimApp(slug, request);
  if (!appResult.ok) {
    return appResult.response;
  }

  const { app } = appResult;
  const body = await parseBody(request);
  if (!body) {
    return NextResponse.json({ detail: "Invalid SCIM payload" }, { status: 400 });
  }

  const payload = sanitizeScimPayload(body);
  const validationError = validateScimCreatePayload(resourceType, payload);
  if (validationError) {
    await logScimResponse({
      appInstanceId: app.id,
      resourceType,
      method: request.method,
      path: new URL(request.url).pathname,
      statusCode: 400,
      request: body,
      response: { detail: validationError },
    });
    return NextResponse.json({ detail: validationError }, { status: 400 });
  }

  const resource = await createScimResource({
    appInstanceId: app.id,
    resourceType,
    payload,
    externalId: getScimExternalId(payload),
    displayName: getScimDisplayName(resourceType, payload),
  });
  const responseBody = buildScimResourceResponse({ slug, resourceType, resource });

  await logScimResponse({
    appInstanceId: app.id,
    resourceType,
    resourceId: resource.resourceId,
    method: request.method,
    path: new URL(request.url).pathname,
    statusCode: 201,
    request: body,
    response: responseBody,
  });

  return NextResponse.json(responseBody, {
    status: 201,
    headers: {
      Location: String(responseBody.meta.location),
    },
  });
}

export async function getScimItem(
  request: Request,
  slug: string,
  resourceType: ScimResourceType,
  resourceId: string,
) {
  const appResult = await getScimApp(slug, request);
  if (!appResult.ok) {
    return appResult.response;
  }

  const { app } = appResult;
  const resource = await getScimResourceByResourceId(app.id, resourceType, resourceId);
  if (!resource) {
    await logScimResponse({
      appInstanceId: app.id,
      resourceType,
      resourceId,
      method: request.method,
      path: new URL(request.url).pathname,
      statusCode: 404,
      response: { detail: "SCIM resource not found" },
    });
    return NextResponse.json({ detail: "SCIM resource not found" }, { status: 404 });
  }

  const responseBody = buildScimResourceResponse({ slug, resourceType, resource });
  await logScimResponse({
    appInstanceId: app.id,
    resourceType,
    resourceId,
    method: request.method,
    path: new URL(request.url).pathname,
    statusCode: 200,
    response: responseBody,
  });

  return NextResponse.json(responseBody);
}

export async function replaceScimItem(
  request: Request,
  slug: string,
  resourceType: ScimResourceType,
  resourceId: string,
) {
  const appResult = await getScimApp(slug, request);
  if (!appResult.ok) {
    return appResult.response;
  }

  const { app } = appResult;
  const existing = await getScimResourceByResourceId(app.id, resourceType, resourceId);
  if (!existing) {
    return NextResponse.json({ detail: "SCIM resource not found" }, { status: 404 });
  }

  const body = await parseBody(request);
  if (!body) {
    return NextResponse.json({ detail: "Invalid SCIM payload" }, { status: 400 });
  }

  const payload = sanitizeScimPayload(body);
  const validationError = validateScimCreatePayload(resourceType, payload);
  if (validationError) {
    return NextResponse.json({ detail: validationError }, { status: 400 });
  }

  const resource = await updateScimResource({
    appInstanceId: app.id,
    resourceType,
    resourceId,
    payload,
    externalId: getScimExternalId(payload),
    displayName: getScimDisplayName(resourceType, payload),
  });
  const responseBody = buildScimResourceResponse({ slug, resourceType, resource });

  await logScimResponse({
    appInstanceId: app.id,
    resourceType,
    resourceId,
    method: request.method,
    path: new URL(request.url).pathname,
    statusCode: 200,
    request: body,
    response: responseBody,
  });

  return NextResponse.json(responseBody);
}

export async function patchScimItem(
  request: Request,
  slug: string,
  resourceType: ScimResourceType,
  resourceId: string,
) {
  const appResult = await getScimApp(slug, request);
  if (!appResult.ok) {
    return appResult.response;
  }

  const { app } = appResult;
  const existing = await getScimResourceByResourceId(app.id, resourceType, resourceId);
  if (!existing) {
    return NextResponse.json({ detail: "SCIM resource not found" }, { status: 404 });
  }

  const body = await parseBody(request);
  const operations = body?.Operations;
  if (!Array.isArray(operations)) {
    return NextResponse.json({ detail: "SCIM patch requires an Operations array" }, { status: 400 });
  }

  const payload = applyScimPatch(existing.payload, operations as Array<Record<string, unknown>>);
  const validationError = validateScimCreatePayload(resourceType, payload);
  if (validationError) {
    return NextResponse.json({ detail: validationError }, { status: 400 });
  }

  const resource = await updateScimResource({
    appInstanceId: app.id,
    resourceType,
    resourceId,
    payload,
    externalId: getScimExternalId(payload),
    displayName: getScimDisplayName(resourceType, payload),
  });
  const responseBody = buildScimResourceResponse({ slug, resourceType, resource });

  await logScimResponse({
    appInstanceId: app.id,
    resourceType,
    resourceId,
    method: request.method,
    path: new URL(request.url).pathname,
    statusCode: 200,
    request: body,
    response: responseBody,
  });

  return NextResponse.json(responseBody);
}

export async function deleteScimItem(
  request: Request,
  slug: string,
  resourceType: ScimResourceType,
  resourceId: string,
) {
  const appResult = await getScimApp(slug, request);
  if (!appResult.ok) {
    return appResult.response;
  }

  const { app } = appResult;
  const existing = await getScimResourceByResourceId(app.id, resourceType, resourceId);
  if (!existing) {
    return NextResponse.json({ detail: "SCIM resource not found" }, { status: 404 });
  }

  await deleteScimResource(app.id, resourceType, resourceId);
  await logScimResponse({
    appInstanceId: app.id,
    resourceType,
    resourceId,
    method: request.method,
    path: new URL(request.url).pathname,
    statusCode: 204,
    response: { deleted: true },
  });

  return new NextResponse(null, { status: 204 });
}

