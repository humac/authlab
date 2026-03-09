import { NextResponse } from "next/server";
import { buildScimResourceTypes } from "@/lib/scim";
import { getScimApp, logScimResponse } from "@/lib/scim-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const appResult = await getScimApp(slug, request);
  if (!appResult.ok) {
    return appResult.response;
  }

  const responseBody = buildScimResourceTypes(slug);
  await logScimResponse({
    appInstanceId: appResult.app.id,
    method: request.method,
    path: new URL(request.url).pathname,
    statusCode: 200,
    response: responseBody,
  });

  return NextResponse.json(responseBody);
}

