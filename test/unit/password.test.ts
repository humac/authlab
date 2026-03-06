import assert from "node:assert/strict";
import { describe, it } from "node:test";
import bcrypt from "bcryptjs";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordAndMaybeUpgrade,
} from "../../src/lib/password.ts";

describe("password helpers", () => {
  it("hashes passwords with argon2id", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple!");

    assert.match(hash, /^\$argon2id\$/);
    assert.equal(await verifyPassword("CorrectHorseBatteryStaple!", hash), true);
  });

  it("returns false for unsupported hash formats", async () => {
    assert.equal(await verifyPassword("password", "plain-text-hash"), false);
  });

  it("verifies legacy bcrypt hashes and upgrades them to argon2id", async () => {
    const bcryptHash = await bcrypt.hash("LegacyPassword123!", 10);

    const result = await verifyPasswordAndMaybeUpgrade("LegacyPassword123!", bcryptHash);

    assert.equal(result.valid, true);
    assert.ok(result.upgradedHash);
    assert.match(result.upgradedHash, /^\$argon2id\$/);
    assert.equal(await verifyPassword("LegacyPassword123!", result.upgradedHash), true);
  });

  it("does not return an upgraded hash when verification fails", async () => {
    const bcryptHash = await bcrypt.hash("LegacyPassword123!", 10);

    const result = await verifyPasswordAndMaybeUpgrade("wrong-password", bcryptHash);

    assert.deepEqual(result, { valid: false });
  });

  it("leaves modern argon2id hashes unchanged after verification", async () => {
    const hash = await hashPassword("AlreadyModern123!");

    const result = await verifyPasswordAndMaybeUpgrade("AlreadyModern123!", hash);

    assert.deepEqual(result, { valid: true });
  });
});
