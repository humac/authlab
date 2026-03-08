import * as client from "openid-client";
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

    const url = client.buildAuthorizationUrl(config, parameters);

    return {
      url: url.toString(),
      state,
      nonce,
      codeVerifier,
      outboundParams: normalizeParams(url.searchParams.entries()),
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
}
