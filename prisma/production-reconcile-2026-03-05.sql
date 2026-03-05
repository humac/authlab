-- Production schema reconciliation for legacy deployments.
-- Date: 2026-03-05
--
-- Purpose:
-- 1) Ensure SystemSetting exists (registration/admin settings safety).
-- 2) Rebuild legacy AppInstance to include required teamId + foreign key.
-- 3) Preserve existing AppInstance rows by assigning them to a legacy team.

BEGIN;

CREATE TABLE IF NOT EXISTS "SystemSetting" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

INSERT OR IGNORE INTO "Team" (
  "id",
  "name",
  "slug",
  "isPersonal",
  "createdAt",
  "updatedAt"
)
VALUES (
  'legacy_migration_team',
  'Legacy Imported Apps',
  'legacy-imported-apps',
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

CREATE TABLE "AppInstance_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "issuerUrl" TEXT,
  "clientId" TEXT,
  "clientSecret" TEXT,
  "scopes" TEXT DEFAULT 'openid profile email',
  "entryPoint" TEXT,
  "issuer" TEXT,
  "idpCert" TEXT,
  "buttonColor" TEXT DEFAULT '#3B71CA',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AppInstance_teamId_fkey"
    FOREIGN KEY ("teamId")
    REFERENCES "Team" ("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

INSERT INTO "AppInstance_new" (
  "id",
  "name",
  "slug",
  "protocol",
  "teamId",
  "issuerUrl",
  "clientId",
  "clientSecret",
  "scopes",
  "entryPoint",
  "issuer",
  "idpCert",
  "buttonColor",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "name",
  "slug",
  "protocol",
  'legacy_migration_team',
  "issuerUrl",
  "clientId",
  "clientSecret",
  "scopes",
  "entryPoint",
  "issuer",
  "idpCert",
  "buttonColor",
  "createdAt",
  "updatedAt"
FROM "AppInstance";

DROP TABLE "AppInstance";
ALTER TABLE "AppInstance_new" RENAME TO "AppInstance";
CREATE UNIQUE INDEX "AppInstance_slug_key" ON "AppInstance"("slug");

COMMIT;
