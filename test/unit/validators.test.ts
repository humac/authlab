import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CreateAppInstanceSchema,
  PasswordResetCompleteSchema,
  RegisterSchema,
  SmtpConfigSchema,
  TestEmailProviderSchema,
  UpdateUserSchema,
} from "../../src/lib/validators.ts";

describe("validators", () => {
  it("accepts a valid OIDC app payload", () => {
    const parsed = CreateAppInstanceSchema.safeParse({
      name: "Okta Sandbox",
      slug: "okta-sandbox",
      protocol: "OIDC",
      issuerUrl: "https://example.okta.com/oauth2/default",
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes: "openid profile email",
      buttonColor: "#3B71CA",
      entryPoint: null,
      issuer: null,
      idpCert: null,
    });

    assert.equal(parsed.success, true);
  });

  it("rejects malformed slugs", () => {
    const parsed = CreateAppInstanceSchema.safeParse({
      name: "Broken Slug",
      slug: "Bad Slug",
      protocol: "OIDC",
      issuerUrl: "https://issuer.example.com",
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    assert.equal(parsed.success, false);
    assert.match(parsed.error.issues[0]?.message ?? "", /Slug must be lowercase alphanumeric with hyphens/);
  });

  it("requires the current password before allowing a password change", () => {
    const parsed = UpdateUserSchema.safeParse({
      name: "New Name",
      newPassword: "NewPassword123!",
    });

    assert.equal(parsed.success, false);
    assert.match(parsed.error.issues[0]?.message ?? "", /Current password required to set new password/);
  });

  it("normalizes blank SMTP passwords to undefined", () => {
    const parsed = SmtpConfigSchema.parse({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      username: "mailer",
      password: "   ",
      fromName: "AuthLab",
      fromEmail: "noreply@example.com",
    });

    assert.equal(parsed.password, undefined);
  });

  it("rejects short registration passwords", () => {
    const parsed = RegisterSchema.safeParse({
      email: "user@example.com",
      name: "User",
      password: "short",
    });

    assert.equal(parsed.success, false);
    assert.match(parsed.error.issues[0]?.message ?? "", /at least 8 characters/);
  });

  it("accepts password reset completion with an optional TOTP code", () => {
    const parsed = PasswordResetCompleteSchema.safeParse({
      token: "reset-token",
      newPassword: "MuchStrongerPassword123!",
      totpCode: "123456",
    });

    assert.equal(parsed.success, true);
  });

  it("rejects test email provider payloads with invalid recipient email", () => {
    const parsed = TestEmailProviderSchema.safeParse({
      provider: "SMTP",
      recipientEmail: "not-an-email",
      smtp: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        username: "mailer",
        password: "secret",
        fromName: "AuthLab",
        fromEmail: "noreply@example.com",
      },
    });

    assert.equal(parsed.success, false);
    assert.match(parsed.error.issues[0]?.message ?? "", /Invalid email/);
  });
});
