/**
 * Sanitize XML to prevent XXE (XML External Entity) attacks.
 * Strips DOCTYPE declarations, ENTITY definitions, SYSTEM and PUBLIC references.
 */
export function sanitizeXml(xml: string): string {
  let sanitized = xml;
  // Remove DOCTYPE declarations (including internal subsets)
  sanitized = sanitized.replace(/<!DOCTYPE[^>[]*(\[[^\]]*\])?\s*>/gi, "");
  // Remove ENTITY declarations
  sanitized = sanitized.replace(/<!ENTITY[^>]*>/gi, "");
  // Remove SYSTEM and PUBLIC references
  sanitized = sanitized.replace(/SYSTEM\s+["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(
    /PUBLIC\s+["'][^"']*["']\s+["'][^"']*["']/gi,
    ""
  );
  return sanitized;
}
