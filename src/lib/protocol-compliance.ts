import type { DecryptedAppInstance } from "@/types/app-instance";
import type { AuthRun } from "@/types/auth-run";
import type { SamlStructuredAssertion } from "./saml-response-parser";
import type { SamlSignatureDiagnostics } from "./saml-signature-diagnostics";
import type { CertificateDiagnostics } from "./certificate-diagnostics";

export type ComplianceStatus = "pass" | "warn" | "fail" | "info";

export interface ComplianceCheck {
  id: string;
  title: string;
  status: ComplianceStatus;
  summary: string;
}

export interface ProtocolComplianceReport {
  protocol: "OIDC" | "SAML";
  summary: string;
  checks: ComplianceCheck[];
}

export function buildOidcComplianceReport(input: {
  app: DecryptedAppInstance;
  run: AuthRun;
  discoveryMetadata: Record<string, unknown> | null;
  frontChannelLogoutUrl: string;
  backChannelLogoutUrl: string;
}): ProtocolComplianceReport {
  const metadata = input.discoveryMetadata ?? {};
  const checks: ComplianceCheck[] = [
    {
      id: "nonce",
      title: "Nonce validation",
      status:
        input.run.nonceStatus === "valid"
          ? "pass"
          : input.run.nonceStatus
            ? "warn"
            : "info",
      summary:
        input.run.nonceStatus === "valid"
          ? "The ID token nonce matched the stored browser-login nonce."
          : input.run.nonceStatus
            ? `Nonce validation finished with status "${input.run.nonceStatus}".`
            : "This run does not include a recorded nonce validation result.",
    },
    {
      id: "pkce",
      title: "PKCE posture",
      status:
        input.app.pkceMode === "S256"
          ? "pass"
          : input.app.pkceMode === "PLAIN"
            ? "warn"
            : "fail",
      summary:
        input.app.pkceMode === "S256"
          ? "Authorization Code flow uses S256 PKCE."
          : input.app.pkceMode === "PLAIN"
            ? "Authorization Code flow uses plain PKCE for compatibility testing."
            : "Authorization Code flow is configured without PKCE.",
    },
    {
      id: "rp-logout",
      title: "RP-initiated logout",
      status:
        typeof metadata.end_session_endpoint === "string" && Boolean(input.run.idToken)
          ? "pass"
          : "warn",
      summary:
        typeof metadata.end_session_endpoint === "string"
          ? "Provider discovery advertises an end_session_endpoint for RP-initiated logout."
          : "Provider discovery does not advertise an end_session_endpoint.",
    },
    {
      id: "frontchannel-logout",
      title: "Front-channel logout",
      status: input.run.oidcSessionId ? "pass" : "warn",
      summary: input.run.oidcSessionId
        ? `Front-channel logout URI is available and this run captured sid ${input.run.oidcSessionId}.`
        : `Front-channel logout URI is available at ${input.frontChannelLogoutUrl}, but this run did not capture an OIDC sid claim.`,
    },
    {
      id: "backchannel-logout",
      title: "Back-channel logout",
      status: input.run.oidcSubject || input.run.oidcSessionId ? "pass" : "warn",
      summary:
        input.run.oidcSubject || input.run.oidcSessionId
          ? `Back-channel logout endpoint is available at ${input.backChannelLogoutUrl}.`
          : "Back-channel logout endpoint exists, but this run is missing both sid and sub matching data.",
    },
    {
      id: "userinfo",
      title: "UserInfo support",
      status: typeof metadata.userinfo_endpoint === "string" ? "pass" : "info",
      summary:
        typeof metadata.userinfo_endpoint === "string"
          ? "Discovery metadata advertises a UserInfo endpoint."
          : "Discovery metadata does not advertise a UserInfo endpoint.",
    },
  ];

  const passed = checks.filter((check) => check.status === "pass").length;
  const total = checks.length;

  return {
    protocol: "OIDC",
    summary: `${passed}/${total} OIDC compliance checks are currently passing for this run.`,
    checks,
  };
}

export function buildSamlComplianceReport(input: {
  app: DecryptedAppInstance;
  run: AuthRun;
  assertion: SamlStructuredAssertion | null;
  signature: SamlSignatureDiagnostics;
  certificate: CertificateDiagnostics;
}): ProtocolComplianceReport {
  const checks: ComplianceCheck[] = [
    {
      id: "response-captured",
      title: "Assertion capture",
      status: input.run.rawSamlResponseXml ? "pass" : "fail",
      summary: input.run.rawSamlResponseXml
        ? "Raw SAML response XML was captured for inspection."
        : "No raw SAML response XML was captured for this run.",
    },
    {
      id: "signature",
      title: "Signature verification posture",
      status:
        input.signature.status === "verified"
          ? "pass"
          : input.signature.status === "warning"
            ? "warn"
            : "fail",
      summary: input.signature.summary,
    },
    {
      id: "signature-algorithm",
      title: "Request signature algorithm",
      status: input.app.samlSignatureAlgorithm === "SHA256" ? "pass" : "warn",
      summary:
        input.app.samlSignatureAlgorithm === "SHA256"
          ? "AuthnRequest signing uses SHA-256."
          : "AuthnRequest signing is configured for SHA-1 compatibility testing.",
    },
    {
      id: "conditions",
      title: "Conditions window",
      status:
        input.assertion?.conditions.status === "active"
          ? "pass"
          : input.assertion?.conditions.status
            ? "warn"
            : "fail",
      summary:
        input.assertion?.conditions.status === "active"
          ? "Assertion Conditions are active for the current evaluation window."
          : input.assertion?.conditions.status
            ? `Assertion Conditions evaluated as "${input.assertion.conditions.status}".`
            : "No Conditions block was parsed from the assertion.",
    },
    {
      id: "subject-confirmation",
      title: "Subject confirmation",
      status:
        input.assertion?.subject.posture === "active"
          ? "pass"
          : input.assertion?.subject.posture
            ? "warn"
            : "fail",
      summary:
        input.assertion?.subject.posture === "active"
          ? "SubjectConfirmation data is active."
          : input.assertion?.subject.posture
            ? `SubjectConfirmation posture is "${input.assertion.subject.posture}".`
            : "No SubjectConfirmation data was parsed.",
    },
    {
      id: "idp-certificate",
      title: "IdP certificate health",
      status:
        input.certificate.status === "healthy"
          ? "pass"
          : input.certificate.status === "expiring"
            ? "warn"
            : input.certificate.status === "expired" || input.certificate.status === "invalid"
              ? "fail"
              : "warn",
      summary: input.certificate.summary,
    },
    {
      id: "slo",
      title: "Single Logout",
      status: input.app.samlLogoutUrl ? "pass" : "info",
      summary: input.app.samlLogoutUrl
        ? "A SAML Single Logout endpoint is configured for this app."
        : "No IdP Single Logout URL is configured for this app.",
    },
    {
      id: "signed-authn-request",
      title: "Signed AuthnRequest",
      status:
        input.app.signAuthnRequests &&
        Boolean(input.app.spSigningPrivateKey?.trim()) &&
        Boolean(input.app.spSigningCert?.trim())
          ? "pass"
          : "warn",
      summary:
        input.app.signAuthnRequests &&
        Boolean(input.app.spSigningPrivateKey?.trim()) &&
        Boolean(input.app.spSigningCert?.trim())
          ? "SP-initiated AuthnRequests are signed with the app-specific keypair."
          : "Signed AuthnRequests are not fully configured for this app.",
    },
  ];

  const passed = checks.filter((check) => check.status === "pass").length;
  const total = checks.length;

  return {
    protocol: "SAML",
    summary: `${passed}/${total} SAML compliance checks are currently passing for this run.`,
    checks,
  };
}
