import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { decrypt, encrypt } from "../../src/lib/encryption.ts";

const VALID_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryption", { concurrency: false }, () => {
  const originalMasterKey = process.env.MASTER_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.MASTER_ENCRYPTION_KEY = VALID_MASTER_KEY;
  });

  afterEach(() => {
    process.env.MASTER_ENCRYPTION_KEY = originalMasterKey;
  });

  it("round-trips plaintext with AES-256-GCM", () => {
    const plaintext = "top-secret-value";

    const encrypted = encrypt(plaintext);

    assert.notEqual(encrypted, plaintext);
    assert.equal(decrypt(encrypted), plaintext);
  });

  it("produces unique ciphertext for the same plaintext", () => {
    const plaintext = "repeatable-input";

    const first = encrypt(plaintext);
    const second = encrypt(plaintext);

    assert.notEqual(first, second);
  });

  it("rejects invalid ciphertext format", () => {
    assert.throws(() => decrypt("not:a:valid:payload"), /Invalid encrypted value format/);
  });

  it("fails when the master key is missing", () => {
    delete process.env.MASTER_ENCRYPTION_KEY;

    assert.throws(() => encrypt("value"), /MASTER_ENCRYPTION_KEY must be a 64-character hex string/);
  });

  it("fails when ciphertext integrity is broken", () => {
    const encrypted = encrypt("tamper-me");
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
    const tamperedCiphertext =
      ciphertextHex.slice(0, -1) + (ciphertextHex.endsWith("0") ? "1" : "0");

    assert.throws(
      () => decrypt([ivHex, authTagHex, tamperedCiphertext].join(":")),
      /Unsupported state or unable to authenticate data/,
    );
  });
});
