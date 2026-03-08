import { PrismaClient } from "@/generated/prisma/client/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prismaPromise: Promise<PrismaClient> | null = null;

async function createPrismaClient(): Promise<PrismaClient> {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const sqliteUrl = process.env.DATABASE_URL?.trim();
  const hasTursoUrl = Boolean(tursoUrl);
  const hasTursoAuthToken = Boolean(tursoAuthToken);
  const allowLocalSqliteInProduction =
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL !== "1" &&
    Boolean(sqliteUrl?.startsWith("file:"));

  if (hasTursoUrl !== hasTursoAuthToken) {
    throw new Error(
      "Database misconfiguration: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must either both be set or both be unset.",
    );
  }

  if (hasTursoUrl && hasTursoAuthToken) {
    const { PrismaLibSql } = await import("@prisma/adapter-libsql");
    const adapter = new PrismaLibSql({
      url: tursoUrl!,
      authToken: tursoAuthToken!,
    });
    return new PrismaClient({ adapter });
  }

  if (process.env.NODE_ENV === "production" && !allowLocalSqliteInProduction) {
    throw new Error(
      "Database misconfiguration: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required in production.",
    );
  }

  if (!sqliteUrl) {
    throw new Error(
      "Database misconfiguration: DATABASE_URL is required for non-production environments.",
    );
  }

  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  const adapter = new PrismaBetterSqlite3({
    url: sqliteUrl,
  });
  return new PrismaClient({ adapter });
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
