import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { describe, it } from "node:test";
import { probeModule } from "./test-helpers.ts";

const skip = await probeModule("@peculiar/x509");

describe("SAML signing material generation", { skip: skip || undefined }, () => {
  it("generates a self-signed keypair that can be persisted for testing", async () => {
    const { validatePemCertificate, validatePemPrivateKey } = await import("../../src/lib/pem.ts");
    const { generateSelfSignedSamlSigningMaterial } = await import("../../src/lib/saml-signing-material.ts");

    const material = await generateSelfSignedSamlSigningMaterial({
      name: "Finance SSO",
      slug: "finance-sso",
    });

    assert.match(material.privateKeyPem, /BEGIN PRIVATE KEY/);
    assert.match(material.certificatePem, /BEGIN CERTIFICATE/);
    assert.match(material.info.subject, /AuthLab finance-sso/i);
    assert.match(material.info.fingerprint256, /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);

    const normalizedKey = validatePemPrivateKey(material.privateKeyPem);
    const normalizedCert = validatePemCertificate(material.certificatePem);
    const parsedCert = new X509Certificate(normalizedCert);

    assert.match(normalizedKey, /BEGIN PRIVATE KEY/);
    assert.equal(parsedCert.subject, material.info.subject);
    assert.equal(new Date(parsedCert.validTo).toISOString(), material.info.validTo);
  });

  it("supports encryption usage for encrypted-assertion testing", async () => {
    const { generateSelfSignedSamlSigningMaterial } = await import("../../src/lib/saml-signing-material.ts");

    const material = await generateSelfSignedSamlSigningMaterial({
      name: "Encrypted Assertion SP",
      slug: "encrypted-assertion-sp",
      usage: "encryption",
    });

    assert.equal(material.info.usage, "encryption");
    assert.match(material.certificatePem, /BEGIN CERTIFICATE/);
    assert.match(material.privateKeyPem, /BEGIN PRIVATE KEY/);
  });
});
