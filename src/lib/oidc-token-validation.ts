import {
  compactVerify,
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  type JSONWebKeySet,
} from "jose";

export type OidcValidationStatus = "valid" | "invalid" | "missing" | "unavailable";

export interface OidcValidationCheck {
  status: OidcValidationStatus;
  summary: string;
  detail: string;
  expected?: string | null;
  actual?: string | null;
}

export interface OidcSignatureValidation extends OidcValidationCheck {
  algorithm: string | null;
  keyId: string | null;
  jwksUri: string | null;
}

export interface OidcTokenValidationResult {
  signature: OidcSignatureValidation;
  atHash: OidcValidationCheck;
  cHash: OidcValidationCheck;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getHashAlgorithm(alg: string): AlgorithmIdentifier | null {
  if (alg.endsWith("256")) {
    return "SHA-256";
  }
  if (alg.endsWith("384")) {
    return "SHA-384";
  }
  if (alg.endsWith("512")) {
    return "SHA-512";
  }
  return null;
}

async function computeOidcHashValue(value: string, alg: string): Promise<string | null> {
  const hashAlgorithm = getHashAlgorithm(alg);
  if (!hashAlgorithm) {
    return null;
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest(hashAlgorithm, new TextEncoder().encode(value)),
  );
  return toBase64Url(digest.slice(0, digest.length / 2));
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

function getStringClaim(token: string, claim: "at_hash" | "c_hash"): string | null {
  try {
    const decoded = decodeJwt(token);
    return typeof decoded[claim] === "string" ? decoded[claim] : null;
  } catch {
    return null;
  }
}

function unavailableCheck(summary: string, detail: string): OidcValidationCheck {
  return { status: "unavailable", summary, detail };
}

function missingCheck(summary: string, detail: string): OidcValidationCheck {
  return { status: "missing", summary, detail };
}

function compareCheck(
  label: string,
  expected: string | null,
  actual: string | null,
  missingDetail: string,
  unavailableDetail: string,
): OidcValidationCheck {
  if (!actual) {
    return missingCheck(`${label} not present`, missingDetail);
  }
  if (!expected) {
    return unavailableCheck(`${label} unavailable`, unavailableDetail);
  }
  return actual === expected
    ? {
        status: "valid",
        summary: `${label} valid`,
        detail: "The claim matches the locally computed reference value.",
        expected,
        actual,
      }
    : {
        status: "invalid",
        summary: `${label} mismatch`,
        detail: "The claim does not match the locally computed reference value.",
        expected,
        actual,
      };
}

export async function computeExpectedOidcHashClaim(
  value: string,
  idToken: string,
): Promise<string | null> {
  try {
    const header = decodeProtectedHeader(idToken);
    if (typeof header.alg !== "string") {
      return null;
    }
    return computeOidcHashValue(value, header.alg);
  } catch {
    return null;
  }
}

export async function validateOidcTokenArtifacts(input: {
  idToken: string;
  accessToken?: string | null;
  jwksUri?: string | null;
  jwks?: JSONWebKeySet;
  expectedCHash?: string | null;
  grantType?: string | null;
}): Promise<OidcTokenValidationResult> {
  let alg: string | null = null;
  let kid: string | null = null;

  try {
    const header = decodeProtectedHeader(input.idToken);
    alg = typeof header.alg === "string" ? header.alg : null;
    kid = typeof header.kid === "string" ? header.kid : null;
  } catch {
    return {
      signature: {
        status: "invalid",
        summary: "Header parse failed",
        detail: "The ID token protected header could not be decoded.",
        algorithm: null,
        keyId: null,
        jwksUri: input.jwksUri ?? null,
      },
      atHash: unavailableCheck("at_hash unavailable", "ID token validation could not inspect token claims."),
      cHash: unavailableCheck("c_hash unavailable", "ID token validation could not inspect token claims."),
    };
  }

  let signature: OidcSignatureValidation;
  if (!input.jwks && !input.jwksUri) {
    signature = {
      status: "unavailable",
      summary: "JWKS unavailable",
      detail: "The provider discovery metadata does not advertise a JWKS URI.",
      algorithm: alg,
      keyId: kid,
      jwksUri: null,
    };
  } else {
    try {
      const jwks = input.jwks ?? (await fetchJwks(input.jwksUri!));
      await compactVerify(input.idToken, createLocalJWKSet(jwks));
      signature = {
        status: "valid",
        summary: "Signature valid",
        detail: "The ID token signature verified against the provider JWKS.",
        algorithm: alg,
        keyId: kid,
        jwksUri: input.jwksUri ?? null,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to verify the ID token signature.";
      const isFetchFailure =
        detail.toLowerCase().includes("jwks request failed") ||
        detail.toLowerCase().includes("fetch");
      signature = {
        status: isFetchFailure ? "unavailable" : "invalid",
        summary: isFetchFailure ? "JWKS fetch failed" : "Signature invalid",
        detail,
        algorithm: alg,
        keyId: kid,
        jwksUri: input.jwksUri ?? null,
      };
    }
  }

  const atHashClaim = getStringClaim(input.idToken, "at_hash");
  const cHashClaim = getStringClaim(input.idToken, "c_hash");
  const expectedAtHash =
    input.accessToken && alg ? await computeOidcHashValue(input.accessToken, alg) : null;

  const atHash = compareCheck(
    "at_hash",
    expectedAtHash,
    atHashClaim,
    input.accessToken
      ? "The ID token does not include an at_hash claim."
      : "No access token snapshot is available for at_hash comparison.",
    alg
      ? "The current session does not include an access token to compare against the ID token."
      : "The ID token signing algorithm is unavailable for at_hash comparison.",
  );

  const cHash = compareCheck(
    "c_hash",
    input.expectedCHash ?? null,
    cHashClaim,
    input.grantType === "AUTHORIZATION_CODE"
      ? "The ID token does not include a c_hash claim, which is typical for authorization code flow."
      : "The ID token does not include a c_hash claim.",
    "The original authorization-code reference was not retained for c_hash comparison.",
  );

  return {
    signature,
    atHash,
    cHash,
  };
}
