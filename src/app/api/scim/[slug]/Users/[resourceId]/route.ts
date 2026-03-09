import {
  deleteScimItem,
  getScimItem,
  patchScimItem,
  replaceScimItem,
} from "@/lib/scim-resource-handler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; resourceId: string }> },
) {
  const { slug, resourceId } = await params;
  return getScimItem(request, slug, "USER", resourceId);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string; resourceId: string }> },
) {
  const { slug, resourceId } = await params;
  return replaceScimItem(request, slug, "USER", resourceId);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; resourceId: string }> },
) {
  const { slug, resourceId } = await params;
  return patchScimItem(request, slug, "USER", resourceId);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; resourceId: string }> },
) {
  const { slug, resourceId } = await params;
  return deleteScimItem(request, slug, "USER", resourceId);
}

