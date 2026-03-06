import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  getMaxProfileImageBytes,
  sanitizeProfileImage,
} from "../../src/lib/profile-image.ts";

async function createPngBuffer() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .withMetadata()
    .toBuffer();
}

describe("profile image hardening", () => {
  it("rejects empty uploads", async () => {
    await assert.rejects(() => sanitizeProfileImage(Buffer.alloc(0)), /Image file is required/);
  });

  it("rejects uploads larger than 2MB", async () => {
    const oversized = Buffer.alloc(getMaxProfileImageBytes() + 1, 1);

    await assert.rejects(() => sanitizeProfileImage(oversized), /Image exceeds 2MB limit/);
  });

  it("rejects unsupported file types", async () => {
    await assert.rejects(
      () => sanitizeProfileImage(Buffer.from("not-an-image")),
      /Unsupported image type/,
    );
  });

  it("normalizes valid images and returns deterministic metadata", async () => {
    const original = await createPngBuffer();
    const sanitized = await sanitizeProfileImage(original);

    assert.equal(sanitized.mimeType, "image/png");
    assert.ok(sanitized.content.length > 0);
    assert.equal(sanitized.sizeBytes, sanitized.content.length);
    assert.equal(sanitized.sha256, createHash("sha256").update(sanitized.content).digest("hex"));
  });
});
