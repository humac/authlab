import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("SAML callback slug route", () => {
  it("allows IdP-initiated callback without RelayState", async (t) => {
    const getState = t.mock.fn(async () => null);
    const getAppInstanceBySlug = t.mock.fn(async () => ({
      slug: "lab-okta-govon-saml",
    }));
    const handleCallback = t.mock.fn(async () => ({
      claims: { sub: "user-1" },
      rawXml: "<Assertion />",
    }));
    const saveAuthResultSession = t.mock.fn(async () => {});
    const createAuthRun = t.mock.fn(async () => ({
      id: "run-1",
    }));
    const completeAuthRun = t.mock.fn(async () => ({
      id: "run-1",
      authenticatedAt: new Date("2026-03-07T12:00:00.000Z"),
    }));

    class MockSAMLHandler {
      async handleCallback(...args: [string, string]) {
        void args;
        return handleCallback();
      }
    }

    t.mock.module("@/repositories/app-instance.repo", {
      namedExports: {
        getAppInstanceBySlug,
      },
    });
    t.mock.module("@/lib/saml-handler", {
      namedExports: {
        SAMLHandler: MockSAMLHandler,
      },
    });
    t.mock.module("@/lib/state-store", {
      namedExports: {
        getState,
      },
    });
    t.mock.module("@/lib/session", {
      namedExports: {
        getAppSession: t.mock.fn(async () => ({})),
        saveAuthResultSession,
      },
    });
    t.mock.module("@/repositories/auth-run.repo", {
      namedExports: {
        createAuthRun,
        getAuthRunById: t.mock.fn(async () => null),
        completeAuthRun,
        markAuthRunFailed: t.mock.fn(async () => undefined),
      },
    });

    const { POST } = await importFresh<
      typeof import("../../src/app/api/auth/callback/saml/[slug]/route.ts")
    >("../../src/app/api/auth/callback/saml/[slug]/route.ts");

    const request = new Request("https://authlab.keydatalab.ca/api/auth/callback/saml/lab-okta-govon-saml", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        SAMLResponse: Buffer.from("<Response />").toString("base64"),
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "lab-okta-govon-saml" }),
    });

    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "http://localhost:3000/test/lab-okta-govon-saml/inspector",
    );
    assert.equal(getState.mock.callCount(), 0);
    assert.equal(getAppInstanceBySlug.mock.callCount(), 1);
    assert.equal(handleCallback.mock.callCount(), 1);
    assert.equal(saveAuthResultSession.mock.callCount(), 1);
    assert.equal(createAuthRun.mock.callCount(), 1);
    assert.equal(completeAuthRun.mock.callCount(), 1);
  });

  it("still rejects invalid RelayState when RelayState is provided", async (t) => {
    const getState = t.mock.fn(async () => null);
    const getAppInstanceBySlug = t.mock.fn(async () => null);

    t.mock.module("@/repositories/app-instance.repo", {
      namedExports: {
        getAppInstanceBySlug,
      },
    });
    t.mock.module("@/lib/saml-handler", {
      namedExports: {
        SAMLHandler: class {},
      },
    });
    t.mock.module("@/lib/state-store", {
      namedExports: {
        getState,
      },
    });
    t.mock.module("@/lib/session", {
      namedExports: {
        getAppSession: t.mock.fn(async () => ({})),
        saveAuthResultSession: t.mock.fn(async () => {}),
      },
    });
    t.mock.module("@/repositories/auth-run.repo", {
      namedExports: {
        createAuthRun: t.mock.fn(async () => ({ id: "run-1" })),
        getAuthRunById: t.mock.fn(async () => null),
        completeAuthRun: t.mock.fn(async () => ({ id: "run-1" })),
        markAuthRunFailed: t.mock.fn(async () => undefined),
      },
    });

    const { POST } = await importFresh<
      typeof import("../../src/app/api/auth/callback/saml/[slug]/route.ts")
    >("../../src/app/api/auth/callback/saml/[slug]/route.ts");

    const request = new Request("https://authlab.keydatalab.ca/api/auth/callback/saml/lab-okta-govon-saml", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        SAMLResponse: Buffer.from("<Response />").toString("base64"),
        RelayState: "missing-state",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "lab-okta-govon-saml" }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(
      body.error,
      /Invalid or expired RelayState/i,
    );
    assert.equal(getState.mock.callCount(), 1);
    assert.equal(getAppInstanceBySlug.mock.callCount(), 0);
  });
});
