import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdminCreateUserSchema,
  CreateAppInstanceSchema,
  CreateTeamJoinRequestSchema,
  PasswordResetCompleteSchema,
  ReviewTeamJoinRequestSchema,
  RegisterSchema,
  SmtpConfigSchema,
  TestEmailProviderSchema,
  TransferAppSchema,
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
      usePar: true,
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

  it("requires SAML-specific fields for SAML app payloads", () => {
    const parsed = CreateAppInstanceSchema.safeParse({
      name: "Broken SAML App",
      slug: "broken-saml-app",
      protocol: "SAML",
      issuerUrl: null,
      clientId: null,
      clientSecret: null,
      scopes: null,
      buttonColor: "#3B71CA",
    });

    assert.equal(parsed.success, false);
    assert.ok(parsed.error.issues.some((issue) => issue.path.includes("entryPoint")));
    assert.ok(parsed.error.issues.some((issue) => issue.path.includes("issuer")));
    assert.ok(parsed.error.issues.some((issue) => issue.path.includes("idpCert")));
  });

  it("accepts advanced SAML request controls and rejects excessive clock skew", () => {
    const parsed = CreateAppInstanceSchema.safeParse({
      name: "Advanced SAML App",
      slug: "advanced-saml-app",
      protocol: "SAML",
      entryPoint: "https://idp.example.com/sso/saml",
      issuer: "https://authlab.example.com/sp",
      idpCert: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      requestedAuthnContext:
        "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
      samlSignatureAlgorithm: "SHA256",
      clockSkewToleranceSeconds: 300,
    });

    assert.equal(parsed.success, true);

    const invalid = CreateAppInstanceSchema.safeParse({
      name: "Broken SAML App",
      slug: "broken-saml-skew",
      protocol: "SAML",
      entryPoint: "https://idp.example.com/sso/saml",
      issuer: "https://authlab.example.com/sp",
      idpCert: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      clockSkewToleranceSeconds: 301,
    });

    assert.equal(invalid.success, false);
    assert.ok(
      invalid.error.issues.some((issue) => issue.path.includes("clockSkewToleranceSeconds")),
    );
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

  it("accepts valid transfer modes and rejects missing target team ids", () => {
    assert.equal(
      TransferAppSchema.safeParse({ mode: "COPY", targetTeamId: "team-1" }).success,
      true,
    );

    const parsed = TransferAppSchema.safeParse({ mode: "MOVE", targetTeamId: "" });
    assert.equal(parsed.success, false);
    assert.match(parsed.error.issues[0]?.message ?? "", /targetTeamId is required/);
  });

  it("defaults admin-created users to non-admin with empty memberships", () => {
    const parsed = AdminCreateUserSchema.parse({
      email: "user@example.com",
      name: "User",
      tempPassword: "TemporaryPass123!",
    });

    assert.equal(parsed.isSystemAdmin, false);
    assert.deepEqual(parsed.memberships, []);
  });

  it("defaults team join requests to member role and restricts review actions", () => {
    const joinRequest = CreateTeamJoinRequestSchema.parse({});
    assert.equal(joinRequest.role, "MEMBER");

    const review = ReviewTeamJoinRequestSchema.safeParse({ action: "maybe" });
    assert.equal(review.success, false);
    assert.match(review.error.issues[0]?.message ?? "", /Invalid option/);
  });
});
