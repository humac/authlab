import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { importFresh } from "./test-helpers.ts";

function mockModules(
  t: TestContext,
  teams: { id: string; isPersonal: boolean }[],
  user: { defaultTeamId: string | null } | null = { defaultTeamId: null },
) {
  t.mock.module("@/repositories/team.repo", {
    namedExports: {
      getTeamsByUserId: t.mock.fn(async () => teams),
    },
  });
  t.mock.module("@/repositories/user.repo", {
    namedExports: {
      getUserById: t.mock.fn(async () => user),
    },
  });
}

describe("active team resolution", () => {
  it("prefers the user's default team when set and user is a member", async (t) => {
    mockModules(
      t,
      [
        { id: "team-1", isPersonal: false },
        { id: "team-2", isPersonal: true },
        { id: "team-3", isPersonal: false },
      ],
      { defaultTeamId: "team-3" },
    );

    const { resolveUserActiveTeamId } = await importFresh<
      typeof import("../../src/lib/auth-login.ts")
    >("../../src/lib/auth-login.ts");

    assert.equal(await resolveUserActiveTeamId("user-1"), "team-3");
  });

  it("ignores default team when user is no longer a member", async (t) => {
    mockModules(
      t,
      [
        { id: "team-1", isPersonal: false },
        { id: "team-2", isPersonal: true },
      ],
      { defaultTeamId: "team-deleted" },
    );

    const { resolveUserActiveTeamId } = await importFresh<
      typeof import("../../src/lib/auth-login.ts")
    >("../../src/lib/auth-login.ts");

    assert.equal(await resolveUserActiveTeamId("user-1"), "team-2");
  });

  it("prefers the personal team when no default is set", async (t) => {
    mockModules(t, [
      { id: "team-1", isPersonal: false },
      { id: "team-2", isPersonal: true },
    ]);

    const { resolveUserActiveTeamId } = await importFresh<
      typeof import("../../src/lib/auth-login.ts")
    >("../../src/lib/auth-login.ts");

    assert.equal(await resolveUserActiveTeamId("user-1"), "team-2");
  });

  it("falls back to the first team when no personal team exists", async (t) => {
    mockModules(t, [
      { id: "team-1", isPersonal: false },
      { id: "team-2", isPersonal: false },
    ]);

    const { resolveUserActiveTeamId } = await importFresh<
      typeof import("../../src/lib/auth-login.ts")
    >("../../src/lib/auth-login.ts");

    assert.equal(await resolveUserActiveTeamId("user-1"), "team-1");
  });

  it("returns null when the user has no teams", async (t) => {
    mockModules(t, []);

    const { resolveUserActiveTeamId } = await importFresh<
      typeof import("../../src/lib/auth-login.ts")
    >("../../src/lib/auth-login.ts");

    assert.equal(await resolveUserActiveTeamId("user-1"), null);
  });
});
