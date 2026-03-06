import { getPrisma } from "@/lib/db";
import { generateOpaqueToken, hashToken } from "@/lib/token";

export type AuthTokenPurpose = "EMAIL_VERIFY" | "PASSWORD_RESET";

export async function createAuthToken(data: {
  userId: string;
  purpose: AuthTokenPurpose;
  expiresAt: Date;
}) {
  const prisma = await getPrisma();
  const token = generateOpaqueToken(32);
  const tokenHash = hashToken(token);

  await prisma.authToken.create({
    data: {
      userId: data.userId,
      purpose: data.purpose,
      tokenHash,
      expiresAt: data.expiresAt,
    },
  });

  return token;
}

export async function consumeAuthToken(data: {
  token: string;
  purpose: AuthTokenPurpose;
}) {
  const prisma = await getPrisma();
  const tokenHash = hashToken(data.token);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const record = await tx.authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) return null;
    if (record.purpose !== data.purpose) return null;
    if (record.usedAt) return null;
    if (record.expiresAt < now) return null;

    await tx.authToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    });

    return record;
  });
}

export async function deleteExpiredOrUsedAuthTokens() {
  const prisma = await getPrisma();
  const now = new Date();
  await prisma.authToken.deleteMany({
    where: {
      OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }],
    },
  });
}
