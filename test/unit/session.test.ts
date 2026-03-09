import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("app session helpers", () => {
  it("stores a thin auth run pointer in the slug session", async (t) => {
    t.mock.module("next/headers", {
      namedExports: {
        cookies: t.mock.fn(async () => ({})),
      },
    });
    t.mock.module("iron-session", {
      namedExports: {
        getIronSession: t.mock.fn(async () => ({})),
      },
    });

    const { saveAuthResultSession } = await importFresh<
      typeof import("../../src/lib/session.ts")
    >("../../src/lib/session.ts");

    const session = {
      runId: "",
      appSlug: "",
      protocol: "OIDC" as const,
      authenticatedAt: "",
      save: t.mock.fn(async () => undefined),
    };

    await saveAuthResultSession(session, {
      runId: "run_123",
      slug: "oidc-app",
      protocol: "OIDC",
      authenticatedAt: "2026-03-07T12:00:00.000Z",
    });

    assert.equal(session.runId, "run_123");
    assert.equal(session.appSlug, "oidc-app");
    assert.equal(session.protocol, "OIDC");
    assert.equal(session.authenticatedAt, "2026-03-07T12:00:00.000Z");
    assert.equal(session.save.mock.callCount(), 1);
  });

  it("resolves the active auth run from the stored run id", async (t) => {
    const fakeSession = {
      runId: "run_456",
      appSlug: "saml-app",
      protocol: "SAML" as const,
      authenticatedAt: "2026-03-07T12:00:00.000Z",
    };

    t.mock.module("next/headers", {
      namedExports: {
        cookies: t.mock.fn(async () => ({})),
      },
    });
    t.mock.module("iron-session", {
      namedExports: {
        getIronSession: t.mock.fn(async () => fakeSession),
      },
    });
    t.mock.module("@/repositories/auth-run.repo", {
      namedExports: {
        getAuthRunById: t.mock.fn(async (id: string) => ({
          id,
          appInstanceId: "app_1",
          protocol: "SAML",
          status: "AUTHENTICATED",
          loginState: null,
          nonce: null,
          nonceStatus: null,
          oidcSubject: null,
          oidcSessionId: null,
          runtimeOverrides: {},
          outboundAuthParams: {},
          claims: { sub: "user-1" },
          idToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          accessToken: null,
          rawTokenResponse: null,
          rawSamlResponseXml: "<xml />",
          userinfo: null,
          lastIntrospection: null,
          lastRevocationAt: null,
          authenticatedAt: new Date("2026-03-07T12:00:00.000Z"),
          completedAt: null,
          logoutState: null,
          logoutCompletedAt: null,
          createdAt: new Date("2026-03-07T12:00:00.000Z"),
          updatedAt: new Date("2026-03-07T12:00:00.000Z"),
        })),
      },
    });

    const { getActiveAuthRun } = await importFresh<
      typeof import("../../src/lib/session.ts")
    >("../../src/lib/session.ts");

    const run = await getActiveAuthRun("saml-app");
    assert.ok(run);
    assert.equal(run?.id, "run_456");
    assert.equal(run?.claims.sub, "user-1");
  });

  it("treats logged out runs as inactive and destroys the stale session", async (t) => {
    const destroy = t.mock.fn();
    const fakeSession = {
      runId: "run_789",
      appSlug: "oidc-app",
      protocol: "OIDC" as const,
      authenticatedAt: "2026-03-07T12:00:00.000Z",
      destroy,
    };

    t.mock.module("next/headers", {
      namedExports: {
        cookies: t.mock.fn(async () => ({})),
      },
    });
    t.mock.module("iron-session", {
      namedExports: {
        getIronSession: t.mock.fn(async () => fakeSession),
      },
    });
    t.mock.module("@/repositories/auth-run.repo", {
      namedExports: {
        getAuthRunById: t.mock.fn(async () => ({
          id: "run_789",
          appInstanceId: "app_1",
          protocol: "OIDC",
          grantType: "AUTHORIZATION_CODE",
          status: "LOGGED_OUT",
          loginState: null,
          nonce: null,
          nonceStatus: null,
          oidcSubject: "user-1",
          oidcSessionId: "sid-1",
          runtimeOverrides: {},
          outboundAuthParams: {},
          claims: { sub: "user-1", sid: "sid-1" },
          idToken: "id-token",
          accessToken: "access-token",
          refreshToken: null,
          accessTokenExpiresAt: null,
          rawTokenResponse: null,
          rawSamlResponseXml: null,
          userinfo: null,
          lastIntrospection: null,
          lastRevocationAt: null,
          authenticatedAt: new Date("2026-03-07T12:00:00.000Z"),
          completedAt: new Date("2026-03-07T12:10:00.000Z"),
          logoutState: null,
          logoutCompletedAt: new Date("2026-03-07T12:10:00.000Z"),
          createdAt: new Date("2026-03-07T12:00:00.000Z"),
          updatedAt: new Date("2026-03-07T12:10:00.000Z"),
        })),
      },
    });

    const { getActiveAuthRun } = await importFresh<
      typeof import("../../src/lib/session.ts")
    >("../../src/lib/session.ts");

    const run = await getActiveAuthRun("oidc-app");
    assert.equal(run, null);
    assert.equal(destroy.mock.callCount(), 1);
  });
});
