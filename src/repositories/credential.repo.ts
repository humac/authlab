import { getPrisma } from "@/lib/db";

export async function listCredentialsByUser(userId: string) {
  const prisma = await getPrisma();
  return prisma.credential.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getCredentialByCredentialId(credentialId: string) {
  const prisma = await getPrisma();
  return prisma.credential.findUnique({
    where: { credentialId },
  });
}

export async function createCredential(data: {
  userId: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
}) {
  const prisma = await getPrisma();
  return prisma.credential.create({
    data,
  });
}

export async function updateCredentialCounter(data: {
  id: string;
  signCount: number;
}) {
  const prisma = await getPrisma();
  return prisma.credential.update({
    where: { id: data.id },
    data: {
      signCount: data.signCount,
      lastUsedAt: new Date(),
    },
  });
}

export async function deleteCredential(userId: string, id: string) {
  const prisma = await getPrisma();
  const credential = await prisma.credential.findUnique({ where: { id } });
  if (!credential || credential.userId !== userId) {
    return null;
  }

  await prisma.credential.delete({ where: { id } });
  return credential;
}
