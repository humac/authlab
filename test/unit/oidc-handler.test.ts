import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

function createOidcApp(
  pkceMode: "S256" | "PLAIN" | "NONE" = "S256",
  usePar = false,
) {
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
    usePar,
    entryPoint: null,
    samlLogoutUrl: null,
    issuer: null,
    idpCert: null,
    nameIdFormat: null,
    requestedAuthnContext: null,
    forceAuthnDefault: false,
    isPassiveDefault: false,
    samlSignatureAlgorithm: "SHA256" as const,
    clockSkewToleranceSeconds: 0,
    signAuthnRequests: false,
    spSigningPrivateKey: null,
    spSigningCert: null,
    spEncryptionPrivateKey: null,
    spEncryptionCert: null,
    tags: [],
    notes: null,
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

  it("initiates device authorization with client credentials and requested scopes", async (t) => {
    t.mock.module("openid-client", {
      namedExports: {
        ClientSecretPost: t.mock.fn(() => ({})),
        discovery: t.mock.fn(async () => ({
          serverMetadata() {
            return {
              issuer: "https://issuer.example.com",
              device_authorization_endpoint: "https://issuer.example.com/device",
            };
          },
        })),
        allowInsecureRequests: t.mock.fn(),
      },
    });

    const fetchMock = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://issuer.example.com/device");
      assert.equal(init?.method, "POST");
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("client_id"), "client-123");
      assert.equal(body.get("client_secret"), "secret-123");
      assert.equal(body.get("scope"), "openid profile offline_access");

      return new Response(
        JSON.stringify({
          device_code: "device-code-123",
          user_code: "ABCD-EFGH",
          verification_uri: "https://issuer.example.com/activate",
          verification_uri_complete:
            "https://issuer.example.com/activate?user_code=ABCD-EFGH",
          expires_in: 900,
          interval: 5,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const { OIDCHandler } = await importFresh<
      typeof import("../../src/lib/oidc-handler.ts")
    >("../../src/lib/oidc-handler.ts");

    const handler = new OIDCHandler(createOidcApp("S256"));
    const result = await handler.initiateDeviceAuthorization(
      "openid profile offline_access",
    );

    assert.equal(result.deviceCode, "device-code-123");
    assert.equal(result.userCode, "ABCD-EFGH");
    assert.equal(result.verificationUri, "https://issuer.example.com/activate");
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it("uses pushed authorization requests when enabled", async (t) => {
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
        discovery: t.mock.fn(async () => ({
          serverMetadata() {
            return {
              issuer: "https://issuer.example.com",
              pushed_authorization_request_endpoint: "https://issuer.example.com/par",
            };
          },
        })),
        allowInsecureRequests: t.mock.fn(),
        randomPKCECodeVerifier: t.mock.fn(() => "verifier-123"),
        calculatePKCECodeChallenge: t.mock.fn(async () => "challenge-123"),
        randomState: t.mock.fn(() => "state-123"),
        randomNonce: t.mock.fn(() => "nonce-123"),
        buildAuthorizationUrl,
      },
    });

    const fetchMock = t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        assert.equal(String(input), "https://issuer.example.com/par");
        assert.equal(init?.method, "POST");
        const body = init?.body as URLSearchParams;
        assert.equal(body.get("client_id"), "client-123");
        assert.equal(body.get("client_secret"), "secret-123");
        assert.equal(body.get("redirect_uri"), "https://app.example.com/callback");
        assert.equal(body.get("state"), "state-123");
        return new Response(
          JSON.stringify({
            request_uri: "urn:authlab:par:123",
            expires_in: 90,
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    const { OIDCHandler } = await importFresh<
      typeof import("../../src/lib/oidc-handler.ts")
    >("../../src/lib/oidc-handler.ts");

    const handler = new OIDCHandler(createOidcApp("S256", true));
    const result = await handler.getAuthorizationUrl("https://app.example.com/callback", {
      runtimeOverrides: {
        prompt: "consent",
      },
    });

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(buildAuthorizationUrl.mock.callCount(), 1);
    assert.equal(result.outboundParams?.request_uri, "urn:authlab:par:123");
    assert.deepEqual(result.traceRequest, {
      method: "POST",
      endpoint: "https://issuer.example.com/par",
      protocol: "OIDC",
      body: {
        redirect_uri: "https://app.example.com/callback",
        scope: "openid profile email",
        state: "state-123",
        nonce: "nonce-123",
        prompt: "consent",
        code_challenge: "challenge-123",
        code_challenge_method: "S256",
        client_id: "client-123",
      },
      clientAuthentication: "client_secret_post",
    });
    assert.match(result.traceResponse ?? "", /request_uri/);
    assert.equal(result.traceMetadata?.parUsed, true);
  });

  it("fails clearly when PAR is enabled but discovery omits the PAR endpoint", async (t) => {
    t.mock.module("openid-client", {
      namedExports: {
        ClientSecretPost: t.mock.fn(() => ({})),
        discovery: t.mock.fn(async () => ({
          serverMetadata() {
            return {
              issuer: "https://issuer.example.com",
            };
          },
        })),
        allowInsecureRequests: t.mock.fn(),
        randomPKCECodeVerifier: t.mock.fn(() => "verifier-123"),
        calculatePKCECodeChallenge: t.mock.fn(async () => "challenge-123"),
        randomState: t.mock.fn(() => "state-123"),
        randomNonce: t.mock.fn(() => "nonce-123"),
        buildAuthorizationUrl: t.mock.fn(),
      },
    });

    const { OIDCHandler } = await importFresh<
      typeof import("../../src/lib/oidc-handler.ts")
    >("../../src/lib/oidc-handler.ts");

    const handler = new OIDCHandler(createOidcApp("S256", true));

    await assert.rejects(
      () => handler.getAuthorizationUrl("https://app.example.com/callback"),
      /does not advertise a pushed authorization request endpoint/,
    );
  });

  it("polls device authorization and returns a pending state without failing", async (t) => {
    t.mock.module("openid-client", {
      namedExports: {
        ClientSecretPost: t.mock.fn(() => ({})),
        discovery: t.mock.fn(async () => ({
          serverMetadata() {
            return {
              issuer: "https://issuer.example.com",
              token_endpoint: "https://issuer.example.com/token",
            };
          },
        })),
        allowInsecureRequests: t.mock.fn(),
      },
    });

    t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          error: "authorization_pending",
          error_description: "Waiting for user approval",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { OIDCHandler } = await importFresh<
      typeof import("../../src/lib/oidc-handler.ts")
    >("../../src/lib/oidc-handler.ts");

    const handler = new OIDCHandler(createOidcApp("S256"));
    const result = await handler.pollDeviceAuthorization({
      deviceCode: "device-code-123",
      expiresIn: 900,
      interval: 5,
    });

    assert.equal(result.status, "pending");
    assert.equal(result.error, "Waiting for user approval");
    assert.equal(result.interval, 5);
  });

  it("exchanges the active subject token through the token endpoint", async (t) => {
    t.mock.module("openid-client", {
      namedExports: {
        ClientSecretPost: t.mock.fn(() => ({})),
        discovery: t.mock.fn(async () => ({
          serverMetadata() {
            return {
              issuer: "https://issuer.example.com",
              token_endpoint: "https://issuer.example.com/token",
            };
          },
        })),
        allowInsecureRequests: t.mock.fn(),
      },
    });

    const fetchMock = t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        assert.equal(String(input), "https://issuer.example.com/token");
        assert.equal(init?.method, "POST");
        const body = init?.body as URLSearchParams;
        assert.equal(
          body.get("grant_type"),
          "urn:ietf:params:oauth:grant-type:token-exchange",
        );
        assert.equal(body.get("subject_token"), "subject-access-token");
        assert.equal(
          body.get("subject_token_type"),
          "urn:ietf:params:oauth:token-type:access_token",
        );
        assert.equal(
          body.get("requested_token_type"),
          "urn:ietf:params:oauth:token-type:access_token",
        );
        assert.equal(body.get("audience"), "api://orders");
        assert.equal(body.get("scope"), "orders.read");

        return new Response(
          JSON.stringify({
            access_token: "delegated-access-token",
            issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
            token_type: "Bearer",
            expires_in: 1800,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    const { OIDCHandler } = await importFresh<
      typeof import("../../src/lib/oidc-handler.ts")
    >("../../src/lib/oidc-handler.ts");

    const handler = new OIDCHandler(createOidcApp("S256"));
    const result = await handler.exchangeToken({
      subjectToken: "subject-access-token",
      subjectTokenType: "urn:ietf:params:oauth:token-type:access_token",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      audience: "api://orders",
      scope: "orders.read",
    });

    assert.equal(result.grantType, "TOKEN_EXCHANGE");
    assert.equal(result.accessToken, "delegated-access-token");
    assert.equal(result.rawTokenResponse?.includes("delegated-access-token"), true);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});
