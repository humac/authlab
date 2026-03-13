import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!globalThis.__authlabIntegrationSetup) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "authlab-integration-"));
  const dbPath = path.join(tempDir, "integration.db");

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.MASTER_ENCRYPTION_KEY ??=
    "0000000000000000000000000000000000000000000000000000000000000000";
  process.env.SESSION_PASSWORD ??=
    "integration-session-password-integration-session-password";
  process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;

  const migrationDir = path.resolve(process.cwd(), "prisma/turso-migrations");
  const migrationFiles = [
    "0001_init.sql",
    "20260305_cleanup_orphaned_personal_workspaces.sql",
    "20260306_hardened_auth_and_profile.sql",
    "20260307_phase1_authrun_and_protocol_settings.sql",
    "20260307_phase2_oidc_token_lifecycle.sql",
    "20260308_phase3_saml_request_controls.sql",
    "20260308_phase3_saml_encryption_keys.sql",
    "20260308_phase3_saml_slo.sql",
    "20260308_phase4_oidc_backchannel_logout.sql",
    "20260308_phase4_oidc_par.sql",
    "20260308_phase4_scim_mock.sql",
    "20260310_user_default_team.sql",
    "20260310_app_tags.sql",
    "20260313_app_notes.sql",
  ];
  const migrationSql = migrationFiles
    .map((name) => fs.readFileSync(path.join(migrationDir, name), "utf8"))
    .join("\n\n");

  const db = new Database(dbPath);
  db.exec(migrationSql);
  db.close();

  process.on("exit", () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // On Windows the DB file may still be locked by better-sqlite3; ignore cleanup errors
    }
  });

  globalThis.__authlabIntegrationSetup = true;
}
