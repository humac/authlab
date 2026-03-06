import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("user repository", () => {
  it("looks up users by a lowercased email address", async (t) => {
    const findUnique = t.mock.fn(async () => ({ id: "user-1" }));

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          user: { findUnique },
        })),
      },
    });

    const { getUserByEmail } = await importFresh<
      typeof import("../../src/repositories/user.repo.ts")
    >("../../src/repositories/user.repo.ts");

    await getUserByEmail("USER@Example.COM");

    assert.deepEqual(findUnique.mock.calls.at(0)?.arguments.at(0), {
      where: { email: "user@example.com" },
    });
  });

  it("renames the personal workspace when a user's name changes", async (t) => {
    const tx = {
      user: {
        update: t.mock.fn(async () => ({ id: "user-1", name: "New Name" })),
      },
      team: {
        updateMany: t.mock.fn(async () => ({ count: 1 })),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          $transaction: async <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
        })),
      },
    });

    const { updateUser } = await importFresh<
      typeof import("../../src/repositories/user.repo.ts")
    >("../../src/repositories/user.repo.ts");

    const updated = await updateUser("user-1", { name: "New Name" });

    assert.equal(updated.name, "New Name");
    assert.deepEqual(tx.team.updateMany.mock.calls.at(0)?.arguments.at(0), {
      where: {
        isPersonal: true,
        slug: "personal-user-1",
      },
      data: {
        name: "New Name's Workspace",
      },
    });
  });

  it("skips personal workspace renames when the name is unchanged", async (t) => {
    const tx = {
      user: {
        update: t.mock.fn(async () => ({ id: "user-1", isVerified: true })),
      },
      team: {
        updateMany: t.mock.fn(async () => ({ count: 0 })),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          $transaction: async <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
        })),
      },
    });

    const { updateUser } = await importFresh<
      typeof import("../../src/repositories/user.repo.ts")
    >("../../src/repositories/user.repo.ts");

    await updateUser("user-1", { isVerified: true });

    assert.equal(tx.team.updateMany.mock.calls.length, 0);
  });

  it("deletes the user's personal team before deleting the user", async (t) => {
    const tx = {
      team: {
        deleteMany: t.mock.fn(async () => ({ count: 1 })),
      },
      user: {
        delete: t.mock.fn(async () => ({ id: "user-1" })),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          $transaction: async <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
        })),
      },
    });

    const { deleteUser } = await importFresh<
      typeof import("../../src/repositories/user.repo.ts")
    >("../../src/repositories/user.repo.ts");

    assert.deepEqual(await deleteUser("user-1"), { id: "user-1" });
    const deleteManyArgs = tx.team.deleteMany.mock.calls.at(0)?.arguments.at(0) as unknown as {
      where: { OR: Array<Record<string, unknown>> };
    };
    assert.equal(deleteManyArgs.where.OR.length, 2);
    assert.deepEqual(tx.user.delete.mock.calls.at(0)?.arguments.at(0), {
      where: { id: "user-1" },
    });
  });

  it("returns paginated user lists with membership counts", async (t) => {
    const findMany = t.mock.fn(async () => [{ id: "user-1" }]);
    const count = t.mock.fn(async () => 7);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          user: { findMany, count },
        })),
      },
    });

    const { listUsers, listUsersWithMemberships, countSystemAdmins } = await importFresh<
      typeof import("../../src/repositories/user.repo.ts")
    >("../../src/repositories/user.repo.ts");

    assert.deepEqual(await listUsers(2, 3), {
      users: [{ id: "user-1" }],
      total: 7,
      page: 2,
      limit: 3,
    });
    assert.deepEqual(findMany.mock.calls.at(0)?.arguments.at(0), {
      skip: 3,
      take: 3,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        isSystemAdmin: true,
        mustChangePassword: true,
        isVerified: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { teamMemberships: true } },
      },
    });

    findMany.mock.mockImplementationOnce(async () => [{ id: "user-2", teamMemberships: [] }]);
    count.mock.mockImplementationOnce(async () => 8);
    assert.deepEqual(await listUsersWithMemberships(1, 2), {
      users: [{ id: "user-2", teamMemberships: [] }],
      total: 8,
      page: 1,
      limit: 2,
    });

    count.mock.mockImplementationOnce(async (args?: { where?: { isSystemAdmin: boolean } }) => {
      assert.deepEqual(args, { where: { isSystemAdmin: true } });
      return 2;
    });
    assert.equal(await countSystemAdmins(), 2);
  });
});
