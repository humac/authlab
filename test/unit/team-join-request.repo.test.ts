import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("team join request repository", () => {
  it("defaults new requests to MEMBER when no role is provided", async (t) => {
    const create = t.mock.fn(async ({ data }) => data);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          teamJoinRequest: { create },
        })),
      },
    });

    const { createTeamJoinRequest } = await importFresh<
      typeof import("../../src/repositories/team-join-request.repo.ts")
    >("../../src/repositories/team-join-request.repo.ts");

    const result = await createTeamJoinRequest({
      teamId: "team-1",
      userId: "user-1",
      note: "Please let me in",
    });

    assert.equal(result.role, "MEMBER");
    assert.equal(result.note, "Please let me in");
  });

  it("lists requests with an optional status filter and reviewer details", async (t) => {
    const findMany = t.mock.fn(async () => [{ id: "request-1" }]);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          teamJoinRequest: { findMany },
        })),
      },
    });

    const { listTeamJoinRequests } = await importFresh<
      typeof import("../../src/repositories/team-join-request.repo.ts")
    >("../../src/repositories/team-join-request.repo.ts");

    await listTeamJoinRequests("team-1", "PENDING");

    assert.deepEqual(findMany.mock.calls.at(0)?.arguments.at(0), {
      where: { teamId: "team-1", status: "PENDING" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  });

  it("approves pending requests by creating a membership when needed", async (t) => {
    const updateRequest = t.mock.fn(async ({ data }) => ({
      id: "request-1",
      status: data.status,
      role: data.role,
    }));
    const teamMemberCreate = t.mock.fn(async () => undefined);
    const teamMemberUpdate = t.mock.fn(async () => undefined);
    const tx = {
      teamJoinRequest: {
        findUnique: t.mock.fn(async () => ({
          id: "request-1",
          teamId: "team-1",
          userId: "user-1",
          role: "MEMBER",
          status: "PENDING",
        })),
        update: updateRequest,
      },
      teamMember: {
        findUnique: t.mock.fn(async () => null),
        create: teamMemberCreate,
        update: teamMemberUpdate,
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          $transaction: async <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
        })),
      },
    });

    const { reviewTeamJoinRequest } = await importFresh<
      typeof import("../../src/repositories/team-join-request.repo.ts")
    >("../../src/repositories/team-join-request.repo.ts");

    const result = await reviewTeamJoinRequest({
      requestId: "request-1",
      reviewerId: "admin-1",
      action: "approve",
      role: "ADMIN",
    });

    assert.equal(result.status, "APPROVED");
    assert.equal(result.role, "ADMIN");
    assert.equal(teamMemberCreate.mock.calls.length, 1);
    assert.equal(teamMemberUpdate.mock.calls.length, 0);
  });

  it("updates an existing membership when approving an already joined user", async (t) => {
    const teamMemberUpdate = t.mock.fn(async () => undefined);
    const tx = {
      teamJoinRequest: {
        findUnique: t.mock.fn(async () => ({
          id: "request-1",
          teamId: "team-1",
          userId: "user-1",
          role: "MEMBER",
          status: "PENDING",
        })),
        update: t.mock.fn(async ({ data }) => ({
          id: "request-1",
          status: data.status,
          role: data.role,
        })),
      },
      teamMember: {
        findUnique: t.mock.fn(async () => ({ id: "membership-1" })),
        create: t.mock.fn(async () => undefined),
        update: teamMemberUpdate,
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          $transaction: async <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
        })),
      },
    });

    const { reviewTeamJoinRequest } = await importFresh<
      typeof import("../../src/repositories/team-join-request.repo.ts")
    >("../../src/repositories/team-join-request.repo.ts");

    await reviewTeamJoinRequest({
      requestId: "request-1",
      reviewerId: "admin-1",
      action: "approve",
    });

    assert.equal(teamMemberUpdate.mock.calls.length, 1);
  });

  it("rejects pending requests and throws when the request is missing", async (t) => {
    const rejectTx = {
      teamJoinRequest: {
        findUnique: t.mock.fn(async () => ({
          id: "request-1",
          teamId: "team-1",
          userId: "user-1",
          role: "MEMBER",
          status: "PENDING",
        })),
        update: t.mock.fn(async ({ data }) => ({
          id: "request-1",
          status: data.status,
        })),
      },
      teamMember: {
        findUnique: t.mock.fn(async () => null),
        create: t.mock.fn(async () => undefined),
        update: t.mock.fn(async () => undefined),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          $transaction: async <T>(fn: (value: typeof rejectTx) => Promise<T>) => fn(rejectTx),
        })),
      },
    });

    const { reviewTeamJoinRequest } = await importFresh<
      typeof import("../../src/repositories/team-join-request.repo.ts")
    >("../../src/repositories/team-join-request.repo.ts");

    const rejected = await reviewTeamJoinRequest({
      requestId: "request-1",
      reviewerId: "admin-1",
      action: "reject",
    });
    assert.equal(rejected.status, "REJECTED");

    t.mock.reset();
    const missingTx = {
      teamJoinRequest: {
        findUnique: t.mock.fn(async () => null),
        update: t.mock.fn(async () => undefined),
      },
      teamMember: {
        findUnique: t.mock.fn(async () => null),
        create: t.mock.fn(async () => undefined),
        update: t.mock.fn(async () => undefined),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          $transaction: async <T>(fn: (value: typeof missingTx) => Promise<T>) => fn(missingTx),
        })),
      },
    });

    const reloaded = await importFresh<
      typeof import("../../src/repositories/team-join-request.repo.ts")
    >("../../src/repositories/team-join-request.repo.ts");

    await assert.rejects(
      () =>
        reloaded.reviewTeamJoinRequest({
          requestId: "missing",
          reviewerId: "admin-1",
          action: "approve",
        }),
      /Team join request not found/,
    );
  });
});
