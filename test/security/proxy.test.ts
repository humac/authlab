import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "../unit/test-helpers.ts";

const env = process.env as Record<string, string | undefined>;

describe("proxy JSON content-type check", () => {
  async function runProxy(contentType: string) {
    env.SESSION_PASSWORD ??= "x".repeat(64);
    const { NextRequest } = await import("next/server");
    const { proxy } = await importFresh<typeof import("../../src/proxy.ts")>("../../src/proxy.ts");
    const request = new NextRequest("http://localhost/api/apps", {
      method: "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "content-type": contentType,
        "content-length": "2",
      },
      body: "{}",
    });
    return proxy(request);
  }

  it("rejects safelisted types that merely mention application/json in parameters", async () => {
    const response = await runProxy("text/plain; x=application/json");
    assert.equal(response.status, 415);
  });

  it("accepts application/json and structured +json types", async () => {
    for (const type of ["application/json", "application/json; charset=utf-8", "application/scim+json"]) {
      const response = await runProxy(type);
      assert.notEqual(response.status, 415, type);
    }
  });
});

describe("proxy lets bearer-authenticated SCIM traffic through", () => {
  async function runProxy(method: string, init: { contentType?: string; body?: string; origin?: string } = {}) {
    env.SESSION_PASSWORD ??= "x".repeat(64);
    const { NextRequest } = await import("next/server");
    const { proxy } = await importFresh<typeof import("../../src/proxy.ts")>("../../src/proxy.ts");
    const headers: Record<string, string> = {
      host: "localhost",
      authorization: "Bearer idp-token",
    };
    if (init.contentType) headers["content-type"] = init.contentType;
    if (init.body) headers["content-length"] = String(init.body.length);
    if (init.origin) headers.origin = init.origin;
    return proxy(
      new NextRequest("http://localhost/api/scim/my-app/Users", { method, headers, body: init.body }),
    );
  }

  it("does not require a session cookie for SCIM requests (route handlers check the bearer token)", async () => {
    for (const method of ["GET", "DELETE"]) {
      const response = await runProxy(method);
      assert.notEqual(response.status, 401, method);
    }
    for (const method of ["POST", "PUT", "PATCH"]) {
      const response = await runProxy(method, { contentType: "application/scim+json", body: "{}" });
      assert.notEqual(response.status, 401, method);
      assert.notEqual(response.status, 415, method);
    }
  });

  it("still applies the CSRF origin check to SCIM requests from a browser", async () => {
    const response = await runProxy("POST", {
      contentType: "application/scim+json",
      body: "{}",
      origin: "https://evil.example",
    });
    assert.equal(response.status, 403);
  });

  it("still requires a session for non-public API routes", async () => {
    env.SESSION_PASSWORD ??= "x".repeat(64);
    const { NextRequest } = await import("next/server");
    const { proxy } = await importFresh<typeof import("../../src/proxy.ts")>("../../src/proxy.ts");
    const response = await proxy(
      new NextRequest("http://localhost/api/apps", { headers: { host: "localhost" } }),
    );
    assert.equal(response.status, 401);
  });
});
