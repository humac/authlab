ALTER TABLE "AppInstance" ADD COLUMN "pkceMode" TEXT NOT NULL DEFAULT 'S256';

ALTER TABLE "AuthRun" ADD COLUMN "grantType" TEXT NOT NULL DEFAULT 'AUTHORIZATION_CODE';
ALTER TABLE "AuthRun" ADD COLUMN "refreshTokenEnc" TEXT;
ALTER TABLE "AuthRun" ADD COLUMN "accessTokenExpiresAt" DATETIME;
ALTER TABLE "AuthRun" ADD COLUMN "lastIntrospectionJson" TEXT;
ALTER TABLE "AuthRun" ADD COLUMN "lastRevocationAt" DATETIME;

CREATE TABLE "AuthRunEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "authRunId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "requestJson" TEXT,
  "responseEnc" TEXT,
  "metadataJson" TEXT,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRunEvent_authRunId_fkey" FOREIGN KEY ("authRunId") REFERENCES "AuthRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AuthRunEvent_authRunId_occurredAt_idx" ON "AuthRunEvent"("authRunId", "occurredAt");
