import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { buildAuthTraceEntries, decodeSamlRedirectRequest } from "@/lib/auth-trace";
import type { AuthRun, AuthRunEvent } from "@/types/auth-run";

function buildRun(overrides: Partial<AuthRun>): AuthRun {
  const now = new Date("2026-03-08T15:00:00.000Z");
  return {
    id: "run-1",
    appInstanceId: "app-1",
    protocol: "OIDC",
    grantType: "AUTHORIZATION_CODE",
    status: "AUTHENTICATED",
    loginState: "state-1",
    nonce: "nonce-1",
    nonceStatus: "valid",
    oidcSubject: "user-1",
    oidcSessionId: "sid-1",
    runtimeOverrides: {},
    outboundAuthParams: {},
    claims: {},
    idToken: null,
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
    rawTokenResponse: null,
    rawSamlResponseXml: null,
    userinfo: null,
    lastIntrospection: null,
    lastRevocationAt: null,
    authenticatedAt: now,
    completedAt: null,
    logoutState: null,
    logoutCompletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildEvent(overrides: Partial<AuthRunEvent>): AuthRunEvent {
  const occurredAt = new Date("2026-03-08T15:05:00.000Z");
  return {
    id: "event-1",
    authRunId: "run-1",
    type: "AUTHENTICATED",
    status: "SUCCESS",
    request: null,
    response: null,
    metadata: null,
    occurredAt,
    createdAt: occurredAt,
    ...overrides,
  };
}

describe("decodeSamlRedirectRequest", () => {
  it("inflates a deflated redirect payload", () => {
    const input = deflateRawSync(
      Buffer.from(
        `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_request123" />`,
        "utf-8",
      ),
    ).toString("base64");
    const output = decodeSamlRedirectRequest(input);

    assert.match(output ?? "", /<samlp:AuthnRequest/);
  });
});

describe("buildAuthTraceEntries", () => {
  it("creates a synthetic OIDC authorization trace when launch events are missing", () => {
    const run = buildRun({
      outboundAuthParams: {
        client_id: "client-123",
        state: "state-1",
        nonce: "nonce-1",
      },
    });

    const entries = buildAuthTraceEntries({
      run,
      events: [],
      oidcAuthorizationEndpoint: "https://issuer.example.com/oauth2/v1/authorize",
    });

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.title, "Authorization request");
    assert.equal(entries[0]?.status, "INFO");
    assert.match(entries[0]?.sections[1]?.data ?? "", /client_id/);
  });

  it("keeps explicit launch and callback events for SAML runs", () => {
    const run = buildRun({
      protocol: "SAML",
      claims: { NameID: "user@example.com" },
      rawSamlResponseXml: "<samlp:Response />",
    });

    const entries = buildAuthTraceEntries({
      run,
      events: [
        buildEvent({
          id: "event-start",
          type: "AUTHORIZATION_STARTED",
          request: {
            method: "GET",
            endpoint: "https://idp.example.com/sso",
          },
          response: "<samlp:AuthnRequest />",
          occurredAt: new Date("2026-03-08T15:00:00.000Z"),
          createdAt: new Date("2026-03-08T15:00:00.000Z"),
        }),
        buildEvent({
          id: "event-auth",
          type: "AUTHENTICATED",
          request: {
            method: "POST",
            endpoint: "https://authlab.example.com/api/auth/callback/saml/sample",
          },
          response: "<samlp:Response />",
          occurredAt: new Date("2026-03-08T15:05:00.000Z"),
          createdAt: new Date("2026-03-08T15:05:00.000Z"),
        }),
      ],
      samlEntryPoint: "https://idp.example.com/sso",
    });

    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.title, "AuthnRequest redirect");
    assert.equal(entries[1]?.title, "Assertion callback");
    assert.equal(entries[1]?.sections[1]?.format, "xml");
  });
});
