ALTER TABLE "AuthRun" ADD COLUMN "oidcSubject" TEXT;
ALTER TABLE "AuthRun" ADD COLUMN "oidcSessionId" TEXT;

CREATE INDEX "AuthRun_appInstanceId_status_oidcSessionId_idx"
ON "AuthRun"("appInstanceId", "status", "oidcSessionId");

CREATE INDEX "AuthRun_appInstanceId_status_oidcSubject_idx"
ON "AuthRun"("appInstanceId", "status", "oidcSubject");
