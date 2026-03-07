import {
  createHash,
  webcrypto,
  X509Certificate as NodeX509Certificate,
} from "node:crypto";
import {
  BasicConstraintsExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  SubjectKeyIdentifierExtension,
  X509CertificateGenerator,
} from "@peculiar/x509";

export interface GeneratedSamlSigningMaterial {
  privateKeyPem: string;
  certificatePem: string;
  info: {
    commonName: string;
    subject: string;
    validFrom: string;
    validTo: string;
    fingerprint256: string;
  };
}

interface GenerateSamlSigningMaterialOptions {
  name?: string | null;
  slug?: string | null;
}

function wrapPem(label: string, base64: string): string {
  const wrapped = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
}

function sanitizeDnValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9 .:@/_-]/g, " ").replace(/\s+/g, " ").trim();
}

function buildCommonName(options: GenerateSamlSigningMaterialOptions): string {
  const candidate = sanitizeDnValue(options.slug || options.name || "Test SP");
  const value = candidate || "Test SP";
  return `AuthLab ${value}`.slice(0, 64);
}

function createSerialNumber(): string {
  return Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("hex");
}

export async function generateSelfSignedSamlSigningMaterial(
  options: GenerateSamlSigningMaterialOptions = {},
): Promise<GeneratedSamlSigningMaterial> {
  const commonName = buildCommonName(options);
  const signingAlgorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048,
  } as const;

  const keys = await webcrypto.subtle.generateKey(
    signingAlgorithm,
    true,
    ["sign", "verify"],
  );

  const notBefore = new Date(Date.now() - 5 * 60 * 1000);
  const notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const certificate = await X509CertificateGenerator.createSelfSigned({
    serialNumber: createSerialNumber(),
    name: `CN=${commonName},O=AuthLab Test`,
    notBefore,
    notAfter,
    keys,
    signingAlgorithm,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      await SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });

  const privateKeyPkcs8 = await webcrypto.subtle.exportKey("pkcs8", keys.privateKey);
  const privateKeyPem = wrapPem(
    "PRIVATE KEY",
    Buffer.from(privateKeyPkcs8).toString("base64"),
  );
  const certificatePem = certificate.toString("pem");
  const parsedCertificate = new NodeX509Certificate(certificatePem);

  return {
    privateKeyPem,
    certificatePem,
    info: {
      commonName,
      subject: parsedCertificate.subject,
      validFrom: new Date(parsedCertificate.validFrom).toISOString(),
      validTo: new Date(parsedCertificate.validTo).toISOString(),
      fingerprint256: createHash("sha256")
        .update(parsedCertificate.raw)
        .digest("hex")
        .toUpperCase()
        .match(/.{1,2}/g)
        ?.join(":") ?? "",
    },
  };
}
