import type { PkceMode, Protocol } from "@/generated/prisma/client/enums";

export interface KeyValueParam {
  key: string;
  value: string;
}

export interface AppInstanceInput {
  name: string;
  slug: string;
  protocol: Protocol;
  teamId: string;
  // OIDC
  issuerUrl?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  scopes?: string | null;
  customAuthParams?: KeyValueParam[];
  pkceMode?: PkceMode;
  // SAML
  entryPoint?: string | null;
  issuer?: string | null;
  idpCert?: string | null;
  nameIdFormat?: string | null;
  forceAuthnDefault?: boolean;
  isPassiveDefault?: boolean;
  signAuthnRequests?: boolean;
  spSigningPrivateKey?: string | null;
  spSigningCert?: string | null;
  // UI
  buttonColor?: string | null;
}

export interface AppInstanceRecord {
  id: string;
  name: string;
  slug: string;
  protocol: Protocol;
  teamId: string;
  issuerUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  scopes: string | null;
  customAuthParamsJson: string | null;
  pkceMode: PkceMode;
  entryPoint: string | null;
  issuer: string | null;
  idpCert: string | null;
  nameIdFormat: string | null;
  forceAuthnDefault: boolean;
  isPassiveDefault: boolean;
  signAuthnRequests: boolean;
  spSigningPrivateKey: string | null;
  spSigningCert: string | null;
  buttonColor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedAppInstance
  extends Omit<
    AppInstanceRecord,
    "clientSecret" | "idpCert" | "spSigningPrivateKey" | "customAuthParamsJson"
  > {
  clientSecret: string | null;
  idpCert: string | null;
  spSigningPrivateKey: string | null;
  customAuthParams: KeyValueParam[];
}

export interface RedactedAppInstance
  extends Omit<
    AppInstanceRecord,
    "clientSecret" | "idpCert" | "spSigningPrivateKey" | "customAuthParamsJson"
  > {
  hasClientSecret: boolean;
  hasIdpCert: boolean;
  hasSpSigningPrivateKey: boolean;
  hasSpSigningCert: boolean;
  customAuthParams: KeyValueParam[];
}
