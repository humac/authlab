ALTER TABLE "AppInstance" ADD COLUMN "requestedAuthnContext" TEXT;
ALTER TABLE "AppInstance" ADD COLUMN "samlSignatureAlgorithm" TEXT NOT NULL DEFAULT 'SHA256';
ALTER TABLE "AppInstance" ADD COLUMN "clockSkewToleranceSeconds" INTEGER NOT NULL DEFAULT 0;
