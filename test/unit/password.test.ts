import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { probeModule } from "./test-helpers.ts";

const skip = (await probeModule("argon2")) || (await probeModule("bcryptjs"));

describe("password helpers", { skip: skip || undefined }, () => {
  it("hashes passwords with argon2id", async () => {
    const { hashPassword, verifyPassword } = await import("../../src/lib/password.ts");

    const hash = await hashPassword("CorrectHorseBatteryStaple!");

    assert.match(hash, /^\$argon2id\$/);
    assert.equal(await verifyPassword("CorrectHorseBatteryStaple!", hash), true);
  });

  it("returns false for unsupported hash formats", async () => {
    const { verifyPassword } = await import("../../src/lib/password.ts");

    assert.equal(await verifyPassword("password", "plain-text-hash"), false);
  });

  it("verifies legacy bcrypt hashes and upgrades them to argon2id", async () => {
    const bcrypt = await import("bcryptjs");
    const { verifyPassword, verifyPasswordAndMaybeUpgrade } = await import("../../src/lib/password.ts");

    const bcryptHash = await bcrypt.default.hash("LegacyPassword123!", 10);

    const result = await verifyPasswordAndMaybeUpgrade("LegacyPassword123!", bcryptHash);

    assert.equal(result.valid, true);
    assert.ok(result.upgradedHash);
    assert.match(result.upgradedHash, /^\$argon2id\$/);
    assert.equal(await verifyPassword("LegacyPassword123!", result.upgradedHash), true);
  });

  it("does not return an upgraded hash when verification fails", async () => {
    const bcrypt = await import("bcryptjs");
    const { verifyPasswordAndMaybeUpgrade } = await import("../../src/lib/password.ts");

    const bcryptHash = await bcrypt.default.hash("LegacyPassword123!", 10);

    const result = await verifyPasswordAndMaybeUpgrade("wrong-password", bcryptHash);

    assert.deepEqual(result, { valid: false });
  });

  it("leaves modern argon2id hashes unchanged after verification", async () => {
    const { hashPassword, verifyPasswordAndMaybeUpgrade } = await import("../../src/lib/password.ts");

    const hash = await hashPassword("AlreadyModern123!");

    const result = await verifyPasswordAndMaybeUpgrade("AlreadyModern123!", hash);

    assert.deepEqual(result, { valid: true });
  });
});
