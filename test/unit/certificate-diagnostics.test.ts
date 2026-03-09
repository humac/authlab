import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeCertificatePem } from "../../src/lib/certificate-diagnostics.ts";
import { generateSelfSignedSamlSigningMaterial } from "../../src/lib/saml-signing-material.ts";

describe("certificate diagnostics", () => {
  it("parses a healthy certificate and reports expiry details", async () => {
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

  it("reports missing and invalid certificates safely", () => {
    assert.equal(analyzeCertificatePem(null).status, "missing");
    assert.equal(analyzeCertificatePem("not-a-cert").status, "invalid");
  });
});
