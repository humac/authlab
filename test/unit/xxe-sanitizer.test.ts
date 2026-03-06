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

  it("preserves safe XML payloads", () => {
    const xml = "<EntityDescriptor><Name>AuthLab</Name></EntityDescriptor>";

    assert.equal(sanitizeXml(xml), xml);
  });
});
