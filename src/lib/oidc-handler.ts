import * as client from "openid-client";
import { decodeJwt } from "jose";
import type { DecryptedAppInstance } from "@/types/app-instance";
import type {
  AuthHandler,
  AuthorizationResult,
  AuthRequestOptions,
  AuthResult,
} from "./auth-factory";

type OIDCIssuerComparisonCause = {
  body?: {
    issuer?: string;
  };
};

type OIDCIssuerComparisonError = {
  code?: string;
  cause?: OIDCIssuerComparisonCause;
};

const RESERVED_AUTH_PARAMS = new Set([
  "client_id",
  "response_type",
  "redirect_uri",
  "scope",
  "state",
  "nonce",
  "code_challenge",
  "code_challenge_method",
]);

function normalizeParams(
  entries: Iterable<[string, string]>,
): Record<string, string> {
  return Object.fromEntries(
    Array.from(entries).filter(([key, value]) => key.trim() && value !== undefined),
  );
}

function filterReservedParams(
  entries: Iterable<[string, string]>,
): Array<[string, string]> {
  return Array.from(entries).filter(([key]) => !RESERVED_AUTH_PARAMS.has(key));
}

type TokenResponseLike = client.TokenEndpointResponseHelpers &
  Record<string, unknown>;

export interface DeviceAuthorizationPayload {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresIn: number;
  interval: number | null;
  rawResponse: string;
}

export interface DeviceAuthorizationPollResult {
  status: "authorized" | "pending" | "slow_down";
  result?: AuthResult;
  error?: string;
  interval?: number | null;
  rawResponse?: string;
}

export interface TokenExchangeInput {
  subjectToken: string;
  subjectTokenType:
    | "urn:ietf:params:oauth:token-type:access_token"
    | "urn:ietf:params:oauth:token-type:id_token";
  requestedTokenType?:
    | "urn:ietf:params:oauth:token-type:access_token"
    | "urn:ietf:params:oauth:token-type:refresh_token"
    | "urn:ietf:params:oauth:token-type:id_token";
  audience?: string;
  scope?: string;
}

type ParRequestTrace = {
  method: "POST";
  endpoint: string;
  protocol: "OIDC";
  body: Record<string, string>;
  clientAuthentication: "client_secret_post" | "public";
};

function buildTokenResponsePayload(tokenLike: TokenResponseLike): {
  rawTokenResponse: string;
  idToken: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
} {
  const idToken =
    typeof tokenLike.id_token === "string" ? tokenLike.id_token : null;
  const accessToken =
    typeof tokenLike.access_token === "string" ? tokenLike.access_token : null;
  const refreshToken =
    typeof tokenLike.refresh_token === "string" ? tokenLike.refresh_token : null;
  const expiresIn =
    typeof tokenLike.expires_in === "number" ? tokenLike.expires_in : null;

  const rawTokenResponse = JSON.stringify(
    Object.fromEntries(
      Object.entries({
        access_token: accessToken,
        id_token: idToken,
        token_type:
          typeof tokenLike.token_type === "string" ? tokenLike.token_type : null,
        scope: typeof tokenLike.scope === "string" ? tokenLike.scope : null,
        expires_in: expiresIn,
        refresh_token: refreshToken,
      }).filter(([, value]) => value !== null),
    ),
    null,
    2,
  );

  return {
    rawTokenResponse,
    idToken,
    accessToken,
    refreshToken,
    expiresIn,
  };
}

function getClaimsFromIdToken(idToken: string | null): Record<string, unknown> {
  if (!idToken) {
    return {};
  }

  try {
    return decodeJwt(idToken) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class OIDCHandler implements AuthHandler {
  private appInstance: DecryptedAppInstance;

  constructor(appInstance: DecryptedAppInstance) {
    this.appInstance = appInstance;
  }

  private getNormalizedIssuerUrl(): URL {
    const issuer = new URL(this.appInstance.issuerUrl!.trim());

    if (issuer.pathname.includes("/.well-known/")) {
      return issuer;
    }

    const normalizedPath = issuer.pathname.replace(/\/+$/, "");
    issuer.pathname = normalizedPath === "" ? "/" : normalizedPath;

    return issuer;
  }

  private isIssuerComparisonError(
    error: unknown,
  ): error is OIDCIssuerComparisonError {
    if (!error || typeof error !== "object") {
      return false;
    }

    return (
      "code" in error &&
      (error as OIDCIssuerComparisonError).code ===
        "OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED"
    );
  }

  private getDiscoveredIssuerUrl(error: OIDCIssuerComparisonError): URL | null {
    const discoveredIssuer = error.cause?.body?.issuer;

    if (!discoveredIssuer) {
      return null;
    }

    try {
      return new URL(discoveredIssuer);
    } catch {
      return null;
    }
  }

  private async runDiscovery(issuerUrl: URL): Promise<client.Configuration> {
    const config = await client.discovery(
      issuerUrl,
      this.appInstance.clientId!,
      undefined,
      client.ClientSecretPost(this.appInstance.clientSecret || undefined),
    );

    if (issuerUrl.protocol === "http:") {
      client.allowInsecureRequests(config);
    }

    return config;
  }

  async getOIDCConfiguration(): Promise<client.Configuration> {
    const issuerUrl = this.getNormalizedIssuerUrl();

    try {
      return await this.runDiscovery(issuerUrl);
    } catch (error) {
      if (!this.isIssuerComparisonError(error)) {
        throw error;
      }

      const discoveredIssuerUrl = this.getDiscoveredIssuerUrl(error);
      if (
        discoveredIssuerUrl &&
        discoveredIssuerUrl.origin === issuerUrl.origin &&
        discoveredIssuerUrl.href !== issuerUrl.href
      ) {
        return this.runDiscovery(discoveredIssuerUrl);
      }

      throw new Error(
        `OIDC issuer mismatch: configured issuer "${issuerUrl.href}" does not match provider metadata issuer "${discoveredIssuerUrl?.href ?? "unknown"}". Update the app's Issuer URL to the exact issuer value from the provider metadata.`,
      );
    }
  }

  async getDiscoveryMetadata(): Promise<Record<string, unknown>> {
    const config = await this.getOIDCConfiguration();
    return { ...config.serverMetadata() };
  }

  private getSavedCustomParams(): Record<string, string> {
    return normalizeParams(
      filterReservedParams(
        this.appInstance.customAuthParams.map((entry) => [entry.key, entry.value]),
      ),
    );
  }

  private getRuntimeParams(
    overrides: Record<string, string> | undefined,
  ): Record<string, string> {
    if (!overrides) {
      return {};
    }

    return normalizeParams(
      filterReservedParams(Object.entries(overrides)),
    );
  }

  private async pushAuthorizationRequest(
    config: client.Configuration,
    parameters: Record<string, string>,
  ): Promise<{
    requestUri: string;
    expiresIn: number | null;
    traceRequest: ParRequestTrace;
    traceResponse: string;
  }> {
    const metadata = config.serverMetadata();
    if (!metadata.pushed_authorization_request_endpoint) {
      throw new Error(
        "Pushed Authorization Requests are enabled for this app, but the provider discovery metadata does not advertise a pushed authorization request endpoint.",
      );
    }

    const response = await fetch(metadata.pushed_authorization_request_endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: this.buildClientAuthenticatedFormBody(parameters),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(
        typeof payload.error_description === "string"
          ? payload.error_description
          : typeof payload.error === "string"
            ? payload.error
            : "Pushed authorization request failed",
      );
    }

    const requestUri =
      typeof payload.request_uri === "string" ? payload.request_uri : null;
    if (!requestUri) {
      throw new Error("Provider PAR response did not include a request_uri.");
    }

    return {
      requestUri,
      expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
      traceRequest: {
        method: "POST",
        endpoint: metadata.pushed_authorization_request_endpoint,
        protocol: "OIDC",
        body: {
          ...parameters,
          client_id: this.appInstance.clientId!,
        },
        clientAuthentication: this.appInstance.clientSecret
          ? "client_secret_post"
          : "public",
      },
      traceResponse: JSON.stringify(payload, null, 2),
    };
  }

  async getAuthorizationUrl(
    callbackUrl: string,
    options?: AuthRequestOptions,
  ): Promise<AuthorizationResult> {
    const config = await this.getOIDCConfiguration();

    const state = client.randomState();
    const nonce = client.randomNonce();
    const savedParams = this.getSavedCustomParams();
    const runtimeParams = this.getRuntimeParams(options?.runtimeOverrides);
    const pkceMode = this.appInstance.pkceMode ?? "S256";

    let codeVerifier: string | null = null;
    let codeChallenge: string | null = null;
    if (pkceMode !== "NONE") {
      codeVerifier = client.randomPKCECodeVerifier();
      codeChallenge =
        pkceMode === "S256"
          ? await client.calculatePKCECodeChallenge(codeVerifier)
          : codeVerifier;
    }

    const parameters: Record<string, string> = {
      redirect_uri: callbackUrl,
      scope: this.appInstance.scopes || "openid profile email",
      state,
      nonce,
      ...savedParams,
      ...runtimeParams,
    };
    if (codeChallenge) {
      parameters.code_challenge = codeChallenge;
      parameters.code_challenge_method = pkceMode;
    }

    let url: URL;
    let traceRequest: AuthorizationResult["traceRequest"];
    let traceResponse: string | null = null;
    let traceMetadata: Record<string, unknown> | null = null;

    if (this.appInstance.usePar) {
      const parResult = await this.pushAuthorizationRequest(config, parameters);
      url = client.buildAuthorizationUrl(config, {
        client_id: this.appInstance.clientId!,
        request_uri: parResult.requestUri,
      });
      traceRequest = parResult.traceRequest;
      traceResponse = parResult.traceResponse;
      traceMetadata = {
        parUsed: true,
        requestUri: parResult.requestUri,
        ...(parResult.expiresIn !== null ? { expiresIn: parResult.expiresIn } : {}),
        authorizationRedirectUrl: url.toString(),
      };
    } else {
      url = client.buildAuthorizationUrl(config, parameters);
    }

    return {
      url: url.toString(),
      state,
      nonce,
      codeVerifier,
      outboundParams: normalizeParams(url.searchParams.entries()),
      traceRequest,
      traceResponse,
      traceMetadata,
    };
  }

  async handleCallback(
    currentUrl: URL,
    codeVerifier: string | null,
    expectedState: string,
    expectedNonce?: string,
  ): Promise<AuthResult> {
    const config = await this.getOIDCConfiguration();

    const tokens = await client.authorizationCodeGrant(
      config,
      currentUrl,
      {
        ...(codeVerifier ? { pkceCodeVerifier: codeVerifier } : {}),
        expectedState,
        expectedNonce,
      },
    );

    const claims = tokens.claims();
    const tokenLike = tokens as TokenResponseLike;
    const parsed = buildTokenResponsePayload(tokenLike);

    return {
      slug: this.appInstance.slug,
      protocol: "OIDC",
      claims: claims ? { ...claims } : {},
      rawTokenResponse: parsed.rawTokenResponse,
      idToken: parsed.idToken,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      accessTokenExpiresAt: parsed.expiresIn
        ? new Date(Date.now() + parsed.expiresIn * 1000)
        : null,
      grantType: "AUTHORIZATION_CODE",
      nonceStatus: expectedNonce ? "valid" : null,
    };
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<AuthResult> {
    const config = await this.getOIDCConfiguration();
    const tokens = await client.refreshTokenGrant(config, refreshToken);
    const claims = tokens.claims();
    const parsed = buildTokenResponsePayload(tokens as TokenResponseLike);

    return {
      slug: this.appInstance.slug,
      protocol: "OIDC",
      claims: claims ? { ...claims } : {},
      rawTokenResponse: parsed.rawTokenResponse,
      idToken: parsed.idToken,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken || refreshToken,
      accessTokenExpiresAt: parsed.expiresIn
        ? new Date(Date.now() + parsed.expiresIn * 1000)
        : null,
      grantType: "AUTHORIZATION_CODE",
    };
  }

  async introspectToken(
    token: string,
    tokenTypeHint?: "access_token" | "refresh_token",
  ): Promise<Record<string, unknown>> {
    const config = await this.getOIDCConfiguration();
    const response = await client.tokenIntrospection(
      config,
      token,
      tokenTypeHint ? { token_type_hint: tokenTypeHint } : undefined,
    );
    return { ...response };
  }

  async revokeToken(
    token: string,
    tokenTypeHint?: "access_token" | "refresh_token",
  ): Promise<void> {
    const config = await this.getOIDCConfiguration();
    await client.tokenRevocation(
      config,
      token,
      tokenTypeHint ? { token_type_hint: tokenTypeHint } : undefined,
    );
  }

  async exchangeClientCredentials(
    scopes?: string,
  ): Promise<AuthResult> {
    const config = await this.getOIDCConfiguration();
    const parameters =
      scopes && scopes.trim().length > 0 ? { scope: scopes.trim() } : undefined;
    const tokens = await client.clientCredentialsGrant(config, parameters);
    const parsed = buildTokenResponsePayload(tokens as TokenResponseLike);

    return {
      slug: this.appInstance.slug,
      protocol: "OIDC",
      claims: {},
      rawTokenResponse: parsed.rawTokenResponse,
      idToken: parsed.idToken,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      accessTokenExpiresAt: parsed.expiresIn
        ? new Date(Date.now() + parsed.expiresIn * 1000)
        : null,
      grantType: "CLIENT_CREDENTIALS",
    };
  }

  async exchangeToken(input: TokenExchangeInput): Promise<AuthResult> {
    const config = await this.getOIDCConfiguration();
    const metadata = config.serverMetadata();

    if (!metadata.token_endpoint) {
      throw new Error("Provider discovery metadata does not advertise a token endpoint.");
    }

    const response = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: this.buildClientAuthenticatedFormBody({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: input.subjectToken,
        subject_token_type: input.subjectTokenType,
        ...(input.requestedTokenType
          ? { requested_token_type: input.requestedTokenType }
          : {}),
        ...(input.audience && input.audience.trim().length > 0
          ? { audience: input.audience.trim() }
          : {}),
        ...(input.scope && input.scope.trim().length > 0
          ? { scope: input.scope.trim() }
          : {}),
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(
        typeof payload.error_description === "string"
          ? payload.error_description
          : typeof payload.error === "string"
            ? payload.error
            : "Token exchange failed",
      );
    }

    const parsed = buildTokenResponsePayload(payload as TokenResponseLike);

    return {
      slug: this.appInstance.slug,
      protocol: "OIDC",
      claims: getClaimsFromIdToken(parsed.idToken),
      rawTokenResponse: parsed.rawTokenResponse,
      idToken: parsed.idToken,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      accessTokenExpiresAt: parsed.expiresIn
        ? new Date(Date.now() + parsed.expiresIn * 1000)
        : null,
      grantType: "TOKEN_EXCHANGE",
    };
  }

  async initiateDeviceAuthorization(
    scopes?: string,
  ): Promise<DeviceAuthorizationPayload> {
    const config = await this.getOIDCConfiguration();
    const metadata = config.serverMetadata();

    if (!metadata.device_authorization_endpoint) {
      throw new Error(
        "Provider discovery metadata does not advertise a device authorization endpoint.",
      );
    }

    const response = await fetch(metadata.device_authorization_endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: this.buildClientAuthenticatedFormBody({
        ...(scopes && scopes.trim().length > 0 ? { scope: scopes.trim() } : {}),
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(
        typeof payload.error_description === "string"
          ? payload.error_description
          : typeof payload.error === "string"
            ? payload.error
            : "Device authorization request failed",
      );
    }

    const deviceCode =
      typeof payload.device_code === "string" ? payload.device_code : null;
    const userCode = typeof payload.user_code === "string" ? payload.user_code : null;
    const verificationUri =
      typeof payload.verification_uri === "string" ? payload.verification_uri : null;
    const expiresIn =
      typeof payload.expires_in === "number" ? payload.expires_in : null;

    if (!deviceCode || !userCode || !verificationUri || !expiresIn) {
      throw new Error(
        "The provider returned an incomplete device authorization response.",
      );
    }

    return {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete:
        typeof payload.verification_uri_complete === "string"
          ? payload.verification_uri_complete
          : null,
      expiresIn,
      interval: typeof payload.interval === "number" ? payload.interval : null,
      rawResponse: JSON.stringify(payload, null, 2),
    };
  }

  async pollDeviceAuthorization(
    deviceAuthorization: {
      deviceCode: string;
      expiresIn: number;
      interval?: number | null;
    },
  ): Promise<DeviceAuthorizationPollResult> {
    const config = await this.getOIDCConfiguration();
    const metadata = config.serverMetadata();

    if (!metadata.token_endpoint) {
      throw new Error("Provider discovery metadata does not advertise a token endpoint.");
    }

    const response = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: this.buildClientAuthenticatedFormBody({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceAuthorization.deviceCode,
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const errorCode =
        typeof payload.error === "string" ? payload.error : "device_flow_failed";
      const errorDescription =
        typeof payload.error_description === "string"
          ? payload.error_description
          : errorCode;

      if (errorCode === "authorization_pending") {
        return {
          status: "pending",
          error: errorDescription,
          interval: deviceAuthorization.interval ?? null,
          rawResponse: JSON.stringify(payload, null, 2),
        };
      }
      if (errorCode === "slow_down") {
        return {
          status: "slow_down",
          error: errorDescription,
          interval:
            typeof payload.interval === "number"
              ? payload.interval
              : (deviceAuthorization.interval ?? 5) + 5,
          rawResponse: JSON.stringify(payload, null, 2),
        };
      }

      throw new Error(errorDescription);
    }

    const parsed = buildTokenResponsePayload(payload as TokenResponseLike);
    return {
      status: "authorized",
      result: {
        slug: this.appInstance.slug,
        protocol: "OIDC",
        claims: getClaimsFromIdToken(parsed.idToken),
        rawTokenResponse: parsed.rawTokenResponse,
        idToken: parsed.idToken,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        accessTokenExpiresAt: parsed.expiresIn
          ? new Date(Date.now() + parsed.expiresIn * 1000)
          : null,
        grantType: "DEVICE_AUTHORIZATION",
      },
      rawResponse: parsed.rawTokenResponse,
    };
  }

  async fetchUserInfo(
    accessToken: string,
    expectedSubject?: string,
  ): Promise<Record<string, unknown>> {
    const config = await this.getOIDCConfiguration();
    const userinfo = await client.fetchUserInfo(
      config,
      accessToken,
      expectedSubject ?? client.skipSubjectCheck,
    );
    return { ...userinfo };
  }

  async buildLogoutUrl(
    idToken: string,
    postLogoutRedirectUri: string,
    logoutState: string,
  ): Promise<string | null> {
    const config = await this.getOIDCConfiguration();
    const metadata = config.serverMetadata();
    if (!metadata.end_session_endpoint) {
      return null;
    }

    return client
      .buildEndSessionUrl(config, {
        id_token_hint: idToken,
        post_logout_redirect_uri: postLogoutRedirectUri,
        state: logoutState,
      })
      .toString();
  }

  private buildClientAuthenticatedFormBody(
    parameters: Record<string, string>,
  ): URLSearchParams {
    const body = new URLSearchParams(parameters);
    body.set("client_id", this.appInstance.clientId!);
    if (this.appInstance.clientSecret) {
      body.set("client_secret", this.appInstance.clientSecret);
    }
    return body;
  }
}
