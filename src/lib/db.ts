import { PrismaClient } from "@/generated/prisma/client/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prismaPromise: Promise<PrismaClient> | null = null;

async function createPrismaClient(): Promise<PrismaClient> {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const { PrismaLibSql } = await import("@prisma/adapter-libsql");
    const adapter = new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new PrismaClient({ adapter, datasourceUrl: process.env.TURSO_DATABASE_URL } as any);
  } else {
    const { PrismaBetterSqlite3 } = await import(
      "@prisma/adapter-better-sqlite3"
    );
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL!,
    });
    return new PrismaClient({ adapter });
  }
}

export async function getPrisma(): Promise<PrismaClient> {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  if (!prismaPromise) prismaPromise = createPrismaClient();
  const client = await prismaPromise;
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}
