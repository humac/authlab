import { getPrisma } from "@/lib/db";

export async function createUser(data: {
  email: string;
  name: string;
  passwordHash: string;
  isSystemAdmin?: boolean;
  mustChangePassword?: boolean;
}) {
  const prisma = await getPrisma();
  return prisma.user.create({ data });
}

export async function getUserByEmail(email: string) {
  const prisma = await getPrisma();
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserById(id: string) {
  const prisma = await getPrisma();
  return prisma.user.findUnique({ where: { id } });
}

export async function updateUser(
  id: string,
  data: Partial<{
    email: string;
    name: string;
    passwordHash: string;
    isSystemAdmin: boolean;
    mustChangePassword: boolean;
  }>,
) {
  const prisma = await getPrisma();
  return prisma.user.update({ where: { id }, data });
}

export async function deleteUser(id: string) {
  const prisma = await getPrisma();
  return prisma.user.delete({ where: { id } });
}

export async function countUsers(): Promise<number> {
  const prisma = await getPrisma();
  return prisma.user.count();
}

export async function listUsers(page = 1, limit = 50) {
  const prisma = await getPrisma();
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        isSystemAdmin: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { teamMemberships: true } },
      },
    }),
    prisma.user.count(),
  ]);
  return { users, total, page, limit };
}

export async function listUsersWithMemberships(page = 1, limit = 50) {
  const prisma = await getPrisma();
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        isSystemAdmin: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { teamMemberships: true } },
        teamMemberships: {
          include: {
            team: {
              select: { id: true, name: true, slug: true, isPersonal: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    }),
    prisma.user.count(),
  ]);
  return { users, total, page, limit };
}

export async function countSystemAdmins(): Promise<number> {
  const prisma = await getPrisma();
  return prisma.user.count({
    where: { isSystemAdmin: true },
  });
}
