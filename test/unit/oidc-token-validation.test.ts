import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  computeExpectedOidcHashClaim,
  validateOidcTokenArtifacts,
} from "../../src/lib/oidc-token-validation.ts";

async function computeReferenceHash(value: string, algorithm: AlgorithmIdentifier) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(algorithm, new TextEncoder().encode(value)),
  );
  return Buffer.from(digest.slice(0, digest.length / 2))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("OIDC token validation", () => {
  it("validates signature, at_hash, and c_hash against JWKS and session artifacts", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const accessToken = "access-token-123";
    const authorizationCode = "authorization-code-123";
    const atHash = await computeReferenceHash(accessToken, "SHA-256");
    const cHash = await computeReferenceHash(authorizationCode, "SHA-256");
    const idToken = await new SignJWT({
      sub: "user-123",
      at_hash: atHash,
      c_hash: cHash,
    })
      .setProtectedHeader({ alg: "RS256", kid: "kid-1" })
      .setIssuer("https://issuer.example.com")
      .setAudience("client-123")
      .setExpirationTime("2h")
      .setIssuedAt()
      .sign(privateKey);
    const publicJwk = await exportJWK(publicKey);

    const result = await validateOidcTokenArtifacts({
      idToken,
      accessToken,
      expectedCHash: cHash,
      jwks: { keys: [{ ...publicJwk, alg: "RS256", kid: "kid-1", use: "sig" }] },
      jwksUri: "https://issuer.example.com/jwks",
      grantType: "AUTHORIZATION_CODE",
    });

    assert.equal(result.signature.status, "valid");
    assert.equal(result.signature.algorithm, "RS256");
    assert.equal(result.signature.keyId, "kid-1");
    assert.equal(result.atHash.status, "valid");
    assert.equal(result.cHash.status, "valid");
    assert.equal(await computeExpectedOidcHashClaim(authorizationCode, idToken), cHash);
  });

  it("reports invalid and missing bound-hash claims clearly", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const idToken = await new SignJWT({
      sub: "user-123",
      at_hash: "bad-value",
    })
      .setProtectedHeader({ alg: "RS256", kid: "kid-2" })
      .setIssuer("https://issuer.example.com")
      .setAudience("client-123")
      .setExpirationTime("2h")
      .setIssuedAt()
      .sign(privateKey);
    const publicJwk = await exportJWK(publicKey);

    const result = await validateOidcTokenArtifacts({
      idToken,
      accessToken: "access-token-123",
      expectedCHash: null,
      jwks: { keys: [{ ...publicJwk, alg: "RS256", kid: "kid-2", use: "sig" }] },
      grantType: "AUTHORIZATION_CODE",
    });

    assert.equal(result.signature.status, "valid");
    assert.equal(result.atHash.status, "invalid");
    assert.equal(result.cHash.status, "missing");
    assert.match(result.cHash.detail, /authorization code flow/i);
  });
});
