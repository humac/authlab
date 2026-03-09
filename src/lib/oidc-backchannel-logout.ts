import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from "jose";
import type { DecryptedAppInstance } from "@/types/app-instance";
import { OIDCHandler } from "@/lib/oidc-handler";

const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout";

export interface OidcBackchannelLogoutPayload {
  issuer: string;
  subject: string | null;
  sessionId: string | null;
  audience: string[];
  jwtId: string | null;
  issuedAt: number | null;
  algorithm: string | null;
  keyId: string | null;
  claims: Record<string, unknown>;
}

async function fetchJwks(jwksUri: string): Promise<JSONWebKeySet> {
  const response = await fetch(jwksUri, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`JWKS request failed with status ${response.status}`);
  }
  return (await response.json()) as JSONWebKeySet;
}

function normalizeAudience(value: JWTPayload["aud"]): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function toClaimsRecord(payload: JWTPayload): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, value ?? null]),
  );
}

function assertBackchannelLogoutPayload(payload: JWTPayload): void {
  const claims = payload as JWTPayload & Record<string, unknown>;
  const events = claims.events;
  const hasValidEvent =
    !!events &&
    typeof events === "object" &&
    !Array.isArray(events) &&
    BACKCHANNEL_LOGOUT_EVENT in events;

  if (!hasValidEvent) {
    throw new Error("The logout token is missing the back-channel logout event.");
  }

  if (claims.nonce !== undefined) {
    throw new Error("The logout token must not include a nonce claim.");
  }

  const hasSubject = typeof payload.sub === "string" && payload.sub.length > 0;
  const hasSessionId = typeof claims.sid === "string" && claims.sid.length > 0;
  if (!hasSubject && !hasSessionId) {
    throw new Error("The logout token must include a subject or session identifier.");
  }
}

export async function validateOidcBackchannelLogoutToken(
  app: DecryptedAppInstance,
  logoutToken: string,
): Promise<OidcBackchannelLogoutPayload> {
  if (!app.clientId) {
    throw new Error("OIDC client ID is not configured for this app.");
  }

  const handler = new OIDCHandler(app);
  const config = await handler.getOIDCConfiguration();
  const metadata = config.serverMetadata();

  if (!metadata.issuer) {
    throw new Error("Provider discovery metadata is missing an issuer.");
  }
  if (!metadata.jwks_uri) {
    throw new Error("Provider discovery metadata is missing a JWKS URI.");
  }

  const header = decodeProtectedHeader(logoutToken);
  const jwks = await fetchJwks(metadata.jwks_uri);
  const verification = await jwtVerify(
    logoutToken,
    createLocalJWKSet(jwks),
    {
      issuer: metadata.issuer,
      audience: app.clientId,
    },
  );

  assertBackchannelLogoutPayload(verification.payload);
  const claims = verification.payload as JWTPayload & Record<string, unknown>;

  return {
    issuer: metadata.issuer,
    subject: typeof claims.sub === "string" ? claims.sub : null,
    sessionId: typeof claims.sid === "string" ? claims.sid : null,
    audience: normalizeAudience(verification.payload.aud),
    jwtId: typeof claims.jti === "string" ? claims.jti : null,
    issuedAt: typeof claims.iat === "number" ? claims.iat : null,
    algorithm: typeof header.alg === "string" ? header.alg : null,
    keyId: typeof header.kid === "string" ? header.kid : null,
    claims: toClaimsRecord(claims),
  };
}
