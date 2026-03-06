import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("auth handler factory", () => {
  it("creates an OIDC handler for OIDC app instances", async (t) => {
    class MockOIDCHandler {
      appInstance: unknown;

      constructor(appInstance: unknown) {
        this.appInstance = appInstance;
      }
    }

    t.mock.module("@/lib/oidc-handler", {
      namedExports: { OIDCHandler: MockOIDCHandler },
    });
    t.mock.module("@/lib/saml-handler", {
      namedExports: { SAMLHandler: class SAMLHandler {} },
    });

    const { createAuthHandler } = await importFresh<
      typeof import("../../src/lib/auth-factory.ts")
    >("../../src/lib/auth-factory.ts");

    const appInstance = { protocol: "OIDC", slug: "oidc-app" } as const;
    const handler = createAuthHandler(appInstance as never);

    assert.ok(handler instanceof MockOIDCHandler);
    assert.equal((handler as MockOIDCHandler).appInstance, appInstance);
  });

  it("creates a SAML handler for SAML app instances", async (t) => {
    class MockSAMLHandler {
      appInstance: unknown;

      constructor(appInstance: unknown) {
        this.appInstance = appInstance;
      }
    }

    t.mock.module("@/lib/oidc-handler", {
      namedExports: { OIDCHandler: class OIDCHandler {} },
    });
    t.mock.module("@/lib/saml-handler", {
      namedExports: { SAMLHandler: MockSAMLHandler },
    });

    const { createAuthHandler } = await importFresh<
      typeof import("../../src/lib/auth-factory.ts")
    >("../../src/lib/auth-factory.ts");

    const appInstance = { protocol: "SAML", slug: "saml-app" } as const;
    const handler = createAuthHandler(appInstance as never);

    assert.ok(handler instanceof MockSAMLHandler);
    assert.equal((handler as MockSAMLHandler).appInstance, appInstance);
  });

  it("rejects unsupported protocols", async (t) => {
    t.mock.module("@/lib/oidc-handler", {
      namedExports: { OIDCHandler: class OIDCHandler {} },
    });
    t.mock.module("@/lib/saml-handler", {
      namedExports: { SAMLHandler: class SAMLHandler {} },
    });

    const { createAuthHandler } = await importFresh<
      typeof import("../../src/lib/auth-factory.ts")
    >("../../src/lib/auth-factory.ts");

    assert.throws(
      () => createAuthHandler({ protocol: "LDAP" } as never),
      /Unsupported protocol: LDAP/,
    );
  });
});
