import assert from "node:assert/strict";
import dns from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it, type TestContext } from "node:test";
import {
  OutboundUrlBlockedError,
  assertOutboundUrlAllowed,
  guardedFetch,
  isBlockedIp,
} from "../../src/lib/outbound-url-guard.ts";
import { importFresh } from "../unit/test-helpers.ts";

const env = process.env as Record<string, string | undefined>;

function useProductionEnv() {
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
}

function hostOf(url: string) {
  return new URL(url).hostname.replace(/^\[|\]$/g, "");
}

describe("outbound URL guard (SSRF protection)", () => {
  useProductionEnv();

  it("classifies private, loopback, link-local and mapped addresses as blocked", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::",
      "::1",
      "fd00::1",
      "fe80::1",
      "fec0::1",
      "ff02::1",
      "::ffff:169.254.169.254",
      "::ffff:a9fe:a9fe",
    ]) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
    assert.equal(isBlockedIp("8.8.8.8"), false);
    assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
  });

  it("blocks IPv6 forms that embed or route to internal IPv4", () => {
    for (const url of [
      "http://[::169.254.169.254]/", // IPv4-compatible -> [::a9fe:a9fe]
      "http://[64:ff9b::169.254.169.254]/", // NAT64
      "http://[64:ff9b::a00:1]/", // NAT64 -> 10.0.0.1
      "http://[2002:a9fe:a9fe::]/", // 6to4 -> 169.254.169.254
      "http://[2001::1]/", // Teredo
      "http://[100::1]/", // discard-only
    ]) {
      assert.equal(isBlockedIp(hostOf(url)), true, url);
    }
    // Public IPv4 embedded via NAT64 / 6to4 stays allowed.
    assert.equal(isBlockedIp(hostOf("http://[64:ff9b::8.8.8.8]/")), false);
    assert.equal(isBlockedIp(hostOf("http://[2002:808:808::]/")), false);
  });

  it("blocks cloud metadata, localhost and private literals in production", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:8080/realms/test",
      "http://localhost.:8080/realms/test",
      "http://127.0.0.1/.well-known/openid-configuration",
      "http://2130706433/", // decimal 127.0.0.1, normalized by the URL parser
      "https://[::1]/",
      "http://10.0.0.5/",
    ]) {
      assert.throws(() => assertOutboundUrlAllowed(url), OutboundUrlBlockedError, url);
    }
  });

  it("returns one generic error so the guard cannot be used as a DNS oracle", () => {
    const messages = new Set<string>();
    for (const url of ["http://169.254.169.254/", "http://localhost/", "http://[fd00::1]/"]) {
      try {
        assertOutboundUrlAllowed(url);
      } catch (error) {
        messages.add((error as Error).message);
      }
    }
    assert.equal(messages.size, 1);
    assert.doesNotMatch([...messages][0], /169\.254|localhost|fd00|private|resolve/i);
  });

  it("rejects non-HTTP schemes, embedded credentials, and http when httpsOnly", () => {
    assert.throws(() => assertOutboundUrlAllowed("file:///etc/passwd"), OutboundUrlBlockedError);
    assert.throws(
      () => assertOutboundUrlAllowed("https://user:pass@example.com/"),
      OutboundUrlBlockedError,
    );
    assert.throws(
      () => assertOutboundUrlAllowed("http://example.com/", { httpsOnly: true }),
      OutboundUrlBlockedError,
    );
  });

  it("allows public IP literals", () => {
    assertOutboundUrlAllowed("https://8.8.8.8/.well-known/openid-configuration");
  });

  it("allows private targets outside production or with explicit opt-in, unless alwaysEnforce", () => {
    env.NODE_ENV = "development";
    assertOutboundUrlAllowed("http://localhost:8080/realms/test");
    assert.throws(
      () => assertOutboundUrlAllowed("https://127.0.0.1/", { alwaysEnforce: true }),
      OutboundUrlBlockedError,
    );

    env.NODE_ENV = "production";
    env.AUTHLAB_ALLOW_PRIVATE_OUTBOUND = "true";
    assertOutboundUrlAllowed("http://169.254.169.254/");
  });

  it("guardedFetch refuses blocked literals before any network call and disables redirects", async (t: TestContext) => {
    const calls: RequestInit[] = [];
    t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response("{}", { status: 200 });
    });

    await assert.rejects(
      guardedFetch("http://169.254.169.254/latest/meta-data/"),
      OutboundUrlBlockedError,
    );
    assert.equal(calls.length, 0);

    await guardedFetch("https://8.8.8.8/jwks", { redirect: "follow" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].redirect, "manual");
    assert.ok((calls[0] as { dispatcher?: unknown }).dispatcher, "enforcing dispatcher attached");
  });

  it("checks the resolved address at connect time (no DNS-rebinding window)", async (t: TestContext) => {
    let hits = 0;
    const server = http.createServer((_req, res) => {
      hits += 1;
      res.end("internal secret");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    // A public-looking hostname passes the synchronous URL checks; the resolver
    // then hands back loopback, as a rebinding DNS server would.
    const realLookup = dns.lookup;
    const lookupMock = t.mock.method(dns, "lookup", ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
      if (hostname === "rebind.example.test") {
        const all = (options as { all?: boolean })?.all;
        callback(null, all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4);
        return;
      }
      (realLookup as (...args: unknown[]) => void)(hostname, options, callback);
    }) as typeof dns.lookup);

    try {
      await assert.rejects(
        guardedFetch(`http://rebind.example.test:${port}/`),
        OutboundUrlBlockedError,
      );
      assert.equal(hits, 0, "request never reached the internal server");
      assert.ok(
        lookupMock.mock.calls.some((call) => call.arguments[0] === "rebind.example.test"),
        "connect-time lookup ran and saw the loopback answer",
      );

      // Control: with enforcement off, the same request does reach the server,
      // proving the rejection above came from the guard.
      env.NODE_ENV = "development";
      const response = await guardedFetch(`http://127.0.0.1:${port}/`);
      assert.equal(await response.text(), "internal secret");
      env.NODE_ENV = "production";

      // Unresolvable names get the same generic error as blocked ones.
      await assert.rejects(guardedFetch("https://does-not-exist.invalid/"), (error: unknown) => {
        return error instanceof OutboundUrlBlockedError;
      });
    } finally {
      server.close();
    }
  });
});

describe("OIDC handler uses the outbound guard in production", () => {
  useProductionEnv();

  function oidcApp(issuerUrl: string) {
    return {
      id: "app_guard",
      name: "Guarded",
      slug: "guarded",
      protocol: "OIDC" as const,
      teamId: "team_1",
      issuerUrl,
      clientId: "client-123",
      clientSecret: "secret-123",
      scopes: "openid",
      customAuthParams: [],
      pkceMode: "S256" as const,
      usePar: false,
    };
  }

  it("blocks discovery against cloud metadata before any request is sent", async (t: TestContext) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
    const { OIDCHandler } = await importFresh<typeof import("../../src/lib/oidc-handler.ts")>(
      "../../src/lib/oidc-handler.ts",
    );

    const handler = new OIDCHandler(oidcApp("https://169.254.169.254/") as never);
    await assert.rejects(handler.getOIDCConfiguration(), (error: unknown) => {
      const chain = [error, (error as { cause?: unknown })?.cause];
      return chain.some((entry) => entry instanceof Error && entry.name === "OutboundUrlBlockedError");
    });
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("rejects plain-HTTP issuers in production", async (t: TestContext) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
    const { OIDCHandler } = await importFresh<typeof import("../../src/lib/oidc-handler.ts")>(
      "../../src/lib/oidc-handler.ts",
    );

    const handler = new OIDCHandler(oidcApp("http://idp.example.com/") as never);
    await assert.rejects(handler.getOIDCConfiguration(), /must use HTTPS in production/);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});
