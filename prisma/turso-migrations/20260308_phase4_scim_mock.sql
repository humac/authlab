CREATE TABLE "ScimResource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "appInstanceId" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "externalId" TEXT,
  "displayName" TEXT,
  "payloadJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ScimResource_appInstanceId_fkey" FOREIGN KEY ("appInstanceId") REFERENCES "AppInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ScimResource_appInstanceId_resourceType_resourceId_key"
ON "ScimResource"("appInstanceId", "resourceType", "resourceId");

CREATE INDEX "ScimResource_appInstanceId_resourceType_displayName_idx"
ON "ScimResource"("appInstanceId", "resourceType", "displayName");

CREATE TABLE "ScimRequestLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "appInstanceId" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "requestJson" TEXT,
  "responseJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScimRequestLog_appInstanceId_fkey" FOREIGN KEY ("appInstanceId") REFERENCES "AppInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ScimRequestLog_appInstanceId_createdAt_idx"
ON "ScimRequestLog"("appInstanceId", "createdAt");
