import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { ESLint } from "eslint";

/**
 * The SSRF guard is only as strong as its coverage. These tests prove that the
 * authlab/no-unguarded-outbound lint rule (run by `npm run lint` in CI's
 * Quality Gate) rejects every way server code could bypass guardedFetch, and
 * that nobody has switched it off.
 */

const RULE = "authlab/no-unguarded-outbound";
const eslint = new ESLint();

async function ruleHits(code: string, filePath: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === RULE).length;
}

describe("SSRF guard enforcement (authlab/no-unguarded-outbound)", () => {
  it("is enabled as an error for server code", async () => {
    const config = await eslint.calculateConfigForFile("src/lib/some-server-module.ts");
    const setting = config.rules?.[RULE];
    const severity = Array.isArray(setting) ? setting[0] : setting;
    assert.ok(severity === 2 || severity === "error", `expected error, got ${JSON.stringify(setting)}`);
  });

  for (const [label, code] of [
    ["bare fetch()", `export async function f(u: string) { return fetch(u); }`],
    ["globalThis.fetch()", `export async function f(u: string) { return globalThis.fetch(u); }`],
    ["global.fetch()", `export async function f(u: string) { return global.fetch(u); }`],
    ["node:https import", `import https from "node:https";\nexport const a = https;`],
    ["http import", `import http from "http";\nexport const a = http;`],
    ["undici import", `import { request } from "undici";\nexport const a = request;`],
    ["axios import", `import axios from "axios";\nexport const a = axios;`],
    [
      "openid-client namespace discovery()",
      `import * as client from "openid-client";\nexport const c = client.discovery(new URL("https://x"), "id");`,
    ],
    [
      "openid-client named discovery import",
      `import { discovery } from "openid-client";\nexport const d = discovery;`,
    ],
    [
      "new openid-client Configuration",
      `import * as client from "openid-client";\nexport const c = new client.Configuration({ issuer: "https://x" }, "id");`,
    ],
  ] as const) {
    it(`rejects ${label} in server code`, async () => {
      assert.ok((await ruleHits(code, "src/lib/new-feature.ts")) > 0);
      assert.ok((await ruleHits(code, "src/app/api/new/route.ts")) > 0);
    });
  }

  it("allows guardedFetch and openid-client helpers with no network I/O", async () => {
    const code = `import * as client from "openid-client";
import { guardedFetch } from "@/lib/outbound-url-guard";
export async function f(u: string) {
  const state = client.randomState();
  return [state, await guardedFetch(u)];
}`;
    assert.equal(await ruleHits(code, "src/lib/new-feature.ts"), 0);
  });

  it("exempts client components, the guard itself, and oidc-handler's discovery", async () => {
    assert.equal(
      await ruleHits(`"use client";\nexport async function f() { return fetch("/api/user/me"); }`, "src/components/X.tsx"),
      0,
    );
    assert.equal(
      await ruleHits(`export async function f(u: string) { return fetch(u); }`, "src/lib/outbound-url-guard.ts"),
      0,
    );
    assert.equal(
      await ruleHits(
        `import * as client from "openid-client";\nexport const c = client.discovery(new URL("https://x"), "id");`,
        "src/lib/oidc-handler.ts",
      ),
      0,
    );
  });

  it("is not disabled anywhere in src (by name or by a blanket eslint-disable)", () => {
    let output = "";
    try {
      output = execFileSync("git", ["grep", "-n", "-e", "eslint-disable", "--", "src"], {
        encoding: "utf8",
      });
    } catch (error) {
      // git grep exits 1 when there are no matches.
      if ((error as { status?: number }).status !== 1) throw error;
    }

    const offending = output
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        const directive = line.slice(line.indexOf("eslint-disable"));
        const ruleList = directive
          .replace(/^eslint-disable(-next-line|-line)?/, "")
          .replace(/\*\/.*$/, "")
          .split("--")[0]
          .trim();
        return ruleList === "" || ruleList.includes("no-unguarded-outbound");
      });

    assert.deepEqual(offending, [], "SSRF guard rule must not be disabled in src");
  });
});
