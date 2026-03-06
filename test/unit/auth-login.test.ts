import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("active team resolution", () => {
  it("prefers the personal team when one exists", async (t) => {
    const getTeamsByUserId = t.mock.fn(async () => [
      { id: "team-1", isPersonal: false },
      { id: "team-2", isPersonal: true },
    ]);

    t.mock.module("@/repositories/team.repo", {
      namedExports: { getTeamsByUserId },
    });

    const { resolveUserActiveTeamId } = await importFresh<
      typeof import("../../src/lib/auth-login.ts")
    >("../../src/lib/auth-login.ts");

    const teamId = await resolveUserActiveTeamId("user-1");

    assert.equal(teamId, "team-2");
    assert.deepEqual(getTeamsByUserId.mock.calls.at(0)?.arguments, ["user-1"]);
  });

  it("falls back to the first team when no personal team exists", async (t) => {
    t.mock.module("@/repositories/team.repo", {
      namedExports: {
        getTeamsByUserId: t.mock.fn(async () => [
          { id: "team-1", isPersonal: false },
          { id: "team-2", isPersonal: false },
        ]),
      },
    });

    const { resolveUserActiveTeamId } = await importFresh<
      typeof import("../../src/lib/auth-login.ts")
    >("../../src/lib/auth-login.ts");

    assert.equal(await resolveUserActiveTeamId("user-1"), "team-1");
  });

  it("returns null when the user has no teams", async (t) => {
    t.mock.module("@/repositories/team.repo", {
      namedExports: {
        getTeamsByUserId: t.mock.fn(async () => []),
      },
    });

    const { resolveUserActiveTeamId } = await importFresh<
      typeof import("../../src/lib/auth-login.ts")
    >("../../src/lib/auth-login.ts");

    assert.equal(await resolveUserActiveTeamId("user-1"), null);
  });
});
