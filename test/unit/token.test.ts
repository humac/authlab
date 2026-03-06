import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateOpaqueToken, hashToken } from "../../src/lib/token.ts";

describe("token helpers", () => {
  it("generates a 64-character hex token by default", () => {
    const token = generateOpaqueToken();

    assert.equal(token.length, 64);
    assert.match(token, /^[0-9a-f]+$/);
  });

  it("supports custom token sizes", () => {
    const token = generateOpaqueToken(8);

    assert.equal(token.length, 16);
  });

  it("returns different random tokens across calls", () => {
    assert.notEqual(generateOpaqueToken(), generateOpaqueToken());
  });

  it("hashes tokens with deterministic SHA-256 output", () => {
    assert.equal(
      hashToken("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
