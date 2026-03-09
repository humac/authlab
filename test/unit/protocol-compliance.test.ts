import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOidcComplianceReport, buildSamlComplianceReport } from "../../src/lib/protocol-compliance.ts";

describe("protocol compliance report", () => {
  it("builds an OIDC report with front-channel logout coverage", () => {
    const report = buildOidcComplianceReport({
      app: {
        pkceMode: "S256",
      } as never,
      run: {
        nonceStatus: "valid",
        idToken: "id-token",
        oidcSessionId: "sid-123",
        oidcSubject: "user-123",
      } as never,
      discoveryMetadata: {
        end_session_endpoint: "https://issuer.example.com/logout",
        userinfo_endpoint: "https://issuer.example.com/userinfo",
      },
      frontChannelLogoutUrl: "https://authlab.example.com/api/auth/frontchannel-logout/test",
      backChannelLogoutUrl: "https://authlab.example.com/api/auth/backchannel-logout/test",
    });

    assert.equal(report.protocol, "OIDC");
    assert.equal(report.checks.find((check) => check.id === "frontchannel-logout")?.status, "pass");
  });

  it("builds a SAML report with certificate and signature findings", () => {
    const report = buildSamlComplianceReport({
      app: {
        samlSignatureAlgorithm: "SHA256",
        samlLogoutUrl: "https://idp.example.com/slo",
        signAuthnRequests: true,
        spSigningPrivateKey: "key",
        spSigningCert: "cert",
      } as never,
      run: {
        rawSamlResponseXml: "<Response />",
      } as never,
      assertion: {
        conditions: { status: "active" },
        subject: { posture: "active" },
      } as never,
      signature: {
        status: "verified",
        summary: "Signature verified.",
      } as never,
      certificate: {
        status: "healthy",
        summary: "Certificate is healthy.",
      } as never,
    });

    assert.equal(report.protocol, "SAML");
    assert.equal(report.checks.find((check) => check.id === "idp-certificate")?.status, "pass");
  });
});
