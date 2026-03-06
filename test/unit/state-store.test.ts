import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

const TTL_MS = 10 * 60 * 1000;

describe("state store", { concurrency: false }, () => {
  it("returns state once and removes it after retrieval", async (t) => {
    const session = {
      pendingStates: undefined as
        | Record<
            string,
            { slug: string; codeVerifier?: string; createdAt: number }
          >
        | undefined,
      save: t.mock.fn(async () => {}),
    };

    t.mock.module("next/headers", {
      namedExports: {
        cookies: t.mock.fn(async () => ({})),
      },
    });
    t.mock.module("iron-session", {
      namedExports: {
        getIronSession: t.mock.fn(async () => session),
      },
    });

    const { getState, setState } = await importFresh<
      typeof import("../../src/lib/state-store.ts")
    >("../../src/lib/state-store.ts");

    t.mock.method(Date, "now", () => 1_000);

    await setState("state-once", { slug: "app-1", codeVerifier: "verifier-1" });

    assert.deepEqual(await getState("state-once"), {
      slug: "app-1",
      codeVerifier: "verifier-1",
      createdAt: 1_000,
    });
    assert.equal(await getState("state-once"), null);
    assert.deepEqual(session.pendingStates, {});
    assert.equal(session.save.mock.callCount(), 2);
  });

  it("expires stale state entries on retrieval", async (t) => {
    const session = {
      pendingStates: undefined as
        | Record<
            string,
            { slug: string; codeVerifier?: string; createdAt: number }
          >
        | undefined,
      save: t.mock.fn(async () => {}),
    };

    t.mock.module("next/headers", {
      namedExports: {
        cookies: t.mock.fn(async () => ({})),
      },
    });
    t.mock.module("iron-session", {
      namedExports: {
        getIronSession: t.mock.fn(async () => session),
      },
    });

    const { getState, setState } = await importFresh<
      typeof import("../../src/lib/state-store.ts")
    >("../../src/lib/state-store.ts");

    t.mock.method(Date, "now", () => 5_000);
    await setState("state-expired", { slug: "app-2" });

    t.mock.method(Date, "now", () => 5_000 + TTL_MS + 1);

    assert.equal(await getState("state-expired"), null);
    assert.deepEqual(session.pendingStates, {});
    assert.equal(session.save.mock.callCount(), 2);
  });

  it("cleans up expired entries before storing fresh state", async (t) => {
    const session = {
      pendingStates: undefined as
        | Record<
            string,
            { slug: string; codeVerifier?: string; createdAt: number }
          >
        | undefined,
      save: t.mock.fn(async () => {}),
    };

    t.mock.module("next/headers", {
      namedExports: {
        cookies: t.mock.fn(async () => ({})),
      },
    });
    t.mock.module("iron-session", {
      namedExports: {
        getIronSession: t.mock.fn(async () => session),
      },
    });

    const { getState, setState } = await importFresh<
      typeof import("../../src/lib/state-store.ts")
    >("../../src/lib/state-store.ts");

    t.mock.method(Date, "now", () => 10_000);
    await setState("state-stale", { slug: "old-app" });

    t.mock.method(Date, "now", () => 10_000 + TTL_MS + 5);
    await setState("state-fresh", { slug: "new-app" });

    assert.equal(await getState("state-stale"), null);
    assert.deepEqual(await getState("state-fresh"), {
      slug: "new-app",
      createdAt: 10_000 + TTL_MS + 5,
    });
    assert.deepEqual(session.pendingStates, {});
    assert.equal(session.save.mock.callCount(), 3);
  });
});
