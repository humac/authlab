import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const sharedEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "test",
  DATABASE_URL: process.env.DATABASE_URL || "file:./test/e2e/.tmp/e2e.db",
  AUTHLAB_E2E_BASE_URL:
    process.env.AUTHLAB_E2E_BASE_URL || "http://localhost:3100",
  MASTER_ENCRYPTION_KEY:
    process.env.MASTER_ENCRYPTION_KEY ||
    "0000000000000000000000000000000000000000000000000000000000000000",
  RUST_LOG: process.env.RUST_LOG || "info",
  SESSION_PASSWORD:
    process.env.SESSION_PASSWORD ||
    "ci-session-password-ci-session-password-ci",
  NEXT_PUBLIC_APP_URL:
    process.env.AUTHLAB_E2E_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3100",
};

mkdirSync("test/e2e/.tmp", { recursive: true });

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args) {
  const result = spawnSync(command, args, {
    env: sharedEnv,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(npxBin, ["prisma", "db", "push"]);
run(npxBin, ["playwright", "test"]);
