import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

function createOidcApp(pkceMode: "S256" | "PLAIN" | "NONE" = "S256") {
  return {
    id: "app_1",
    name: "OIDC App",
    slug: "oidc-app",
    protocol: "OIDC" as const,
    teamId: "team_1",
    issuerUrl: "https://issuer.example.com",
    clientId: "client-123",
    clientSecret: "secret-123",
    scopes: "openid profile email",
    customAuthParams: [
      { key: "prompt", value: "login" },
      { key: "client_id", value: "blocked-client" },
    ],
    pkceMode,
    entryPoint: null,
    issuer: null,
    idpCert: null,
    nameIdFormat: null,
    forceAuthnDefault: false,
    isPassiveDefault: false,
    signAuthnRequests: false,
    spSigningPrivateKey: null,
    spSigningCert: null,
    buttonColor: "#3B71CA",
    createdAt: new Date("2026-03-07T00:00:00.000Z"),
    updatedAt: new Date("2026-03-07T00:00:00.000Z"),
  };
}

describe("OIDC handler", () => {
  it("filters reserved auth params from saved defaults and runtime overrides", async (t) => {
    const discovery = t.mock.fn(async () => ({ issuer: "https://issuer.example.com" }));
    const buildAuthorizationUrl = t.mock.fn(
      (_config: unknown, parameters: Record<string, string>) => {
        const url = new URL("https://issuer.example.com/authorize");
        Object.entries(parameters).forEach(([key, value]) => {
          url.searchParams.set(key, value);
        });
        return url;
      },
    );

    t.mock.module("openid-client", {
      namedExports: {
        ClientSecretPost: t.mock.fn(() => ({})),
        discovery,
        allowInsecureRequests: t.mock.fn(),
        randomPKCECodeVerifier: t.mock.fn(() => "verifier-123"),
        calculatePKCECodeChallenge: t.mock.fn(async () => "challenge-123"),
        randomState: t.mock.fn(() => "state-123"),
        randomNonce: t.mock.fn(() => "nonce-123"),
        buildAuthorizationUrl,
      },
    });

    const { OIDCHandler } = await importFresh<
      typeof import("../../src/lib/oidc-handler.ts")
    >("../../src/lib/oidc-handler.ts");

    const handler = new OIDCHandler(createOidcApp("S256"));

    const result = await handler.getAuthorizationUrl(
      "https://app.example.com/callback",
      {
        runtimeOverrides: {
          prompt: "consent",
          login_hint: "analyst@example.com",
          nonce: "blocked-nonce",
          redirect_uri: "https://attacker.example.com/callback",
        },
      },
    );

    assert.equal(discovery.mock.callCount(), 1);
    assert.equal(buildAuthorizationUrl.mock.callCount(), 1);
    assert.ok(result.outboundParams);
    assert.equal(result.outboundParams.client_id, undefined);
    assert.equal(result.outboundParams.redirect_uri, "https://app.example.com/callback");
    assert.equal(result.outboundParams.prompt, "consent");
    assert.equal(result.outboundParams.login_hint, "analyst@example.com");
    assert.equal(result.outboundParams.nonce, "nonce-123");
  });

  it("uses plain PKCE when configured for legacy testing", async (t) => {
    const buildAuthorizationUrl = t.mock.fn(
      (_config: unknown, parameters: Record<string, string>) => {
        const url = new URL("https://issuer.example.com/authorize");
        Object.entries(parameters).forEach(([key, value]) => {
          url.searchParams.set(key, value);
        });
        return url;
      },
    );
    const calculatePKCECodeChallenge = t.mock.fn(async () => "challenge-123");

    t.mock.module("openid-client", {
      namedExports: {
        ClientSecretPost: t.mock.fn(() => ({})),
        discovery: t.mock.fn(async () => ({ issuer: "https://issuer.example.com" })),
        allowInsecureRequests: t.mock.fn(),
        randomPKCECodeVerifier: t.mock.fn(() => "verifier-plain"),
        calculatePKCECodeChallenge,
        randomState: t.mock.fn(() => "state-123"),
        randomNonce: t.mock.fn(() => "nonce-123"),
        buildAuthorizationUrl,
      },
    });

    const { OIDCHandler } = await importFresh<
      typeof import("../../src/lib/oidc-handler.ts")
    >("../../src/lib/oidc-handler.ts");

    const handler = new OIDCHandler(createOidcApp("PLAIN"));
    const result = await handler.getAuthorizationUrl("https://app.example.com/callback");

    assert.equal(calculatePKCECodeChallenge.mock.callCount(), 0);
    assert.equal(result.codeVerifier, "verifier-plain");
    assert.equal(result.outboundParams?.code_challenge, "verifier-plain");
    assert.equal(result.outboundParams?.code_challenge_method, "PLAIN");
  });

  it("omits PKCE parameters when disabled", async (t) => {
    const buildAuthorizationUrl = t.mock.fn(
      (_config: unknown, parameters: Record<string, string>) => {
        const url = new URL("https://issuer.example.com/authorize");
        Object.entries(parameters).forEach(([key, value]) => {
          url.searchParams.set(key, value);
        });
        return url;
      },
    );
    const randomPKCECodeVerifier = t.mock.fn(() => "verifier-none");

    t.mock.module("openid-client", {
      namedExports: {
        ClientSecretPost: t.mock.fn(() => ({})),
        discovery: t.mock.fn(async () => ({ issuer: "https://issuer.example.com" })),
        allowInsecureRequests: t.mock.fn(),
        randomPKCECodeVerifier,
        calculatePKCECodeChallenge: t.mock.fn(async () => "challenge-123"),
        randomState: t.mock.fn(() => "state-123"),
        randomNonce: t.mock.fn(() => "nonce-123"),
        buildAuthorizationUrl,
      },
    });

    const { OIDCHandler } = await importFresh<
      typeof import("../../src/lib/oidc-handler.ts")
    >("../../src/lib/oidc-handler.ts");

    const handler = new OIDCHandler(createOidcApp("NONE"));
    const result = await handler.getAuthorizationUrl("https://app.example.com/callback");

    assert.equal(randomPKCECodeVerifier.mock.callCount(), 0);
    assert.equal(result.codeVerifier, null);
    assert.equal(result.outboundParams?.code_challenge, undefined);
    assert.equal(result.outboundParams?.code_challenge_method, undefined);
  });
});
