ALTER TABLE "AppInstance" ADD COLUMN "customAuthParamsJson" TEXT;
ALTER TABLE "AppInstance" ADD COLUMN "nameIdFormat" TEXT;
ALTER TABLE "AppInstance" ADD COLUMN "forceAuthnDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppInstance" ADD COLUMN "isPassiveDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppInstance" ADD COLUMN "signAuthnRequests" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppInstance" ADD COLUMN "spSigningPrivateKey" TEXT;
ALTER TABLE "AppInstance" ADD COLUMN "spSigningCert" TEXT;

CREATE TABLE "AuthRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "appInstanceId" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "loginState" TEXT,
  "nonce" TEXT,
  "nonceStatus" TEXT,
  "runtimeOverridesJson" TEXT,
  "outboundAuthParamsJson" TEXT,
  "claimsJson" TEXT,
  "idToken" TEXT,
  "accessTokenEnc" TEXT,
  "rawTokenResponseEnc" TEXT,
  "rawSamlResponseXml" TEXT,
  "userinfoJson" TEXT,
  "authenticatedAt" DATETIME,
  "completedAt" DATETIME,
  "logoutState" TEXT,
  "logoutCompletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRun_appInstanceId_fkey" FOREIGN KEY ("appInstanceId") REFERENCES "AppInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AuthRun_loginState_key" ON "AuthRun"("loginState");
CREATE UNIQUE INDEX "AuthRun_logoutState_key" ON "AuthRun"("logoutState");
CREATE INDEX "AuthRun_appInstanceId_createdAt_idx" ON "AuthRun"("appInstanceId", "createdAt");
