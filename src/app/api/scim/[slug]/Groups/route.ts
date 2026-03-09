import { createScimCollectionResource, listScimCollection } from "@/lib/scim-resource-handler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return listScimCollection(request, slug, "GROUP");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return createScimCollectionResource(request, slug, "GROUP");
}

