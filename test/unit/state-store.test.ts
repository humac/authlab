import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { getState, setState } from "../../src/lib/state-store.ts";

const TTL_MS = 10 * 60 * 1000;

describe("state store", { concurrency: false }, () => {
  it("returns state once and removes it after retrieval", () => {
    mock.method(Date, "now", () => 1_000);

    setState("state-once", { slug: "app-1", codeVerifier: "verifier-1" });

    assert.deepEqual(getState("state-once"), {
      slug: "app-1",
      codeVerifier: "verifier-1",
      createdAt: 1_000,
    });
    assert.equal(getState("state-once"), null);
  });

  it("expires stale state entries on retrieval", () => {
    mock.method(Date, "now", () => 5_000);
    setState("state-expired", { slug: "app-2" });

    mock.method(Date, "now", () => 5_000 + TTL_MS + 1);

    assert.equal(getState("state-expired"), null);
  });

  it("cleans up expired entries before storing fresh state", () => {
    mock.method(Date, "now", () => 10_000);
    setState("state-stale", { slug: "old-app" });

    mock.method(Date, "now", () => 10_000 + TTL_MS + 5);
    setState("state-fresh", { slug: "new-app" });

    assert.equal(getState("state-stale"), null);
    assert.deepEqual(getState("state-fresh"), {
      slug: "new-app",
      createdAt: 10_000 + TTL_MS + 5,
    });
  });
});
