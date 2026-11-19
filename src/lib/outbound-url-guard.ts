import dns from "node:dns";
import net from "node:net";
import { Agent } from "undici";

/**
 * SSRF protection for server-side requests whose target URL is supplied by a
 * user (issuer / metadata URLs) or by a remote party (discovery metadata
 * endpoints).
 *
 * Every such request must go through guardedFetch(). The resolved IP is
 * checked at socket-connect time by a shared undici dispatcher, so the address
 * that is validated is the address that is connected to (no DNS-rebinding
 * window), and only one DNS resolution happens per connection.
 */

export class OutboundUrlBlockedError extends Error {
  constructor(message = GENERIC_BLOCKED_MESSAGE) {
    super(message);
    this.name = "OutboundUrlBlockedError";
  }
}

// One message for "blocked", "private", and "does not resolve" so callers
// cannot use the guard as an oracle to map internal DNS names.
const GENERIC_BLOCKED_MESSAGE =
  "Outbound request target is not allowed or could not be reached.";

const BLOCKED_LOOKUP_CODE = "EAUTHLAB_OUTBOUND_BLOCKED";

// ---------------------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------------------

function isBlockedIpv4Octets([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments / TEST-NET-1
  if (a === 192 && b === 88) return true; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return null;
  return octets;
}

/** Expands any valid IPv6 literal (including embedded dotted IPv4) to 16 bytes. */
function parseIpv6(ip: string): number[] | null {
  let address = ip.toLowerCase().split("%")[0];
  if (net.isIPv6(address) === false) return null;

  // Convert a trailing dotted IPv4 into two hextets.
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    address =
      address.slice(0, lastColon + 1) +
      ((v4[0] << 8) | v4[1]).toString(16) +
      ":" +
      ((v4[2] << 8) | v4[3]).toString(16);
  }

  const [head, rest] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const restGroups = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const missing = 8 - headGroups.length - restGroups.length;
  if (rest === undefined && missing !== 0) return null;
  const groups = [...headGroups, ...Array(rest === undefined ? 0 : missing).fill("0"), ...restGroups];
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    const value = parseInt(group, 16);
    if (Number.isNaN(value)) return null;
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

function startsWithBytes(bytes: number[], prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function isBlockedIpv6Bytes(bytes: number[]): boolean {
  const zero12 = Array(12).fill(0);

  // :: and ::1, plus IPv4-compatible ::a.b.c.d (deprecated, but routable on some stacks)
  if (startsWithBytes(bytes, zero12)) {
    const v4 = bytes.slice(12);
    if (v4.every((value) => value === 0)) return true;
    if (v4[0] === 0 && v4[1] === 0 && v4[2] === 0 && v4[3] === 1) return true;
    return isBlockedIpv4Octets(v4);
  }
  // ::ffff:a.b.c.d IPv4-mapped
  if (startsWithBytes(bytes, [...Array(10).fill(0), 0xff, 0xff])) {
    return isBlockedIpv4Octets(bytes.slice(12));
  }
  // 64:ff9b::/96 NAT64 well-known prefix — reaches the embedded IPv4 via a NAT64 gateway
  if (startsWithBytes(bytes, [0x00, 0x64, 0xff, 0x9b, ...Array(8).fill(0)])) {
    return isBlockedIpv4Octets(bytes.slice(12));
  }
  // 64:ff9b:1::/48 local-use NAT64
  if (startsWithBytes(bytes, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01])) return true;
  // 2002::/16 6to4 — embedded IPv4 in bytes 2..5
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isBlockedIpv4Octets(bytes.slice(2, 6));
  // 2001::/32 Teredo (embedded, obfuscated IPv4) and 2001:db8::/32 documentation
  if (startsWithBytes(bytes, [0x20, 0x01, 0x00, 0x00])) return true;
  if (startsWithBytes(bytes, [0x20, 0x01, 0x0d, 0xb8])) return true;
  // 100::/64 discard-only
  if (startsWithBytes(bytes, [0x01, 0x00, 0, 0, 0, 0, 0, 0])) return true;
  // fc00::/7 unique-local
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  // fe80::/10 link-local and fec0::/10 deprecated site-local
  if (bytes[0] === 0xfe && (bytes[1] & 0x80) === 0x80) return true;
  // ff00::/8 multicast
  if (bytes[0] === 0xff) return true;
  return false;
}

/** True for loopback, private, link-local, CGNAT, documentation, multicast, IPv4-embedding IPv6 to any of those, and malformed addresses. */
export function isBlockedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const octets = parseIpv4(address);
    return octets ? isBlockedIpv4Octets(octets) : true;
  }
  if (family === 6) {
    const bytes = parseIpv6(address);
    return bytes ? isBlockedIpv6Bytes(bytes) : true;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export interface OutboundPolicy {
  /** Reject plain http:. */
  httpsOnly?: boolean;
  /** Enforce private-network blocking even outside production. */
  alwaysEnforce?: boolean;
}

/**
 * Private-network targets are blocked in production so a signed-in user cannot
 * point an app at cloud metadata or internal services. Local development and
 * tests keep working against IdPs on localhost. Self-hosted deployments that
 * intentionally test internal IdPs can opt out with
 * AUTHLAB_ALLOW_PRIVATE_OUTBOUND=true.
 */
export function isPrivateOutboundAllowed(): boolean {
  if (process.env.AUTHLAB_ALLOW_PRIVATE_OUTBOUND === "true") return true;
  return process.env.NODE_ENV !== "production";
}

function isEnforced(policy: OutboundPolicy): boolean {
  return Boolean(policy.alwaysEnforce) || !isPrivateOutboundAllowed();
}

function blocked(reason: string, url: URL | string): never {
  console.warn(`[outbound-url-guard] blocked ${String(url)}: ${reason}`);
  throw new OutboundUrlBlockedError();
}

/**
 * Synchronous URL checks: scheme, credentials, localhost names, and IP
 * literals. Hostnames are resolved and checked at connect time by
 * guardedFetch's dispatcher.
 */
export function assertOutboundUrlAllowed(
  input: string | URL,
  policy: OutboundPolicy = {},
): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new OutboundUrlBlockedError("Outbound URL is not a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OutboundUrlBlockedError("Only HTTP(S) outbound URLs are allowed.");
  }
  if (policy.httpsOnly && url.protocol !== "https:") {
    throw new OutboundUrlBlockedError("Only HTTPS outbound URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new OutboundUrlBlockedError("Outbound URL must not contain credentials.");
  }

  if (!isEnforced(policy)) return url;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    blocked("localhost name", url);
  }
  if (net.isIP(hostname) !== 0 && isBlockedIp(hostname)) {
    blocked("private or internal IP literal", url);
  }
  return url;
}

// ---------------------------------------------------------------------------
// Connect-time enforcement
// ---------------------------------------------------------------------------

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, options.all ? [] : "", undefined);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    const rejected = list.length === 0 || list.some((entry) => isBlockedIp(entry.address));
    if (rejected) {
      const blockedError: NodeJS.ErrnoException = new Error(
        `${hostname} resolves to a blocked address`,
      );
      blockedError.code = BLOCKED_LOOKUP_CODE;
      callback(blockedError, options.all ? [] : "", undefined);
      return;
    }
    if (options.all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
}

let guardedDispatcher: Agent | null = null;

function getGuardedDispatcher(): Agent {
  guardedDispatcher ??= new Agent({ connect: { lookup: guardedLookup } });
  return guardedDispatcher;
}

function isUnreachableTargetError(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return cause?.code === BLOCKED_LOOKUP_CODE || cause?.code === "ENOTFOUND" || cause?.code === "EAI_AGAIN";
}

/**
 * fetch() for user- or IdP-supplied URLs. In production (or with
 * policy.alwaysEnforce) it refuses private-network targets, validating the
 * resolved address at connect time. It never follows redirects automatically,
 * so a public host cannot bounce the request to an internal one.
 */
export async function guardedFetch(
  input: string | URL,
  init: RequestInit = {},
  policy: OutboundPolicy = {},
): Promise<Response> {
  const url = assertOutboundUrlAllowed(input, policy);
  const requestInit: RequestInit & { dispatcher?: Agent } = { ...init, redirect: "manual" };
  if (isEnforced(policy)) {
    requestInit.dispatcher = getGuardedDispatcher();
  }

  try {
    return await fetch(input, requestInit);
  } catch (error) {
    if (isEnforced(policy) && isUnreachableTargetError(error)) {
      blocked((error as { cause?: Error }).cause?.message ?? "unresolvable", url);
    }
    throw error;
  }
}
