import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

function cloneClaims(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("app session save helper", () => {
  it("persists SAML payloads and strips large raw fields on cookie overflow", async (t) => {
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

    const snapshots: Array<{
      rawXml: string | undefined;
      rawToken: string | undefined;
      accessToken: string | undefined;
      claims: Record<string, unknown>;
    }> = [];

    let saveAttempt = 0;
    const session = {
      appSlug: "",
      protocol: "SAML" as const,
      claims: {} as Record<string, unknown>,
      rawToken: undefined as string | undefined,
      rawXml: undefined as string | undefined,
      idToken: undefined as string | undefined,
      accessToken: undefined as string | undefined,
      authenticatedAt: "",
      save: t.mock.fn(async function save() {
        saveAttempt += 1;
        snapshots.push({
          rawXml: session.rawXml,
          rawToken: session.rawToken,
          accessToken: session.accessToken,
          claims: cloneClaims(session.claims),
        });

        if (saveAttempt === 1) {
          throw new Error(
            "iron-session: Cookie length is too big (5000 bytes), browsers will refuse it. Try to remove some data.",
          );
        }
      }),
    };

    await saveAuthResultSession(session, {
      slug: "saml-app",
      protocol: "SAML",
      claims: { sub: "user-1", groups: ["a", "b"] },
      rawXml: "<xml>very-large</xml>",
    });

    assert.equal(session.appSlug, "saml-app");
    assert.equal(session.protocol, "SAML");
    assert.equal(session.rawXml, undefined);
    assert.equal(session.rawToken, undefined);
    assert.equal(session.accessToken, undefined);
    assert.deepEqual(session.claims, { sub: "user-1", groups: ["a", "b"] });
    assert.equal(typeof session.authenticatedAt, "string");
    assert.equal(saveAttempt, 2);

    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0]?.rawXml, "<xml>very-large</xml>");
    assert.equal(snapshots[1]?.rawXml, undefined);
  });

  it("falls back to compact claims for OIDC after repeated cookie overflow", async (t) => {
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

    let saveAttempt = 0;
    const session = {
      appSlug: "",
      protocol: "OIDC" as const,
      claims: {} as Record<string, unknown>,
      rawToken: undefined as string | undefined,
      rawXml: undefined as string | undefined,
      idToken: undefined as string | undefined,
      accessToken: undefined as string | undefined,
      authenticatedAt: "",
      save: t.mock.fn(async function save() {
        saveAttempt += 1;
        if (saveAttempt <= 2) {
          throw new Error(
            "iron-session: Cookie length is too big (5500 bytes), browsers will refuse it. Try to remove some data.",
          );
        }
      }),
    };

    const largeClaims = {
      sub: "user-2",
      email: "user2@example.com",
      groups: Array.from({ length: 120 }, (_, i) => `group-${i}`),
    };

    await saveAuthResultSession(session, {
      slug: "oidc-app",
      protocol: "OIDC",
      claims: largeClaims,
      rawToken: "{\"tokens\":\"huge\"}",
      idToken: "very-large-id-token",
      accessToken: "very-large-access-token",
    });

    assert.equal(saveAttempt, 3);
    assert.equal(session.appSlug, "oidc-app");
    assert.equal(session.protocol, "OIDC");
    assert.equal(session.rawToken, undefined);
    assert.equal(session.accessToken, undefined);
    assert.equal(session.idToken, undefined);

    assert.equal((session.claims as { _truncated?: boolean })._truncated, true);
    assert.equal(
      (session.claims as { _reason?: string })._reason,
      "Session payload exceeded cookie size limit",
    );
    assert.equal(
      (session.claims as { _claimCount?: number })._claimCount,
      Object.keys(largeClaims).length,
    );
    const keys = (session.claims as { _claimKeys?: string[] })._claimKeys;
    assert.ok(Array.isArray(keys));
    assert.ok(keys?.includes("sub"));
    assert.ok(keys?.includes("groups"));
  });

  it("rethrows non-cookie save errors", async (t) => {
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
      appSlug: "",
      protocol: "SAML" as const,
      claims: {} as Record<string, unknown>,
      rawToken: undefined as string | undefined,
      rawXml: undefined as string | undefined,
      idToken: undefined as string | undefined,
      accessToken: undefined as string | undefined,
      authenticatedAt: "",
      save: t.mock.fn(async () => {
        throw new Error("database unavailable");
      }),
    };

    await assert.rejects(
      saveAuthResultSession(session, {
        slug: "any-app",
        protocol: "SAML",
        claims: { sub: "user-3" },
        rawXml: "<xml />",
      }),
      /database unavailable/,
    );
  });
});
