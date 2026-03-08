import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSamlStatusLabel,
  parseSamlResponseXml,
} from "@/lib/saml-response-parser";

describe("parseSamlResponseXml", () => {
  it("parses a namespaced SAML response into structured sections", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="_response123"
  Version="2.0"
  IssueInstant="2026-03-08T13:00:00Z"
  Destination="https://authlab.example.com/api/auth/callback/saml/sample-app"
  InResponseTo="_request123">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success" />
  </samlp:Status>
  <saml:Assertion ID="_assertion123" IssueInstant="2026-03-08T13:00:01Z" Version="2.0">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">user@example.com</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData
          InResponseTo="_request123"
          NotOnOrAfter="2026-03-08T13:05:00Z"
          Recipient="https://authlab.example.com/api/auth/callback/saml/sample-app" />
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-03-08T12:55:00Z" NotOnOrAfter="2026-03-08T13:10:00Z">
      <saml:AudienceRestriction>
        <saml:Audience>https://authlab.example.com/sp</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement
      AuthnInstant="2026-03-08T13:00:01Z"
      SessionIndex="_session123"
      SessionNotOnOrAfter="2026-03-08T21:00:01Z">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
        <saml:AuthenticatingAuthority>https://idp.example.com</saml:AuthenticatingAuthority>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="department" FriendlyName="Department">
        <saml:AttributeValue>Engineering</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="groups">
        <saml:AttributeValue>admins</saml:AttributeValue>
        <saml:AttributeValue>developers</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

    const assertion = await parseSamlResponseXml(xml, new Date("2026-03-08T13:02:00Z"));

    assert.equal(assertion.parseError, null);
    assert.equal(assertion.responseIssuer, "https://idp.example.com/metadata");
    assert.equal(assertion.responseStatus, "urn:oasis:names:tc:SAML:2.0:status:Success");
    assert.equal(assertion.subject.nameId, "user@example.com");
    assert.equal(
      assertion.subject.nameIdFormat,
      "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    );
    assert.equal(assertion.subject.posture, "active");
    assert.equal(assertion.subject.confirmations[0]?.status, "active");
    assert.equal(assertion.conditions.status, "active");
    assert.deepEqual(assertion.conditions.audiences, ["https://authlab.example.com/sp"]);
    assert.equal(
      assertion.authn.classRef,
      "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
    );
    assert.equal(assertion.authn.sessionIndex, "_session123");
    assert.deepEqual(assertion.authn.authorities, ["https://idp.example.com"]);
    assert.equal(assertion.attributes.length, 2);
    assert.deepEqual(assertion.attributes[0], {
      name: "department",
      friendlyName: "Department",
      nameFormat: null,
      values: ["Engineering"],
    });
    assert.deepEqual(assertion.attributes[1]?.values, ["admins", "developers"]);
  });

  it("returns a parse error for malformed XML without throwing", async () => {
    const assertion = await parseSamlResponseXml("<samlp:Response><broken>", new Date());

    assert.ok(assertion.parseError);
    assert.match(assertion.parseError, /(unexpected end|unclosed root tag)/i);
    assert.equal(assertion.attributes.length, 0);
    assert.equal(assertion.conditions.status, "missing");
  });
});

describe("formatSamlStatusLabel", () => {
  it("humanizes URNs and internal status strings", () => {
    assert.equal(formatSamlStatusLabel("urn:oasis:names:tc:SAML:2.0:status:Success"), "Success");
    assert.equal(formatSamlStatusLabel("notOnOrAfter"), "Not On Or After");
    assert.equal(formatSamlStatusLabel(null), "Unavailable");
  });
});
