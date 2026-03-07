import { defineConfig, devices } from "@playwright/test";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100";
const databaseUrl = process.env.DATABASE_URL || "file:./test/e2e/.tmp/e2e.db";
const masterKey =
  process.env.MASTER_ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";
const sessionPassword =
  process.env.SESSION_PASSWORD || "ci-session-password-ci-session-password-ci";

process.env.DATABASE_URL = databaseUrl;
process.env.MASTER_ENCRYPTION_KEY = masterKey;
process.env.SESSION_PASSWORD = sessionPassword;
process.env.NEXT_PUBLIC_APP_URL = baseUrl;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: baseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: baseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      CI: process.env.CI || "true",
      DATABASE_URL: databaseUrl,
      MASTER_ENCRYPTION_KEY: masterKey,
      SESSION_PASSWORD: sessionPassword,
      NEXT_PUBLIC_APP_URL: baseUrl,
    },
  },
});
