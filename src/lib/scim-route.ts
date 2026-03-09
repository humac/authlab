import { NextResponse } from "next/server";
import { assertScimAuthorized } from "@/lib/scim";
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
  const app = await getAppInstanceBySlug(slug);
  if (!app) {
    return {
      ok: false,
      response: NextResponse.json({ detail: "SCIM app not found" }, { status: 404 }),
    };
  }

  const auth = assertScimAuthorized(app, request);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json(await auth.response.json(), {
        status: auth.response.status,
        headers: auth.response.headers,
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

