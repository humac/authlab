import { NextResponse } from "next/server";
import { assertScimAuthorized, scimUnauthorizedResponse } from "@/lib/scim";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { createScimRequestLog } from "@/repositories/scim.repo";
import type { ScimResourceType } from "@/generated/prisma/client/enums";

type ScimAppResult =
  | {
      ok: true;
      app: NonNullable<Awaited<ReturnType<typeof getAppInstanceBySlug>>>;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function getScimApp(
  slug: string,
  request: Request,
): Promise<ScimAppResult> {
  // SCIM routes are reachable without a session, so an unknown slug gets the
  // same 401 as a bad token; a 404 would let anyone enumerate app slugs.
  const app = await getAppInstanceBySlug(slug);
  const auth = app ? assertScimAuthorized(app, request) : null;
  if (!app || !auth?.ok) {
    const denied = auth && !auth.ok ? auth.response : scimUnauthorizedResponse();
    return {
      ok: false,
      response: NextResponse.json(await denied.json(), {
        status: denied.status,
        headers: denied.headers,
      }),
    };
  }

  return { ok: true, app };
}

export async function logScimResponse(input: {
  appInstanceId: string;
  method: string;
  path: string;
  statusCode: number;
  resourceType?: ScimResourceType | null;
  resourceId?: string | null;
  request?: Record<string, unknown> | null;
  response?: Record<string, unknown> | null;
}) {
  await createScimRequestLog(input);
}

