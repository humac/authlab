import type { DecryptedAppInstance } from "@/types/app-instance";
import { OIDCHandler } from "./oidc-handler";
import { SAMLHandler } from "./saml-handler";

export interface AuthorizationResult {
  url: string;
  state: string;
  codeVerifier?: string | null;
  nonce?: string;
  outboundParams?: Record<string, string>;
  traceRequest?: Record<string, unknown>;
  traceResponse?: string | null;
  traceMetadata?: Record<string, unknown> | null;
}

export interface AuthResult {
  slug: string;
  protocol: "OIDC" | "SAML";
  claims: Record<string, unknown>;
  rawTokenResponse?: string;
  rawXml?: string;
  idToken?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  grantType?:
    | "AUTHORIZATION_CODE"
    | "CLIENT_CREDENTIALS"
    | "DEVICE_AUTHORIZATION"
    | "TOKEN_EXCHANGE";
  nonceStatus?: string | null;
}

export interface AuthRequestOptions {
  runtimeOverrides?: Record<string, string>;
}

export interface AuthHandler {
  getAuthorizationUrl(
    callbackUrl: string,
    options?: AuthRequestOptions,
  ): Promise<AuthorizationResult>;
}

export function createAuthHandler(
  appInstance: DecryptedAppInstance,
): AuthHandler {
  switch (appInstance.protocol) {
    case "OIDC":
      return new OIDCHandler(appInstance);
    case "SAML":
      return new SAMLHandler(appInstance);
    default:
      throw new Error(`Unsupported protocol: ${appInstance.protocol}`);
  }
}
