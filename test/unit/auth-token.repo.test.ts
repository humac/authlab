import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("auth token repository", () => {
  it("stores hashed tokens and returns the raw token", async (t) => {
    const create = t.mock.fn(async () => undefined);
    const prisma = {
      authToken: { create },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });
    t.mock.module("@/lib/token", {
      namedExports: {
        generateOpaqueToken: t.mock.fn(() => "raw-token"),
        hashToken: t.mock.fn(() => "hashed-token"),
      },
    });

    const { createAuthToken } = await importFresh<
      typeof import("../../src/repositories/auth-token.repo.ts")
    >("../../src/repositories/auth-token.repo.ts");

    const rawToken = await createAuthToken({
      userId: "user-1",
      purpose: "EMAIL_VERIFY",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    assert.equal(rawToken, "raw-token");
    assert.equal(create.mock.calls.length, 1);
    const createCall = create.mock.calls.at(0);
    assert.ok(createCall);
    assert.deepEqual(createCall.arguments.at(0), {
      data: {
        userId: "user-1",
        purpose: "EMAIL_VERIFY",
        tokenHash: "hashed-token",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });
  });

  it("marks a valid token as used and returns the record", async (t) => {
    const record = {
      id: "token-1",
      purpose: "PASSWORD_RESET",
      tokenHash: "hashed-token",
      usedAt: null,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      user: { id: "user-1" },
    };
    const update = t.mock.fn(async () => undefined);
    const tx = {
      authToken: {
        findUnique: t.mock.fn(async () => record),
        update,
      },
    };
    const prisma = {
      $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });
    t.mock.module("@/lib/token", {
      namedExports: {
        generateOpaqueToken: t.mock.fn(),
        hashToken: t.mock.fn(() => "hashed-token"),
      },
    });

    const { consumeAuthToken } = await importFresh<
      typeof import("../../src/repositories/auth-token.repo.ts")
    >("../../src/repositories/auth-token.repo.ts");

    const consumed = await consumeAuthToken({
      token: "raw-token",
      purpose: "PASSWORD_RESET",
    });

    assert.equal(consumed, record);
    assert.equal(update.mock.calls.length, 1);
    const updateCall = update.mock.calls.at(0);
    assert.ok(updateCall);
    const updateArgs = updateCall.arguments.at(0) as unknown as {
      where: { id: string };
      data: { usedAt: Date };
    };
    assert.equal(updateArgs.where.id, "token-1");
    assert.ok(updateArgs.data.usedAt instanceof Date);
  });

  it("returns null when the stored purpose does not match", async (t) => {
    const tx = {
      authToken: {
        findUnique: t.mock.fn(async () => ({
          id: "token-1",
          purpose: "EMAIL_VERIFY",
          usedAt: null,
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          user: { id: "user-1" },
        })),
        update: t.mock.fn(async () => undefined),
      },
    };
    const prisma = {
      $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });
    t.mock.module("@/lib/token", {
      namedExports: {
        generateOpaqueToken: t.mock.fn(),
        hashToken: t.mock.fn(() => "hashed-token"),
      },
    });

    const { consumeAuthToken } = await importFresh<
      typeof import("../../src/repositories/auth-token.repo.ts")
    >("../../src/repositories/auth-token.repo.ts");

    assert.equal(
      await consumeAuthToken({ token: "raw-token", purpose: "PASSWORD_RESET" }),
      null,
    );
    assert.equal(tx.authToken.update.mock.calls.length, 0);
  });

  it("deletes expired or used tokens with a single cleanup query", async (t) => {
    const deleteMany = t.mock.fn(async () => undefined);
    const prisma = {
      authToken: { deleteMany },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });
    t.mock.module("@/lib/token", {
      namedExports: {
        generateOpaqueToken: t.mock.fn(),
        hashToken: t.mock.fn(),
      },
    });

    const { deleteExpiredOrUsedAuthTokens } = await importFresh<
      typeof import("../../src/repositories/auth-token.repo.ts")
    >("../../src/repositories/auth-token.repo.ts");

    await deleteExpiredOrUsedAuthTokens();

    assert.equal(deleteMany.mock.calls.length, 1);
    const deleteCall = deleteMany.mock.calls.at(0);
    assert.ok(deleteCall);
    const where = (deleteCall.arguments.at(0) as unknown as { where: {
      OR: Array<Record<string, unknown>>;
    } }).where;
    assert.equal(where.OR.length, 2);
  });
});
