import { parseStringPromise, processors } from "xml2js";
import {
  analyzeCertificatePem,
  normalizeCertificatePem,
} from "./certificate-diagnostics";

type UnknownRecord = Record<string, unknown>;

export interface SamlSignatureReference {
  uri: string | null;
  digestAlgorithm: string | null;
  transforms: string[];
}

export interface SamlSignatureLocationDetail {
  location: "response" | "assertion";
  signatureAlgorithm: string | null;
  canonicalizationAlgorithm: string | null;
  references: SamlSignatureReference[];
  embeddedCertificateFingerprint: string | null;
  embeddedCertificateSubject: string | null;
  certificateMatchesConfigured: boolean | null;
}

export interface SamlSignatureDiagnostics {
  status: "verified" | "warning" | "missing";
  summary: string;
  callbackValidated: boolean;
  responseSigned: boolean;
  assertionSigned: boolean;
  configuredCertificateFingerprint: string | null;
  configuredCertificateSubject: string | null;
  details: SamlSignatureLocationDetail[];
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function getAttrs(value: unknown): Record<string, string> {
  const record = asRecord(value);
  const attrs = record?.$;
  return attrs && typeof attrs === "object" && !Array.isArray(attrs)
    ? (attrs as Record<string, string>)
    : {};
}

function getFirstChild(record: UnknownRecord | null, key: string): UnknownRecord | null {
  return asRecord(toArray(record?.[key])[0]);
}

function getNodeText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  if (typeof record._ === "string") {
    const trimmed = record._.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function findEmbeddedCertificate(node: unknown): string | null {
  const record = asRecord(node);
  if (!record) {
    return null;
  }

  const direct = toArray(record.X509Certificate)
    .map((entry) => getNodeText(entry))
    .find(Boolean);
  if (direct) {
    return direct;
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const nested of value) {
        const found = findEmbeddedCertificate(nested);
        if (found) {
          return found;
        }
      }
      continue;
    }

    const found = findEmbeddedCertificate(value);
    if (found) {
      return found;
    }
  }

  return null;
}

function buildSignatureDetail(
  signature: UnknownRecord,
  location: "response" | "assertion",
  configuredFingerprint: string | null,
): SamlSignatureLocationDetail {
  const signedInfo = getFirstChild(signature, "SignedInfo");
  const signatureMethod = getAttrs(getFirstChild(signedInfo, "SignatureMethod")).Algorithm ?? null;
  const canonicalizationMethod =
    getAttrs(getFirstChild(signedInfo, "CanonicalizationMethod")).Algorithm ?? null;
  const references = toArray(signedInfo?.Reference)
    .map((reference) => asRecord(reference))
    .filter((reference): reference is UnknownRecord => Boolean(reference))
    .map((reference) => {
      const transforms = toArray(getFirstChild(reference, "Transforms")?.Transform)
        .map((transform) => getAttrs(transform).Algorithm ?? null)
        .filter((algorithm): algorithm is string => Boolean(algorithm));
      return {
        uri: getAttrs(reference).URI ?? null,
        digestAlgorithm:
          getAttrs(getFirstChild(reference, "DigestMethod")).Algorithm ?? null,
        transforms,
      };
    });

  const embeddedCertificate = findEmbeddedCertificate(getFirstChild(signature, "KeyInfo"));
  const embeddedDiagnostics = embeddedCertificate
    ? analyzeCertificatePem(normalizeCertificatePem(embeddedCertificate))
    : null;
  const embeddedFingerprint = embeddedDiagnostics?.fingerprint256 ?? null;

  return {
    location,
    signatureAlgorithm: signatureMethod,
    canonicalizationAlgorithm: canonicalizationMethod,
    references,
    embeddedCertificateFingerprint: embeddedFingerprint,
    embeddedCertificateSubject: embeddedDiagnostics?.subject ?? null,
    certificateMatchesConfigured:
      configuredFingerprint && embeddedFingerprint
        ? configuredFingerprint === embeddedFingerprint
        : null,
  };
}

export async function analyzeSamlSignatureDiagnostics(input: {
  xml: string | null;
  configuredIdpCert: string | null;
  callbackValidated: boolean;
}): Promise<SamlSignatureDiagnostics> {
  const configuredCertificate = analyzeCertificatePem(input.configuredIdpCert);

  if (!input.xml?.trim()) {
    return {
      status: "missing",
      summary: "No raw SAML response XML is available for signature inspection.",
      callbackValidated: input.callbackValidated,
      responseSigned: false,
      assertionSigned: false,
      configuredCertificateFingerprint: configuredCertificate.fingerprint256,
      configuredCertificateSubject: configuredCertificate.subject,
      details: [],
    };
  }

  try {
    const parsed = await parseStringPromise(input.xml, {
      explicitArray: false,
      trim: true,
      attrkey: "$",
      charkey: "_",
      tagNameProcessors: [processors.stripPrefix],
      attrNameProcessors: [processors.stripPrefix],
    });

    const root = asRecord(parsed[Object.keys(parsed)[0] ?? ""]);
    const assertion = getFirstChild(root, "Assertion");
    const responseSignature = getFirstChild(root, "Signature");
    const assertionSignature = getFirstChild(assertion, "Signature");
    const details: SamlSignatureLocationDetail[] = [];

    if (responseSignature) {
      details.push(
        buildSignatureDetail(
          responseSignature,
          "response",
          configuredCertificate.fingerprint256,
        ),
      );
    }
    if (assertionSignature) {
      details.push(
        buildSignatureDetail(
          assertionSignature,
          "assertion",
          configuredCertificate.fingerprint256,
        ),
      );
    }

    const hasMismatch = details.some(
      (detail) => detail.certificateMatchesConfigured === false,
    );
    const status =
      details.length === 0
        ? "missing"
        : input.callbackValidated && !hasMismatch
          ? "verified"
          : "warning";

    const summary =
      details.length === 0
        ? "No ds:Signature element was detected on the response or assertion."
        : input.callbackValidated
          ? hasMismatch
            ? "The callback was accepted, but the embedded signing certificate does not match the configured IdP certificate."
            : "The response was accepted during callback validation and contains a captured signature structure."
          : "Signature structure was detected, but callback validation status is unavailable.";

    return {
      status,
      summary,
      callbackValidated: input.callbackValidated,
      responseSigned: Boolean(responseSignature),
      assertionSigned: Boolean(assertionSignature),
      configuredCertificateFingerprint: configuredCertificate.fingerprint256,
      configuredCertificateSubject: configuredCertificate.subject,
      details,
    };
  } catch (error) {
    return {
      status: "warning",
      summary:
        error instanceof Error
          ? error.message
          : "Unable to parse SAML signature details.",
      callbackValidated: input.callbackValidated,
      responseSigned: false,
      assertionSigned: false,
      configuredCertificateFingerprint: configuredCertificate.fingerprint256,
      configuredCertificateSubject: configuredCertificate.subject,
      details: [],
    };
  }
}
