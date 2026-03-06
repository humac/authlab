import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("team repository", () => {
  it("maps user memberships into team summaries with counts", async (t) => {
    const findMany = t.mock.fn(async () => [
      {
        role: "ADMIN",
        team: {
          id: "team-1",
          name: "Core Team",
          slug: "core-team",
          isPersonal: false,
          _count: { members: 3, appInstances: 2 },
        },
      },
    ]);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          teamMember: { findMany },
        })),
      },
    });

    const { getTeamsByUserId } = await importFresh<
      typeof import("../../src/repositories/team.repo.ts")
    >("../../src/repositories/team.repo.ts");

    assert.deepEqual(await getTeamsByUserId("user-1"), [
      {
        id: "team-1",
        name: "Core Team",
        slug: "core-team",
        isPersonal: false,
        _count: { members: 3, appInstances: 2 },
        role: "ADMIN",
        memberCount: 3,
        appCount: 2,
      },
    ]);
    assert.deepEqual(findMany.mock.calls.at(0)?.arguments.at(0), {
      where: { userId: "user-1" },
      include: {
        team: {
          include: {
            _count: { select: { appInstances: true, members: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
  });

  it("updates team member roles by composite key", async (t) => {
    const update = t.mock.fn(async () => ({ id: "membership-1", role: "OWNER" }));

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          teamMember: { update },
        })),
      },
    });

    const { updateTeamMemberRole } = await importFresh<
      typeof import("../../src/repositories/team.repo.ts")
    >("../../src/repositories/team.repo.ts");

    await updateTeamMemberRole("team-1", "user-1", "OWNER");

    assert.deepEqual(update.mock.calls.at(0)?.arguments.at(0), {
      where: { userId_teamId: { userId: "user-1", teamId: "team-1" } },
      data: { role: "OWNER" },
    });
  });

  it("returns paginated team lists with counts", async (t) => {
    const findMany = t.mock.fn(async () => [{ id: "team-1" }]);
    const count = t.mock.fn(async () => 12);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          team: { findMany, count },
        })),
      },
    });

    const { listAllTeams } = await importFresh<
      typeof import("../../src/repositories/team.repo.ts")
    >("../../src/repositories/team.repo.ts");

    assert.deepEqual(await listAllTeams(2, 5), {
      teams: [{ id: "team-1" }],
      total: 12,
      page: 2,
      limit: 5,
    });
    assert.deepEqual(findMany.mock.calls.at(0)?.arguments.at(0), {
      skip: 5,
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true, appInstances: true } },
      },
    });
  });
});
