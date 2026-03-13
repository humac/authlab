import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { probeModule } from "./test-helpers.ts";

const skip = await probeModule("otplib");

describe("totp helpers", { skip: skip || undefined }, () => {
  it("creates a secret, otpauth URL, and QR code payload", async () => {
    const { createTotpSetup } = await import("../../src/lib/totp.ts");

    const result = await createTotpSetup({
      accountName: "user@example.com",
      issuer: "AuthLab",
    });

    assert.ok(result.secret.length > 0);
    assert.match(result.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.match(result.otpauthUrl, /issuer=AuthLab/);
    assert.match(result.qrCodeDataUrl, /^data:image\/png;base64,/);
  });

  it("accepts valid tokens even when users paste whitespace", async () => {
    const { authenticator } = await import("otplib");
    const { createTotpSetup, verifyTotpToken } = await import("../../src/lib/totp.ts");

    const { secret } = await createTotpSetup({
      accountName: "user@example.com",
      issuer: "AuthLab",
    });
    const token = authenticator.generate(secret);
    const spacedToken = `${token.slice(0, 3)} ${token.slice(3)}`;

    assert.equal(verifyTotpToken(secret, spacedToken), true);
  });

  it("rejects invalid tokens", async () => {
    const { createTotpSetup, verifyTotpToken } = await import("../../src/lib/totp.ts");

    const { secret } = await createTotpSetup({
      accountName: "user@example.com",
      issuer: "AuthLab",
    });

    assert.equal(verifyTotpToken(secret, "000000"), false);
  });
});
