import type { Protocol } from "@/generated/prisma/client/enums";

export interface AppInstanceInput {
  name: string;
  slug: string;
  protocol: Protocol;
  // OIDC
  issuerUrl?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  scopes?: string | null;
  // SAML
  entryPoint?: string | null;
  issuer?: string | null;
  idpCert?: string | null;
  // UI
  buttonColor?: string | null;
}

export interface AppInstanceRecord {
  id: string;
  name: string;
  slug: string;
  protocol: Protocol;
  issuerUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  scopes: string | null;
  entryPoint: string | null;
  issuer: string | null;
  idpCert: string | null;
  buttonColor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedAppInstance extends Omit<AppInstanceRecord, "clientSecret" | "idpCert"> {
  clientSecret: string | null;
  idpCert: string | null;
}

export interface RedactedAppInstance extends Omit<AppInstanceRecord, "clientSecret" | "idpCert"> {
  hasClientSecret: boolean;
  hasIdpCert: boolean;
}
