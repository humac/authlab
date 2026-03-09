import type {
  PkceMode,
  Protocol,
  SamlSignatureAlgorithm,
} from "@/generated/prisma/client/enums";

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
  usePar?: boolean;
  // SAML
  entryPoint?: string | null;
  samlLogoutUrl?: string | null;
  issuer?: string | null;
  idpCert?: string | null;
  nameIdFormat?: string | null;
  requestedAuthnContext?: string | null;
  forceAuthnDefault?: boolean;
  isPassiveDefault?: boolean;
  samlSignatureAlgorithm?: SamlSignatureAlgorithm;
  clockSkewToleranceSeconds?: number;
  signAuthnRequests?: boolean;
  spSigningPrivateKey?: string | null;
  spSigningCert?: string | null;
  spEncryptionPrivateKey?: string | null;
  spEncryptionCert?: string | null;
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
  usePar: boolean;
  entryPoint: string | null;
  samlLogoutUrl: string | null;
  issuer: string | null;
  idpCert: string | null;
  nameIdFormat: string | null;
  requestedAuthnContext: string | null;
  forceAuthnDefault: boolean;
  isPassiveDefault: boolean;
  samlSignatureAlgorithm: SamlSignatureAlgorithm;
  clockSkewToleranceSeconds: number;
  signAuthnRequests: boolean;
  spSigningPrivateKey: string | null;
  spSigningCert: string | null;
  spEncryptionPrivateKey: string | null;
  spEncryptionCert: string | null;
  buttonColor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedAppInstance
  extends Omit<
    AppInstanceRecord,
    | "clientSecret"
    | "idpCert"
    | "spSigningPrivateKey"
    | "spEncryptionPrivateKey"
    | "customAuthParamsJson"
  > {
  clientSecret: string | null;
  idpCert: string | null;
  spSigningPrivateKey: string | null;
  spEncryptionPrivateKey: string | null;
  customAuthParams: KeyValueParam[];
}

export interface RedactedAppInstance
  extends Omit<
    AppInstanceRecord,
    | "clientSecret"
    | "idpCert"
    | "spSigningPrivateKey"
    | "spEncryptionPrivateKey"
    | "customAuthParamsJson"
  > {
  hasClientSecret: boolean;
  hasIdpCert: boolean;
  hasSpSigningPrivateKey: boolean;
  hasSpSigningCert: boolean;
  hasSpEncryptionPrivateKey: boolean;
  hasSpEncryptionCert: boolean;
  customAuthParams: KeyValueParam[];
}
