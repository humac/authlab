import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { importFresh } from "./test-helpers.ts";

const ISSUER = "https://issuer.example.com";
const CLIENT_ID = "client-123";
const JWKS_URI = `${ISSUER}/jwks`;
const BACKCHANNEL_EVENT =
  "http://schemas.openid.net/event/backchannel-logout";

describe("OIDC back-channel logout validation", () => {
  it("validates a signed logout token and returns sid/sub correlation claims", async (t) => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);

    t.mock.module("@/lib/oidc-handler", {
      namedExports: {
        OIDCHandler: class {
          async getOIDCConfiguration() {
            return {
              serverMetadata() {
                return {
                  issuer: ISSUER,
                  jwks_uri: JWKS_URI,
                };
              },
            };
          }
        },
      },
    });

    const fetchMock = t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          keys: [{ ...publicJwk, alg: "RS256", kid: "kid-1", use: "sig" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { validateOidcBackchannelLogoutToken } = await importFresh<
      typeof import("../../src/lib/oidc-backchannel-logout.ts")
    >("../../src/lib/oidc-backchannel-logout.ts");

    const logoutToken = await new SignJWT({
      sub: "user-123",
      sid: "sid-123",
      events: { [BACKCHANNEL_EVENT]: {} },
    })
      .setProtectedHeader({ alg: "RS256", kid: "kid-1" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setJti("jti-123")
      .setIssuedAt()
      .sign(privateKey);

    const result = await validateOidcBackchannelLogoutToken(
      {
        id: "app_1",
        name: "OIDC App",
        slug: "oidc-app",
        protocol: "OIDC",
        teamId: "team_1",
        issuerUrl: ISSUER,
        clientId: CLIENT_ID,
        clientSecret: "secret",
        scopes: "openid profile email",
        customAuthParams: [],
        pkceMode: "S256",
        usePar: false,
        entryPoint: null,
        samlLogoutUrl: null,
        issuer: null,
        idpCert: null,
        nameIdFormat: null,
        requestedAuthnContext: null,
        forceAuthnDefault: false,
        isPassiveDefault: false,
        samlSignatureAlgorithm: "SHA256",
        clockSkewToleranceSeconds: 0,
        signAuthnRequests: false,
        spSigningPrivateKey: null,
        spSigningCert: null,
        spEncryptionPrivateKey: null,
        spEncryptionCert: null,
        tags: [],
        buttonColor: "#3B71CA",
        createdAt: new Date("2026-03-08T00:00:00.000Z"),
        updatedAt: new Date("2026-03-08T00:00:00.000Z"),
      },
      logoutToken,
    );

    assert.equal(result.subject, "user-123");
    assert.equal(result.sessionId, "sid-123");
    assert.equal(result.jwtId, "jti-123");
    assert.equal(result.algorithm, "RS256");
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it("rejects logout tokens that violate the back-channel contract", async (t) => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);

    t.mock.module("@/lib/oidc-handler", {
      namedExports: {
        OIDCHandler: class {
          async getOIDCConfiguration() {
            return {
              serverMetadata() {
                return {
                  issuer: ISSUER,
                  jwks_uri: JWKS_URI,
                };
              },
            };
          }
        },
      },
    });

    t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          keys: [{ ...publicJwk, alg: "RS256", kid: "kid-2", use: "sig" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { validateOidcBackchannelLogoutToken } = await importFresh<
      typeof import("../../src/lib/oidc-backchannel-logout.ts")
    >("../../src/lib/oidc-backchannel-logout.ts");

    const logoutToken = await new SignJWT({
      sub: "user-123",
      nonce: "should-not-be-here",
      events: { [BACKCHANNEL_EVENT]: {} },
    })
      .setProtectedHeader({ alg: "RS256", kid: "kid-2" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .sign(privateKey);

    await assert.rejects(
      () =>
        validateOidcBackchannelLogoutToken(
          {
            id: "app_1",
            name: "OIDC App",
            slug: "oidc-app",
            protocol: "OIDC",
            teamId: "team_1",
            issuerUrl: ISSUER,
            clientId: CLIENT_ID,
            clientSecret: "secret",
            scopes: "openid profile email",
            customAuthParams: [],
            pkceMode: "S256",
            usePar: false,
            entryPoint: null,
            samlLogoutUrl: null,
            issuer: null,
            idpCert: null,
            nameIdFormat: null,
            requestedAuthnContext: null,
            forceAuthnDefault: false,
            isPassiveDefault: false,
            samlSignatureAlgorithm: "SHA256",
            clockSkewToleranceSeconds: 0,
            signAuthnRequests: false,
            spSigningPrivateKey: null,
            spSigningCert: null,
            spEncryptionPrivateKey: null,
            spEncryptionCert: null,
            tags: [],
            buttonColor: "#3B71CA",
            createdAt: new Date("2026-03-08T00:00:00.000Z"),
            updatedAt: new Date("2026-03-08T00:00:00.000Z"),
          },
          logoutToken,
        ),
      /must not include a nonce/i,
    );
  });
});
