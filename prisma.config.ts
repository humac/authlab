import "dotenv/config";
import { defineConfig } from "prisma/config";

// Always use local SQLite for Prisma CLI commands (db push, migrate, generate).
// The runtime Prisma Client uses @prisma/adapter-libsql for Turso in production.
// To push schema changes to Turso, use:
//   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > migration.sql
//   turso db shell authlab < migration.sql
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
