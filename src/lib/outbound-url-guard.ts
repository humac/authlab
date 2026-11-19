import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF protection for server-side requests whose target URL is supplied by a
 * user (issuer URLs) or by a remote party (discovery metadata endpoints).
 */

export class OutboundUrlBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundUrlBlockedError";
  }
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    return net.isIP(mapped) === 4 ? isBlockedIpv4(mapped) : true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8")) return true;
  return false;
}

/** True for loopback, private, link-local, CGNAT, documentation, multicast and malformed addresses. */
export function isBlockedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
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

export async function assertPublicOutboundUrl(input: string | URL): Promise<void> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new OutboundUrlBlockedError("Outbound URL is not a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OutboundUrlBlockedError("Only HTTP(S) outbound URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new OutboundUrlBlockedError("Outbound URL must not contain credentials.");
  }

  if (isPrivateOutboundAllowed()) return;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new OutboundUrlBlockedError(`Requests to ${url.host} are blocked (localhost).`);
  }

  if (net.isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new OutboundUrlBlockedError(
        `Requests to ${url.host} are blocked (private or internal address).`,
      );
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new OutboundUrlBlockedError(`Could not resolve hostname ${url.hostname}.`);
  }
  if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new OutboundUrlBlockedError(
      `Requests to ${url.host} are blocked (resolves to a private or internal address).`,
    );
  }
}

/**
 * fetch() that refuses private-network targets (in production) and never
 * follows redirects automatically, so a public host cannot bounce the request
 * to an internal one.
 */
export async function guardedFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  await assertPublicOutboundUrl(input);
  return fetch(input, { ...init, redirect: "manual" });
}
