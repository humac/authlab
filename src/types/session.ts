export interface SessionData {
  runId: string;
  appSlug: string;
  protocol: "OIDC" | "SAML";
  authenticatedAt: string;
}
