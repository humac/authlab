import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { after, beforeEach, describe, it } from "node:test";
import { getPrisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { _resetAllStores } from "@/lib/rate-limit";
import {
  addTeamMember,
  createTeam,
  createUser,
  resetDatabase,
} from "../integration/test-helpers.ts";
import { importFresh } from "../unit/test-helpers.ts";

type Budget = {
  avgMsMax: number;
  p95MsMax: number;
};

type ScenarioResult = {
  scenario: string;
  iterations: number;
  budget: Budget;
  minMs: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
};

const REPORT_DIR = path.resolve(process.cwd(), "test-results/performance");
const JSON_REPORT = path.join(REPORT_DIR, "auth-latency-baseline.json");
const MARKDOWN_REPORT = path.join(REPORT_DIR, "auth-latency-baseline.md");
const results: ScenarioResult[] = [];

function percentile95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

function createJsonRequest(url: string, body: unknown, ip: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

async function measureScenario(
  scenario: string,
  budget: Budget,
  runIteration: (iteration: number) => Promise<void>,
  iterations = 5,
  warmup = 1,
) {
  for (let i = 0; i < warmup; i += 1) {
    await runIteration(-1 - i);
  }

  const durations: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = performance.now();
    await runIteration(iteration);
    durations.push(performance.now() - start);
  }

  const minMs = Math.min(...durations);
  const maxMs = Math.max(...durations);
  const avgMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const p95Ms = percentile95(durations);

  const result: ScenarioResult = {
    scenario,
    iterations,
    budget,
    minMs,
    avgMs,
    p95Ms,
    maxMs,
  };
  results.push(result);

  assert.ok(
    avgMs <= budget.avgMsMax,
    `${scenario} avg ${avgMs.toFixed(1)}ms exceeded budget ${budget.avgMsMax}ms`,
  );
  assert.ok(
    p95Ms <= budget.p95MsMax,
    `${scenario} p95 ${p95Ms.toFixed(1)}ms exceeded budget ${budget.p95MsMax}ms`,
  );
}

async function writeReports() {
  await mkdir(REPORT_DIR, { recursive: true });

  await writeFile(
    JSON_REPORT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        platform: process.platform,
        release: os.release(),
        node: process.version,
        results,
      },
      null,
      2,
    ),
  );

  const lines = [
    "# Auth Latency Baseline",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Node: ${process.version}`,
    `Platform: ${process.platform} ${os.release()}`,
    "",
    "| Scenario | Iterations | Avg (ms) | P95 (ms) | Min (ms) | Max (ms) | Budget Avg/P95 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...results.map(
      (result) =>
        `| ${result.scenario} | ${result.iterations} | ${result.avgMs.toFixed(1)} | ${result.p95Ms.toFixed(1)} | ${result.minMs.toFixed(1)} | ${result.maxMs.toFixed(1)} | ${result.budget.avgMsMax}/${result.budget.p95MsMax} ms |`,
    ),
    "",
    "These nightly numbers are route-level in-process baselines, not load-test throughput metrics.",
  ];

  await writeFile(MARKDOWN_REPORT, `${lines.join("\n")}\n`);
}

describe("performance baselines: critical auth paths", () => {
  beforeEach(async () => {
    await resetDatabase();
    _resetAllStores();
  });

  after(async () => {
    await writeReports();
  });

  it("benchmarks registration for fresh accounts", async (t) => {
    t.mock.module("@/lib/auth-email", {
      namedExports: {
        sendEmailVerificationLink: t.mock.fn(async () => undefined),
      },
    });

    const route = await importFresh<
      typeof import("../../src/app/api/user/register/route.ts")
    >("../../src/app/api/user/register/route.ts");

    await measureScenario(
      "register_fresh_account",
      { avgMsMax: 1400, p95MsMax: 1800 },
      async (iteration) => {
        const response = await route.POST(
          createJsonRequest(
            "http://localhost/api/user/register",
            {
              email: `perf-register-${Date.now()}-${iteration}@example.com`,
              name: "Perf Register User",
              password: "StrongPassword123!",
            },
            `198.51.100.${10 + ((iteration + 10) % 50)}`,
          ),
        );
        assert.equal(response.status, 200);
      },
      4,
      1,
    );
  });

  it("benchmarks password login for verified users", async (t) => {
    const password = "CorrectHorseBatteryStaple1!";
    const passwordHash = await hashPassword(password);
    const user = await createUser({
      email: "perf-login@example.com",
      passwordHash,
      isVerified: true,
    });
    const team = await createTeam({ slug: "perf-login-team" });
    await addTeamMember(team.id, user.id, "OWNER");

    t.mock.module("@/lib/user-session", {
      namedExports: {
        getUserSession: t.mock.fn(async () => ({ save: async () => undefined })),
        clearAuthState: t.mock.fn(() => undefined),
        setAuthenticatedUserSession: t.mock.fn(() => undefined),
      },
    });

    const route = await importFresh<
      typeof import("../../src/app/api/user/login/route.ts")
    >("../../src/app/api/user/login/route.ts");

    await measureScenario(
      "login_valid_password",
      { avgMsMax: 700, p95MsMax: 900 },
      async (iteration) => {
        const response = await route.POST(
          createJsonRequest(
            "http://localhost/api/user/login",
            { email: user.email, password },
            `203.0.113.${10 + ((iteration + 10) % 50)}`,
          ),
        );
        assert.equal(response.status, 200);
      },
      5,
      1,
    );
  });

  it("benchmarks invalid-password login handling", async (t) => {
    const passwordHash = await hashPassword("CorrectHorseBatteryStaple1!");
    const user = await createUser({
      email: "perf-invalid-login@example.com",
      passwordHash,
      isVerified: true,
    });
    const team = await createTeam({ slug: "perf-invalid-login-team" });
    await addTeamMember(team.id, user.id, "OWNER");

    t.mock.module("@/lib/user-session", {
      namedExports: {
        getUserSession: t.mock.fn(async () => ({ save: async () => undefined })),
        clearAuthState: t.mock.fn(() => undefined),
        setAuthenticatedUserSession: t.mock.fn(() => undefined),
      },
    });

    const route = await importFresh<
      typeof import("../../src/app/api/user/login/route.ts")
    >("../../src/app/api/user/login/route.ts");

    await measureScenario(
      "login_invalid_password",
      { avgMsMax: 700, p95MsMax: 900 },
      async (iteration) => {
        const response = await route.POST(
          createJsonRequest(
            "http://localhost/api/user/login",
            { email: user.email, password: "WrongPassword123!" },
            `203.0.113.${70 + ((iteration + 10) % 50)}`,
          ),
        );
        assert.equal(response.status, 401);
      },
      5,
      1,
    );
  });

  it("benchmarks password reset requests for verified users", async (t) => {
    const user = await createUser({
      email: "perf-reset@example.com",
      isVerified: true,
    });

    t.mock.module("@/lib/auth-email", {
      namedExports: {
        sendPasswordResetLink: t.mock.fn(async () => undefined),
      },
    });

    const route = await importFresh<
      typeof import("../../src/app/api/user/password-reset/request/route.ts")
    >("../../src/app/api/user/password-reset/request/route.ts");

    await measureScenario(
      "password_reset_request_verified",
      { avgMsMax: 120, p95MsMax: 200 },
      async (iteration) => {
        const response = await route.POST(
          createJsonRequest(
            "http://localhost/api/user/password-reset/request",
            { email: user.email },
            `192.0.2.${20 + ((iteration + 10) % 50)}`,
          ),
        );
        assert.equal(response.status, 200);
        const prisma = await getPrisma();
        await prisma.authToken.deleteMany({
          where: { userId: user.id, purpose: "PASSWORD_RESET" },
        });
      },
      5,
      1,
    );
  });

  it("benchmarks verification resend for pending users", async (t) => {
    const user = await createUser({
      email: "perf-resend@example.com",
      isVerified: false,
    });

    t.mock.module("@/lib/auth-email", {
      namedExports: {
        sendEmailVerificationLink: t.mock.fn(async () => undefined),
      },
    });

    const route = await importFresh<
      typeof import("../../src/app/api/user/verify-email/resend/route.ts")
    >("../../src/app/api/user/verify-email/resend/route.ts");

    await measureScenario(
      "verify_email_resend_pending",
      { avgMsMax: 120, p95MsMax: 200 },
      async (iteration) => {
        const response = await route.POST(
          createJsonRequest(
            "http://localhost/api/user/verify-email/resend",
            { email: user.email },
            `192.0.2.${90 + ((iteration + 10) % 50)}`,
          ),
        );
        assert.equal(response.status, 200);
        const prisma = await getPrisma();
        await prisma.authToken.deleteMany({
          where: { userId: user.id, purpose: "EMAIL_VERIFY" },
        });
      },
      5,
      1,
    );
  });
});
