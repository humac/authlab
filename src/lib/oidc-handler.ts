import * as client from "openid-client";
import type { DecryptedAppInstance } from "@/types/app-instance";
import type { AuthHandler, AuthorizationResult, AuthResult } from "./auth-factory";

type OIDCIssuerComparisonCause = {
  body?: {
    issuer?: string;
  };
};

type OIDCIssuerComparisonError = {
  code?: string;
  cause?: OIDCIssuerComparisonCause;
};

export class OIDCHandler implements AuthHandler {
  private appInstance: DecryptedAppInstance;

  constructor(appInstance: DecryptedAppInstance) {
    this.appInstance = appInstance;
  }

  private getNormalizedIssuerUrl(): URL {
    const issuer = new URL(this.appInstance.issuerUrl!.trim());

    // Preserve explicit discovery document URLs as-is.
    if (issuer.pathname.includes("/.well-known/")) {
      return issuer;
    }

    // Avoid mismatches caused only by trailing slash differences.
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
      this.appInstance.clientSecret!,
    );

    if (issuerUrl.protocol === "http:") {
      client.allowInsecureRequests(config);
    }

    return config;
  }

  private async getOIDCConfiguration(): Promise<client.Configuration> {
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

  async getAuthorizationUrl(callbackUrl: string): Promise<AuthorizationResult> {
    const config = await this.getOIDCConfiguration();

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();

    const parameters: Record<string, string> = {
      redirect_uri: callbackUrl,
      scope: this.appInstance.scopes || "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    };

    const url = client.buildAuthorizationUrl(config, parameters);

    return { url: url.toString(), state, codeVerifier };
  }

  async handleCallback(
    currentUrl: URL,
    codeVerifier: string,
    expectedState: string,
  ): Promise<AuthResult> {
    const config = await this.getOIDCConfiguration();

    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });

    const claims = tokens.claims();
    const idToken = currentUrl.searchParams.get("id_token") || undefined;

    // Try to get the raw JWT from the token response
    let rawToken: string | undefined;
    if (tokens.access_token) {
      rawToken = tokens.access_token;
    }

    return {
      slug: this.appInstance.slug,
      protocol: "OIDC",
      claims: claims ? { ...claims } : {},
      rawToken,
      idToken: idToken,
      accessToken: tokens.access_token,
    };
  }
}
