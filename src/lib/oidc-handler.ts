import * as client from "openid-client";
import type { DecryptedAppInstance } from "@/types/app-instance";
import type { AuthHandler, AuthorizationResult, AuthResult } from "./auth-factory";

export class OIDCHandler implements AuthHandler {
  private appInstance: DecryptedAppInstance;

  constructor(appInstance: DecryptedAppInstance) {
    this.appInstance = appInstance;
  }

  async getAuthorizationUrl(callbackUrl: string): Promise<AuthorizationResult> {
    const config = await client.discovery(
      new URL(this.appInstance.issuerUrl!),
      this.appInstance.clientId!,
      this.appInstance.clientSecret!,
    );

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

    // Allow HTTP for localhost development
    if (this.appInstance.issuerUrl!.startsWith("http://")) {
      client.allowInsecureRequests(config);
    }

    const url = client.buildAuthorizationUrl(config, parameters);

    return { url: url.toString(), state, codeVerifier };
  }

  async handleCallback(
    currentUrl: URL,
    codeVerifier: string,
    expectedState: string,
  ): Promise<AuthResult> {
    const config = await client.discovery(
      new URL(this.appInstance.issuerUrl!),
      this.appInstance.clientId!,
      this.appInstance.clientSecret!,
    );

    if (this.appInstance.issuerUrl!.startsWith("http://")) {
      client.allowInsecureRequests(config);
    }

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
