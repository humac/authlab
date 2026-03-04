import { lookup } from "node:dns/promises";
import net from "node:net";
import { parseStringPromise, processors } from "xml2js";
import { sanitizeXml } from "./xxe-sanitizer";

const HTTP_REDIRECT_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
const HTTP_POST_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";
const MAX_REDIRECTS = 3;
const MAX_XML_BYTES = 1024 * 1024; // 1MB
const REQUEST_TIMEOUT_MS = 10_000;

export interface ParsedIdpMetadata {
  entryPoint: string;
  idpCert: string;
  idpEntityId: string | null;
  binding: string;
  warnings: string[];
}

class MetadataError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class MetadataFormatError extends MetadataError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class MetadataValidationError extends MetadataError {
  constructor(message: string) {
    super(message, 422);
  }
}

export class MetadataUrlBlockedError extends MetadataError {
  constructor(message: string) {
    super(message, 403);
  }
}

export class MetadataFetchError extends MetadataError {
  constructor(message: string) {
    super(message, 502);
  }
}

interface EntityDescriptorCandidate {
  entityId: string | null;
  idpSsoDescriptor: Record<string, unknown>;
}

type UnknownRecord = Record<string, unknown>;

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function getText(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const record = asRecord(value);
  if (record && typeof record._ === "string") return record._.trim();
  return null;
}

function collectEntityDescriptors(node: unknown): UnknownRecord[] {
  const record = asRecord(node);
  if (!record) return [];

  const entities: UnknownRecord[] = toArray(record.EntityDescriptor).flatMap<UnknownRecord>(
    (entity) => {
      const parsed = asRecord(entity);
      return parsed ? [parsed] : [];
    },
  );
  const nested: UnknownRecord[] = toArray(record.EntitiesDescriptor).flatMap<UnknownRecord>(
    (child) => collectEntityDescriptors(child),
  );
  return [...entities, ...nested];
}

function extractCandidates(root: UnknownRecord): EntityDescriptorCandidate[] {
  if (root.EntityDescriptor) {
    const descriptor = asRecord(root.EntityDescriptor);
    if (!descriptor) return [];

    return toArray(descriptor.IDPSSODescriptor)
      .flatMap<UnknownRecord>((idp) => {
        const parsed = asRecord(idp);
        return parsed ? [parsed] : [];
      })
      .map((idpSsoDescriptor) => ({
        entityId:
          typeof descriptor.$ === "object" && descriptor.$ && "entityID" in descriptor.$
            ? getText((descriptor.$ as UnknownRecord).entityID)
            : null,
        idpSsoDescriptor,
      }));
  }

  if (!root.EntitiesDescriptor) {
    return [];
  }

  const entities = collectEntityDescriptors(root.EntitiesDescriptor);
  return entities.flatMap((entity) =>
    toArray(entity.IDPSSODescriptor)
      .flatMap<UnknownRecord>((idp) => {
        const parsed = asRecord(idp);
        return parsed ? [parsed] : [];
      })
      .map((idpSsoDescriptor) => ({
        entityId:
          typeof entity.$ === "object" && entity.$ && "entityID" in entity.$
            ? getText((entity.$ as UnknownRecord).entityID)
            : null,
        idpSsoDescriptor,
      })),
  );
}

function pickSingleSignOnService(descriptor: UnknownRecord): {
  binding: string;
  location: string;
  warning: string | null;
} {
  const services = toArray(descriptor.SingleSignOnService)
    .flatMap<UnknownRecord>((item) => {
      const parsed = asRecord(item);
      return parsed ? [parsed] : [];
    })
    .map((service) => {
      const attrs = asRecord(service.$);
      return {
        binding: attrs ? getText(attrs.Binding) : null,
        location: attrs ? getText(attrs.Location) : null,
      };
    })
    .filter(
      (service): service is { binding: string; location: string } =>
        !!service.binding && !!service.location,
    );

  if (services.length === 0) {
    throw new MetadataValidationError(
      "Metadata is missing a valid IDPSSODescriptor SingleSignOnService endpoint",
    );
  }

  const redirect = services.find((service) => service.binding === HTTP_REDIRECT_BINDING);
  if (redirect) {
    return { ...redirect, warning: null };
  }

  const post = services.find((service) => service.binding === HTTP_POST_BINDING);
  if (post) {
    return {
      ...post,
      warning:
        "No HTTP-Redirect SSO endpoint found; using HTTP-POST endpoint from metadata.",
    };
  }

  return {
    ...services[0],
    warning: "No standard Redirect/POST SSO endpoint found; using first available endpoint.",
  };
}

function findX509Certificates(node: unknown): string[] {
  const record = asRecord(node);
  if (!record) return [];

  const certificates: string[] = [];
  const directCerts = toArray(record.X509Certificate).map(getText).filter(Boolean);
  certificates.push(...(directCerts as string[]));

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (const item of value) {
          certificates.push(...findX509Certificates(item));
        }
      } else {
        certificates.push(...findX509Certificates(value));
      }
    }
  }

  return certificates;
}

function normalizeCertificateToPem(rawCert: string): string {
  const pemMatch = rawCert.match(
    /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/i,
  );
  const body = (pemMatch ? pemMatch[1] : rawCert).replace(/[^A-Za-z0-9+/=]/g, "");

  if (!body) {
    throw new MetadataValidationError("Metadata certificate content is empty.");
  }

  const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
}

function pickSigningCertificate(descriptor: UnknownRecord): {
  cert: string;
  warning: string | null;
} {
  const keyDescriptors = toArray(descriptor.KeyDescriptor).flatMap<UnknownRecord>((item) => {
    const parsed = asRecord(item);
    return parsed ? [parsed] : [];
  });

  const sorted = [...keyDescriptors].sort((a, b) => {
    const useA = asRecord(a.$)?.use;
    const useB = asRecord(b.$)?.use;
    const scoreA = useA === "signing" ? 0 : useA ? 2 : 1;
    const scoreB = useB === "signing" ? 0 : useB ? 2 : 1;
    return scoreA - scoreB;
  });

  for (const keyDescriptor of sorted) {
    const cert = findX509Certificates(keyDescriptor).find(Boolean);
    if (cert) {
      const warning =
        asRecord(keyDescriptor.$)?.use === "signing"
          ? null
          : 'No KeyDescriptor with use="signing" found; using first available certificate.';
      return { cert: normalizeCertificateToPem(cert), warning };
    }
  }

  const fallback = findX509Certificates(descriptor).find(Boolean);
  if (fallback) {
    return {
      cert: normalizeCertificateToPem(fallback),
      warning:
        "No KeyDescriptor certificate found; using first fallback X509Certificate in descriptor.",
    };
  }

  throw new MetadataValidationError(
    "Metadata is missing an IdP signing certificate (X509Certificate).",
  );
}

export async function parseIdpMetadata(xml: string): Promise<ParsedIdpMetadata> {
  if (!xml || !xml.trim()) {
    throw new MetadataFormatError("Metadata XML is empty.");
  }

  const sanitizedXml = sanitizeXml(xml);
  const parsed = await parseStringPromise(sanitizedXml, {
    explicitArray: false,
    explicitRoot: true,
    trim: true,
    tagNameProcessors: [processors.stripPrefix],
    attrNameProcessors: [processors.stripPrefix],
  }).catch(() => {
    throw new MetadataFormatError("Metadata XML is malformed and could not be parsed.");
  });

  const root = asRecord(parsed);
  if (!root) {
    throw new MetadataFormatError("Metadata XML root is invalid.");
  }

  const candidates = extractCandidates(root);
  if (candidates.length === 0) {
    throw new MetadataValidationError(
      "Metadata must contain at least one EntityDescriptor with IDPSSODescriptor.",
    );
  }

  for (const candidate of candidates) {
    try {
      const sso = pickSingleSignOnService(candidate.idpSsoDescriptor);
      const cert = pickSigningCertificate(candidate.idpSsoDescriptor);
      const warnings = [sso.warning, cert.warning].filter(Boolean) as string[];

      return {
        entryPoint: sso.location,
        idpCert: cert.cert,
        idpEntityId: candidate.entityId,
        binding: sso.binding,
        warnings,
      };
    } catch (error) {
      if (!(error instanceof MetadataValidationError)) {
        throw error;
      }
    }
  }

  throw new MetadataValidationError(
    "No usable IDPSSODescriptor found with both SSO endpoint and certificate.",
  );
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    return net.isIP(mapped) === 4 ? isBlockedIpv4(mapped) : true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8")) return true;
  return false;
}

function isBlockedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

async function assertAllowedUrlTarget(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    throw new MetadataUrlBlockedError("Only HTTPS metadata URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new MetadataUrlBlockedError("Metadata URL must not contain credentials.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new MetadataUrlBlockedError("Localhost metadata URLs are blocked.");
  }

  const ipFamily = net.isIP(hostname);
  if (ipFamily !== 0) {
    if (isBlockedIp(hostname)) {
      throw new MetadataUrlBlockedError("Private/internal metadata URLs are blocked.");
    }
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true }).catch(() => {
    throw new MetadataFetchError("Could not resolve metadata URL hostname.");
  });

  if (addresses.length === 0) {
    throw new MetadataFetchError("Metadata URL hostname resolved to no addresses.");
  }

  for (const address of addresses) {
    if (isBlockedIp(address.address)) {
      throw new MetadataUrlBlockedError(
        "Metadata URL resolved to a blocked private/internal address.",
      );
    }
  }
}

async function readResponseBodyWithLimit(response: Response): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > MAX_XML_BYTES) {
      await reader.cancel();
      throw new MetadataFetchError("Metadata response exceeded 1MB limit.");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8").decode(merged);
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function looksLikeXml(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("<");
}

async function fetchMetadataXmlFromUrl(rawUrl: string): Promise<{ xml: string; warnings: string[] }> {
  let current = new URL(rawUrl);
  const warnings: string[] = [];

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertAllowedUrlTarget(current);

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "application/samlmetadata+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new MetadataFetchError("Metadata URL request timed out.");
      }
      throw new MetadataFetchError("Metadata URL request failed.");
    });

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new MetadataFetchError("Metadata URL redirect response was missing Location header.");
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new MetadataFetchError("Metadata URL exceeded maximum redirect limit.");
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new MetadataFetchError(
        `Metadata URL responded with HTTP ${response.status}.`,
      );
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const xml = await readResponseBodyWithLimit(response);

    if (!looksLikeXml(xml)) {
      throw new MetadataFormatError("Metadata URL response was not valid XML content.");
    }

    const xmlContentType =
      contentType.includes("xml") || contentType.includes("samlmetadata");
    if (contentType && !xmlContentType) {
      warnings.push(
        `Metadata URL returned unexpected content-type "${contentType}" but XML payload was parsed.`,
      );
    }

    return { xml, warnings };
  }

  throw new MetadataFetchError("Metadata URL exceeded maximum redirect limit.");
}

export async function fetchAndParseIdpMetadata(url: string): Promise<ParsedIdpMetadata> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new MetadataFormatError("Metadata URL is invalid.");
  }

  const { xml, warnings } = await fetchMetadataXmlFromUrl(parsedUrl.toString());
  const parsed = await parseIdpMetadata(xml);

  return {
    ...parsed,
    warnings: [...warnings, ...parsed.warnings],
  };
}
