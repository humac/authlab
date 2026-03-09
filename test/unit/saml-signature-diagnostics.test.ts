import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateSelfSignedSamlSigningMaterial } from "../../src/lib/saml-signing-material.ts";
import { analyzeSamlSignatureDiagnostics } from "../../src/lib/saml-signature-diagnostics.ts";

function extractCertificateBody(pem: string): string {
  return pem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s+/g, "");
}

describe("SAML signature diagnostics", () => {
  it("extracts response and assertion signature details from captured XML", async () => {
    const material = await generateSelfSignedSamlSigningMaterial({
      name: "SAML Signature Test",
      slug: "saml-signature-test",
    });
    const certBody = extractCertificateBody(material.certificatePem);
    const xml = `
      <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:Signature>
          <ds:SignedInfo>
            <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#" />
            <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" />
            <ds:Reference URI="#response">
              <ds:Transforms>
                <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature" />
              </ds:Transforms>
              <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
            </ds:Reference>
          </ds:SignedInfo>
          <ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certBody}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>
        </ds:Signature>
        <saml:Assertion>
          <ds:Signature>
            <ds:SignedInfo>
              <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#" />
              <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" />
              <ds:Reference URI="#assertion">
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
              </ds:Reference>
            </ds:SignedInfo>
          </ds:Signature>
        </saml:Assertion>
      </samlp:Response>
    `;

    const diagnostics = await analyzeSamlSignatureDiagnostics({
      xml,
      configuredIdpCert: material.certificatePem,
      callbackValidated: true,
    });

    assert.equal(diagnostics.status, "verified");
    assert.equal(diagnostics.responseSigned, true);
    assert.equal(diagnostics.assertionSigned, true);
    assert.equal(diagnostics.details.length, 2);
    assert.equal(diagnostics.details[0]?.references[0]?.uri, "#response");
  });

  it("reports missing signature structure", async () => {
    const diagnostics = await analyzeSamlSignatureDiagnostics({
      xml: "<Response></Response>",
      configuredIdpCert: null,
      callbackValidated: true,
    });

    assert.equal(diagnostics.status, "missing");
    assert.equal(diagnostics.details.length, 0);
  });
});
