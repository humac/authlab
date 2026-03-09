import { X509Certificate } from "node:crypto";

export type CertificateHealthStatus =
  | "healthy"
  | "expiring"
  | "expired"
  | "invalid"
  | "missing";

export interface CertificateDiagnostics {
  status: CertificateHealthStatus;
  summary: string;
  subject: string | null;
  issuer: string | null;
  serialNumber: string | null;
  validFrom: string | null;
  validTo: string | null;
  fingerprint256: string | null;
  daysUntilExpiry: number | null;
}

export function normalizeCertificatePem(value: string): string {
  const pemMatch = value.match(
    /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/i,
  );
  const body = (pemMatch ? pemMatch[1] : value).replace(/[^A-Za-z0-9+/=]/g, "");
  if (!body) {
    throw new Error("Certificate content is empty.");
  }

  const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
}

export function analyzeCertificatePem(
  pem: string | null | undefined,
  now: Date = new Date(),
  expiringWindowDays = 30,
): CertificateDiagnostics {
  if (!pem?.trim()) {
    return {
      status: "missing",
      summary: "No certificate is configured.",
      subject: null,
      issuer: null,
      serialNumber: null,
      validFrom: null,
      validTo: null,
      fingerprint256: null,
      daysUntilExpiry: null,
    };
  }

  try {
    const certificate = new X509Certificate(normalizeCertificatePem(pem));
    const validTo = new Date(certificate.validTo);
    const daysUntilExpiry = Number.isNaN(validTo.getTime())
      ? null
      : Math.ceil((validTo.getTime() - now.getTime()) / 86_400_000);

    const status: CertificateHealthStatus =
      daysUntilExpiry === null
        ? "invalid"
        : daysUntilExpiry < 0
          ? "expired"
          : daysUntilExpiry <= expiringWindowDays
            ? "expiring"
            : "healthy";

    const summary =
      status === "healthy"
        ? `Certificate is valid for another ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}.`
        : status === "expiring"
          ? `Certificate expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}.`
          : status === "expired"
            ? `Certificate expired ${Math.abs(daysUntilExpiry ?? 0)} day${Math.abs(daysUntilExpiry ?? 0) === 1 ? "" : "s"} ago.`
            : "Certificate dates could not be evaluated.";

    return {
      status,
      summary,
      subject: certificate.subject || null,
      issuer: certificate.issuer || null,
      serialNumber: certificate.serialNumber || null,
      validFrom: certificate.validFrom || null,
      validTo: certificate.validTo || null,
      fingerprint256: certificate.fingerprint256 || null,
      daysUntilExpiry,
    };
  } catch (error) {
    return {
      status: "invalid",
      summary:
        error instanceof Error ? error.message : "Unable to parse certificate.",
      subject: null,
      issuer: null,
      serialNumber: null,
      validFrom: null,
      validTo: null,
      fingerprint256: null,
      daysUntilExpiry: null,
    };
  }
}
