export interface SessionData {
  appSlug: string;
  protocol: "OIDC" | "SAML";
  claims: Record<string, unknown>;
  rawToken?: string;
  rawXml?: string;
  idToken?: string;
  accessToken?: string;
  authenticatedAt: string;
}
