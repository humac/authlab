import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("team authorization", () => {
  it("rejects unauthenticated users", async (t) => {
    t.mock.module("@/lib/user-session", {
      namedExports: {
        getCurrentUser: t.mock.fn(async () => null),
      },
    });
    t.mock.module("@/repositories/team.repo", {
      namedExports: {
        getTeamMembership: t.mock.fn(),
      },
    });

    const { AuthError, requireTeamAccess } = await importFresh<
      typeof import("../../src/lib/authorize.ts")
    >("../../src/lib/authorize.ts");

    await assert.rejects(() => requireTeamAccess("team-1"), (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      return true;
    });
  });

  it("rejects users without membership in the requested team", async (t) => {
    t.mock.module("@/lib/user-session", {
      namedExports: {
        getCurrentUser: t.mock.fn(async () => ({ userId: "user-1" })),
      },
    });
    t.mock.module("@/repositories/team.repo", {
      namedExports: {
        getTeamMembership: t.mock.fn(async () => null),
      },
    });

    const { AuthError, requireTeamAccess } = await importFresh<
      typeof import("../../src/lib/authorize.ts")
    >("../../src/lib/authorize.ts");

    await assert.rejects(() => requireTeamAccess("team-1"), (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 403);
      return true;
    });
  });

  it("rejects users without the required role", async (t) => {
    t.mock.module("@/lib/user-session", {
      namedExports: {
        getCurrentUser: t.mock.fn(async () => ({ userId: "user-1" })),
      },
    });
    t.mock.module("@/repositories/team.repo", {
      namedExports: {
        getTeamMembership: t.mock.fn(async () => ({ role: "MEMBER" })),
      },
    });

    const { AuthError, requireTeamAccess } = await importFresh<
      typeof import("../../src/lib/authorize.ts")
    >("../../src/lib/authorize.ts");

    await assert.rejects(
      () => requireTeamAccess("team-1", ["ADMIN"]),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("returns the authenticated user and membership when access is allowed", async (t) => {
    const user = { userId: "user-1", email: "user@example.com" };
    const membership = { role: "ADMIN", teamId: "team-1" };

    t.mock.module("@/lib/user-session", {
      namedExports: {
        getCurrentUser: t.mock.fn(async () => user),
      },
    });
    t.mock.module("@/repositories/team.repo", {
      namedExports: {
        getTeamMembership: t.mock.fn(async () => membership),
      },
    });

    const { requireTeamAccess } = await importFresh<
      typeof import("../../src/lib/authorize.ts")
    >("../../src/lib/authorize.ts");

    const result = await requireTeamAccess("team-1", ["ADMIN"]);

    assert.deepEqual(result, { user, membership });
  });
});
