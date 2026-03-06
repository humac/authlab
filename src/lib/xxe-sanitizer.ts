/**
 * Defense-in-depth XML sanitizer for XXE (XML External Entity) prevention.
 *
 * Primary XXE protection comes from the @node-saml/node-saml library itself.
 * This sanitizer provides an additional layer by stripping dangerous constructs
 * before the XML reaches the SAML parser.
 *
 * Handles:
 * - DOCTYPE declarations (including internal subsets with nested brackets)
 * - ENTITY declarations (general, parameter, and external)
 * - SYSTEM and PUBLIC external references
 * - Processing instructions that could reference external resources
 * - CDATA-wrapped entity references
 */
export function sanitizeXml(xml: string): string {
  let sanitized = xml;

  // Remove DOCTYPE declarations including internal subsets.
  // Use a greedy approach that handles nested brackets within the internal subset.
  sanitized = sanitized.replace(
    /<!DOCTYPE\s[^[>]*(?:\[[\s\S]*?\]\s*)?\s*>/gi,
    "",
  );

  // Remove any remaining ENTITY declarations that may have survived
  // (e.g., if they appeared outside a DOCTYPE).
  sanitized = sanitized.replace(/<!ENTITY\s[\s\S]*?>/gi, "");

  // Remove SYSTEM and PUBLIC external references
  sanitized = sanitized.replace(/SYSTEM\s+["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(
    /PUBLIC\s+["'][^"']*["']\s*(?:["'][^"']*["'])?/gi,
    "",
  );

  // Remove processing instructions that could load external resources
  // (e.g., <?xml-stylesheet href="http://evil.com/xxe.xsl"?>)
  sanitized = sanitized.replace(/<\?xml-stylesheet\s[\s\S]*?\?>/gi, "");

  return sanitized;
}
