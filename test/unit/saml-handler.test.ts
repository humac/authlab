import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

function createSamlApp() {
  return {
    id: "app_saml_1",
    name: "SAML App",
    slug: "saml-app",
    protocol: "SAML" as const,
    teamId: "team_1",
    issuerUrl: null,
    clientId: null,
    clientSecret: null,
    scopes: null,
    customAuthParams: [],
    pkceMode: "S256" as const,
    usePar: false,
    entryPoint: "https://idp.example.com/sso/saml",
    samlLogoutUrl: "https://idp.example.com/logout/saml",
    issuer: "https://authlab.example.com/sp",
    idpCert: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
    nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    requestedAuthnContext:
      "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
    forceAuthnDefault: false,
    isPassiveDefault: false,
    samlSignatureAlgorithm: "SHA1" as const,
    clockSkewToleranceSeconds: 120,
    signAuthnRequests: true,
    spSigningPrivateKey: "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----",
    spSigningCert: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
    spEncryptionPrivateKey: "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----",
    spEncryptionCert: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
    tags: [],
    notes: null,
    buttonColor: "#3B71CA",
    createdAt: new Date("2026-03-08T00:00:00.000Z"),
    updatedAt: new Date("2026-03-08T00:00:00.000Z"),
  };
}

describe("SAML handler", () => {
  it("applies requested authn context, signature algorithm, and clock skew settings", async (t) => {
    const constructorOptions: Array<Record<string, unknown>> = [];
    const getAuthorizeUrlAsync = t.mock.fn(async () => "https://idp.example.com/sso/saml?SAMLRequest=abc");

    t.mock.module("@node-saml/node-saml", {
      namedExports: {
        SAML: class {
          constructor(options: Record<string, unknown>) {
            constructorOptions.push(options);
          }

          async getAuthorizeUrlAsync() {
            return getAuthorizeUrlAsync();
          }
        },
      },
    });

    const { SAMLHandler } = await importFresh<
      typeof import("../../src/lib/saml-handler.ts")
    >("../../src/lib/saml-handler.ts");

    const handler = new SAMLHandler(createSamlApp());
    const result = await handler.getAuthorizationUrl("https://authlab.example.com/api/auth/callback/saml/saml-app", {
      runtimeOverrides: {
        forceAuthn: "true",
        isPassive: "true",
        requestedAuthnContext: "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract",
      },
    });

    assert.equal(getAuthorizeUrlAsync.mock.callCount(), 1);
    const options = constructorOptions[0];
    assert.ok(options);
    assert.equal(options.forceAuthn, true);
    assert.equal(options.passive, true);
    assert.equal(options.acceptedClockSkewMs, 120000);
    assert.equal(options.signatureAlgorithm, "sha1");
    assert.equal(options.disableRequestedAuthnContext, false);
    assert.deepEqual(options.authnContext, [
      "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract",
    ]);
    assert.equal(
      result.outboundParams?.requestedAuthnContext,
      "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract",
    );
    assert.equal(result.outboundParams?.samlSignatureAlgorithm, "SHA1");
    assert.equal(result.outboundParams?.clockSkewToleranceSeconds, "120");
  });

  it("omits RequestedAuthnContext when the runtime override clears it", async (t) => {
    const constructorOptions: Array<Record<string, unknown>> = [];

    t.mock.module("@node-saml/node-saml", {
      namedExports: {
        SAML: class {
          constructor(options: Record<string, unknown>) {
            constructorOptions.push(options);
          }

          async getAuthorizeUrlAsync() {
            return "https://idp.example.com/sso/saml?SAMLRequest=abc";
          }
        },
      },
    });

    const { SAMLHandler } = await importFresh<
      typeof import("../../src/lib/saml-handler.ts")
    >("../../src/lib/saml-handler.ts");

    const handler = new SAMLHandler(createSamlApp());
    const result = await handler.getAuthorizationUrl(
      "https://authlab.example.com/api/auth/callback/saml/saml-app",
      {
        runtimeOverrides: {
          requestedAuthnContext: "",
        },
      },
    );

    const options = constructorOptions[0];
    assert.ok(options);
    assert.equal(options.disableRequestedAuthnContext, true);
    assert.deepEqual(options.authnContext, []);
    assert.equal(result.outboundParams?.requestedAuthnContext, "");
  });

  it("builds a SAML logout request with the configured logout endpoint", async (t) => {
    const constructorOptions: Array<Record<string, unknown>> = [];
    const getLogoutUrlAsync = t.mock.fn(
      async (_profile: Record<string, unknown>, relayState: string) =>
        `https://idp.example.com/logout/saml?RelayState=${relayState}`,
    );

    t.mock.module("@node-saml/node-saml", {
      namedExports: {
        SAML: class {
          constructor(options: Record<string, unknown>) {
            constructorOptions.push(options);
          }

          async getLogoutUrlAsync(
            profile: Record<string, unknown>,
            relayState: string,
          ) {
            return getLogoutUrlAsync(profile, relayState);
          }
        },
      },
    });

    const { SAMLHandler } = await importFresh<
      typeof import("../../src/lib/saml-handler.ts")
    >("../../src/lib/saml-handler.ts");

    const handler = new SAMLHandler(createSamlApp());
    const url = await handler.buildLogoutUrl(
      "https://authlab.example.com/api/auth/callback/saml/saml-app",
      "https://authlab.example.com/api/auth/logout/saml/saml-app/callback",
      "logout-state-123",
      {
        nameID: "user@example.com",
        nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        sessionIndex: "_session123",
      },
    );

    assert.equal(
      url,
      "https://idp.example.com/logout/saml?RelayState=logout-state-123",
    );
    const options = constructorOptions[0];
    assert.equal(options.logoutUrl, "https://idp.example.com/logout/saml");
    assert.equal(
      options.logoutCallbackUrl,
      "https://authlab.example.com/api/auth/logout/saml/saml-app/callback",
    );
    assert.equal(getLogoutUrlAsync.mock.callCount(), 1);
  });

  it("classifies redirect logout callbacks as requests or responses", async (t) => {
    t.mock.module("@node-saml/node-saml", {
      namedExports: {
        SAML: class {
          async validateRedirectAsync() {
            return {
              loggedOut: true,
              profile: {
                ID: "_logout_request_1",
                issuer: "https://idp.example.com/metadata",
                nameID: "user@example.com",
                nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
                sessionIndex: "_session123",
              },
            };
          }
        },
      },
    });

    const { SAMLHandler } = await importFresh<
      typeof import("../../src/lib/saml-handler.ts")
    >("../../src/lib/saml-handler.ts");

    const handler = new SAMLHandler(createSamlApp());
    const result = await handler.handleLogoutRedirect(
      "https://authlab.example.com/api/auth/logout/saml/saml-app/callback?SAMLRequest=abc&RelayState=logout-state-123",
      "https://authlab.example.com/api/auth/callback/saml/saml-app",
      "https://authlab.example.com/api/auth/logout/saml/saml-app/callback",
    );

    assert.equal(result.kind, "request");
    assert.equal(result.profile?.ID, "_logout_request_1");
    assert.equal(result.profile?.nameID, "user@example.com");
    assert.equal(result.profile?.sessionIndex, "_session123");
  });
});
