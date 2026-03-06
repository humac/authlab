import { getPrisma } from "@/lib/db";

export async function getProfileImageByUserId(userId: string) {
  const prisma = await getPrisma();
  return prisma.userProfileImage.findUnique({
    where: { userId },
  });
}

export async function hasProfileImageByUserId(userId: string) {
  const prisma = await getPrisma();
  const image = await prisma.userProfileImage.findUnique({
    where: { userId },
    select: { userId: true },
  });
  return Boolean(image);
}

export async function upsertProfileImage(data: {
  userId: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
  sha256: string;
}) {
  const prisma = await getPrisma();
  const content = Uint8Array.from(data.content);
  return prisma.userProfileImage.upsert({
    where: { userId: data.userId },
    create: {
      userId: data.userId,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      content,
      sha256: data.sha256,
    },
    update: {
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      content,
      sha256: data.sha256,
    },
  });
}

export async function deleteProfileImageByUserId(userId: string) {
  const prisma = await getPrisma();
  await prisma.userProfileImage.deleteMany({ where: { userId } });
}
