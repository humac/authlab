import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("credential repository", () => {
  it("lists credentials by user ordered by creation time", async (t) => {
    const findMany = t.mock.fn(async () => [{ id: "cred-1" }]);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          credential: { findMany },
        })),
      },
    });

    const { listCredentialsByUser } = await importFresh<
      typeof import("../../src/repositories/credential.repo.ts")
    >("../../src/repositories/credential.repo.ts");

    assert.deepEqual(await listCredentialsByUser("user-1"), [{ id: "cred-1" }]);
    assert.deepEqual(findMany.mock.calls.at(0)?.arguments.at(0), {
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
    });
  });

  it("updates the credential counter and stamps lastUsedAt", async (t) => {
    const update = t.mock.fn(async () => ({ id: "cred-1", signCount: 9 }));

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          credential: { update },
        })),
      },
    });

    const { updateCredentialCounter } = await importFresh<
      typeof import("../../src/repositories/credential.repo.ts")
    >("../../src/repositories/credential.repo.ts");

    await updateCredentialCounter({ id: "cred-1", signCount: 9 });

    const updateArgs = update.mock.calls.at(0)?.arguments.at(0) as unknown as {
      data: { signCount: number; lastUsedAt: Date };
    };
    assert.equal(updateArgs.data.signCount, 9);
    assert.ok(updateArgs.data.lastUsedAt instanceof Date);
  });

  it("only deletes credentials owned by the calling user", async (t) => {
    const findUnique = t.mock.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id === "cred-1") {
        return { id: "cred-1", userId: "user-1" };
      }

      return { id: "cred-2", userId: "user-2" };
    });
    const deleteCredentialRecord = t.mock.fn(async () => undefined);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          credential: {
            findUnique,
            delete: deleteCredentialRecord,
          },
        })),
      },
    });

    const { deleteCredential } = await importFresh<
      typeof import("../../src/repositories/credential.repo.ts")
    >("../../src/repositories/credential.repo.ts");

    assert.deepEqual(await deleteCredential("user-1", "cred-1"), {
      id: "cred-1",
      userId: "user-1",
    });
    assert.equal(await deleteCredential("user-1", "cred-2"), null);
    assert.equal(deleteCredentialRecord.mock.calls.length, 1);
  });
});
