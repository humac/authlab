import type { DecryptedAppInstance } from "@/types/app-instance";
import { OIDCHandler } from "./oidc-handler";
import { SAMLHandler } from "./saml-handler";

export interface AuthorizationResult {
  url: string;
  state: string;
  codeVerifier?: string;
}

export interface AuthResult {
  slug: string;
  protocol: "OIDC" | "SAML";
  claims: Record<string, unknown>;
  rawToken?: string;
  rawXml?: string;
  idToken?: string;
  accessToken?: string;
}

export interface AuthHandler {
  getAuthorizationUrl(callbackUrl: string): Promise<AuthorizationResult>;
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
