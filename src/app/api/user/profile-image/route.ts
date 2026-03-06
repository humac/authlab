import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { sanitizeProfileImage } from "@/lib/profile-image";
import {
  deleteProfileImageByUserId,
  getProfileImageByUserId,
  upsertProfileImage,
} from "@/repositories/profile-image.repo";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const image = await getProfileImageByUserId(currentUser.userId);
  if (!image) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(image.content), {
    status: 200,
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.sizeBytes),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let sanitized: Awaited<ReturnType<typeof sanitizeProfileImage>>;
  try {
    sanitized = await sanitizeProfileImage(buffer);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid image" },
      { status: 400 },
    );
  }

  await upsertProfileImage({
    userId: currentUser.userId,
    mimeType: sanitized.mimeType,
    sizeBytes: sanitized.sizeBytes,
    content: sanitized.content,
    sha256: sanitized.sha256,
  });

  return NextResponse.json({
    ok: true,
    mimeType: sanitized.mimeType,
    sizeBytes: sanitized.sizeBytes,
    sha256: sanitized.sha256,
  });
}

export async function DELETE() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteProfileImageByUserId(currentUser.userId);
  return NextResponse.json({ ok: true });
}
