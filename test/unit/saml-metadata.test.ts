import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MetadataFormatError,
  MetadataUrlBlockedError,
  MetadataValidationError,
  parseIdpMetadata,
  fetchAndParseIdpMetadata,
} from "../../src/lib/saml-metadata.ts";

const CERT = "MIIBsjCCAVmgAwIBAgIUB4X7RkZ6dGVzdENlcnRpZmljYXRlMAoGCCqGSM49BAMC";

function buildMetadata(options?: {
  binding?: string;
  location?: string;
  use?: string;
  includeCertificate?: boolean;
}) {
  const binding =
    options?.binding ?? "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
  const location = options?.location ?? "https://idp.example.com/sso";
  const use = options?.use ?? "signing";
  const certificateXml = options?.includeCertificate === false
    ? ""
    : `<KeyDescriptor use="${use}">
         <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
           <X509Data>
             <X509Certificate>${CERT}</X509Certificate>
           </X509Data>
         </KeyInfo>
       </KeyDescriptor>`;

  return `<?xml version="1.0"?>
    <EntityDescriptor entityID="https://idp.example.com/metadata" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
      <IDPSSODescriptor>
        ${certificateXml}
        <SingleSignOnService Binding="${binding}" Location="${location}" />
      </IDPSSODescriptor>
    </EntityDescriptor>`;
}

describe("SAML metadata parsing", () => {
  it("parses valid metadata with redirect binding and signing certificate", async () => {
    const parsed = await parseIdpMetadata(buildMetadata());

    assert.equal(parsed.entryPoint, "https://idp.example.com/sso");
    assert.equal(parsed.binding, "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect");
    assert.equal(parsed.idpEntityId, "https://idp.example.com/metadata");
    assert.match(parsed.idpCert, /BEGIN CERTIFICATE/);
    assert.deepEqual(parsed.warnings, []);
  });

  it("falls back to HTTP-POST and records a warning", async () => {
    const parsed = await parseIdpMetadata(
      buildMetadata({
        binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
      }),
    );

    assert.equal(parsed.binding, "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST");
    assert.equal(parsed.warnings.length, 1);
    assert.match(parsed.warnings[0] ?? "", /HTTP-POST endpoint/);
  });

  it("rejects empty XML", async () => {
    await assert.rejects(() => parseIdpMetadata(""), MetadataFormatError);
  });

  it("rejects malformed XML", async () => {
    await assert.rejects(
      () => parseIdpMetadata("<EntityDescriptor>"),
      MetadataFormatError,
    );
  });

  it("rejects metadata without a usable certificate", async () => {
    await assert.rejects(
      () => parseIdpMetadata(buildMetadata({ includeCertificate: false })),
      MetadataValidationError,
    );
  });

  it("blocks non-HTTPS metadata URLs before any network request", async () => {
    await assert.rejects(
      () => fetchAndParseIdpMetadata("http://idp.example.com/metadata"),
      MetadataUrlBlockedError,
    );
  });
});
