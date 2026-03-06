import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("profile image repository", () => {
  it("returns a boolean for profile image existence", async (t) => {
    const prisma = {
      userProfileImage: {
        findUnique: t.mock.fn(async () => ({ userId: "user-1" })),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });

    const { hasProfileImageByUserId } = await importFresh<
      typeof import("../../src/repositories/profile-image.repo.ts")
    >("../../src/repositories/profile-image.repo.ts");

    assert.equal(await hasProfileImageByUserId("user-1"), true);
  });

  it("stores profile image content as a Uint8Array", async (t) => {
    const upsert = t.mock.fn(async () => undefined);
    const prisma = {
      userProfileImage: { upsert },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });

    const { upsertProfileImage } = await importFresh<
      typeof import("../../src/repositories/profile-image.repo.ts")
    >("../../src/repositories/profile-image.repo.ts");

    await upsertProfileImage({
      userId: "user-1",
      mimeType: "image/png",
      sizeBytes: 3,
      content: Buffer.from([1, 2, 3]),
      sha256: "abc123",
    });

    assert.equal(upsert.mock.calls.length, 1);
    const upsertCall = upsert.mock.calls.at(0);
    assert.ok(upsertCall);
    const saved = (upsertCall.arguments.at(0) as unknown as {
      create: { content: Uint8Array };
    }).create.content;
    assert.ok(saved instanceof Uint8Array);
    assert.deepEqual([...saved], [1, 2, 3]);
  });

  it("deletes profile images by user id", async (t) => {
    const deleteMany = t.mock.fn(async () => undefined);
    const prisma = {
      userProfileImage: { deleteMany },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });

    const { deleteProfileImageByUserId } = await importFresh<
      typeof import("../../src/repositories/profile-image.repo.ts")
    >("../../src/repositories/profile-image.repo.ts");

    await deleteProfileImageByUserId("user-1");

    assert.equal(deleteMany.mock.calls.length, 1);
    const deleteCall = deleteMany.mock.calls.at(0);
    assert.ok(deleteCall);
    assert.deepEqual(deleteCall.arguments.at(0), {
      where: { userId: "user-1" },
    });
  });
});
