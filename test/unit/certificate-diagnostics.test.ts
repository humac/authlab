import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { probeModule } from "./test-helpers.ts";

const skip = await probeModule("@peculiar/x509");

describe("certificate diagnostics", { skip: skip || undefined }, () => {
  it("parses a healthy certificate and reports expiry details", async () => {
    const { analyzeCertificatePem } = await import("../../src/lib/certificate-diagnostics.ts");
    const { generateSelfSignedSamlSigningMaterial } = await import("../../src/lib/saml-signing-material.ts");

    const material = await generateSelfSignedSamlSigningMaterial({
      name: "Healthy Cert",
      slug: "healthy-cert",
    });

    const diagnostics = analyzeCertificatePem(material.certificatePem);

    assert.equal(diagnostics.status, "healthy");
    assert.match(diagnostics.subject ?? "", /healthy-cert/i);
    assert.match(diagnostics.fingerprint256 ?? "", /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
    assert.equal(typeof diagnostics.daysUntilExpiry, "number");
  });

  it("reports missing and invalid certificates safely", async () => {
    const { analyzeCertificatePem } = await import("../../src/lib/certificate-diagnostics.ts");

    assert.equal(analyzeCertificatePem(null).status, "missing");
    assert.equal(analyzeCertificatePem("not-a-cert").status, "invalid");
  });
});
