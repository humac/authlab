import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  OutboundUrlBlockedError,
  assertPublicOutboundUrl,
  guardedFetch,
  isBlockedIp,
} from "../../src/lib/outbound-url-guard.ts";

const env = process.env as Record<string, string | undefined>;

describe("outbound URL guard (OIDC SSRF protection)", () => {
  let savedNodeEnv: string | undefined;
  let savedAllow: string | undefined;

  beforeEach(() => {
    savedNodeEnv = env.NODE_ENV;
    savedAllow = env.AUTHLAB_ALLOW_PRIVATE_OUTBOUND;
    env.NODE_ENV = "production";
    delete env.AUTHLAB_ALLOW_PRIVATE_OUTBOUND;
  });

  afterEach(() => {
    env.NODE_ENV = savedNodeEnv;
    if (savedAllow === undefined) delete env.AUTHLAB_ALLOW_PRIVATE_OUTBOUND;
    else env.AUTHLAB_ALLOW_PRIVATE_OUTBOUND = savedAllow;
  });

  it("classifies private, loopback, link-local and mapped addresses as blocked", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:169.254.169.254",
    ]) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
    assert.equal(isBlockedIp("8.8.8.8"), false);
    assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
  });

  it("blocks cloud metadata, localhost and private literals in production", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:8080/realms/test",
      "http://127.0.0.1/.well-known/openid-configuration",
      "https://[::1]/",
      "http://10.0.0.5/",
    ]) {
      await assert.rejects(assertPublicOutboundUrl(url), OutboundUrlBlockedError, url);
    }
  });

  it("rejects non-HTTP schemes and embedded credentials", async () => {
    await assert.rejects(assertPublicOutboundUrl("file:///etc/passwd"), OutboundUrlBlockedError);
    await assert.rejects(
      assertPublicOutboundUrl("https://user:pass@example.com/"),
      OutboundUrlBlockedError,
    );
  });

  it("allows public IP literals", async () => {
    await assertPublicOutboundUrl("https://8.8.8.8/.well-known/openid-configuration");
  });

  it("allows private targets outside production or with explicit opt-in", async () => {
    env.NODE_ENV = "development";
    await assertPublicOutboundUrl("http://localhost:8080/realms/test");

    env.NODE_ENV = "production";
    env.AUTHLAB_ALLOW_PRIVATE_OUTBOUND = "true";
    await assertPublicOutboundUrl("http://169.254.169.254/");
  });

  it("guardedFetch refuses blocked targets before any network call and disables redirects", async () => {
    const originalFetch = globalThis.fetch;
    const calls: RequestInit[] = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      await assert.rejects(
        guardedFetch("http://169.254.169.254/latest/meta-data/"),
        OutboundUrlBlockedError,
      );
      assert.equal(calls.length, 0);

      await guardedFetch("https://8.8.8.8/jwks", { redirect: "follow" });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].redirect, "manual");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
