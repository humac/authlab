import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("system setting repository", () => {
  it("returns null when the SystemSetting table is missing", async (t) => {
    const prisma = {
      systemSetting: {
        findUnique: t.mock.fn(async () => {
          const error = new Error("no such table: SystemSetting");
          throw error;
        }),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });

    const { getSetting } = await importFresh<
      typeof import("../../src/repositories/system-setting.repo.ts")
    >("../../src/repositories/system-setting.repo.ts");

    assert.equal(await getSetting("email.activeProvider"), null);
  });

  it("wraps schema drift errors when writing settings", async (t) => {
    const prisma = {
      systemSetting: {
        upsert: t.mock.fn(async () => {
          const error = new Error("table missing");
          (error as Error & { code?: string }).code = "P2021";
          throw error;
        }),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });

    const { SystemSettingSchemaOutOfSyncError, setSetting } = await importFresh<
      typeof import("../../src/repositories/system-setting.repo.ts")
    >("../../src/repositories/system-setting.repo.ts");

    await assert.rejects(() => setSetting("key", "value"), SystemSettingSchemaOutOfSyncError);
  });

  it("returns all settings as a plain object", async (t) => {
    const prisma = {
      systemSetting: {
        findMany: t.mock.fn(async () => [
          { key: "a", value: "1" },
          { key: "b", value: "2" },
        ]),
      },
    };

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => prisma),
      },
    });

    const { getAllSettings } = await importFresh<
      typeof import("../../src/repositories/system-setting.repo.ts")
    >("../../src/repositories/system-setting.repo.ts");

    assert.deepEqual(await getAllSettings(), { a: "1", b: "2" });
  });
});
