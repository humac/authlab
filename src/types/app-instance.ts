import type {
  PkceMode,
  Protocol,
  SamlSignatureAlgorithm,
} from "@/generated/prisma/client/enums";

export interface KeyValueParam {
  key: string;
  value: string;
}

export interface AppCredential {
  label: string;
  username: string;
  password: string;
  url?: string | null;
  note?: string | null;
}

export interface AppNotes {
  markdown: string;
  credentials: AppCredential[];
  updatedAt: string;
  updatedBy: string;
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
  tags?: string[];
  // Notes
  notes?: AppNotes | null;
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
  tags: string | null;
  notesEnc: string | null;
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
    | "tags"
    | "notesEnc"
  > {
  clientSecret: string | null;
  idpCert: string | null;
  spSigningPrivateKey: string | null;
  spEncryptionPrivateKey: string | null;
  customAuthParams: KeyValueParam[];
  tags: string[];
  notes: AppNotes | null;
}

export interface RedactedAppInstance
  extends Omit<
    AppInstanceRecord,
    | "clientSecret"
    | "idpCert"
    | "spSigningPrivateKey"
    | "spEncryptionPrivateKey"
    | "customAuthParamsJson"
    | "tags"
    | "notesEnc"
  > {
  hasClientSecret: boolean;
  hasIdpCert: boolean;
  hasSpSigningPrivateKey: boolean;
  hasSpSigningCert: boolean;
  hasSpEncryptionPrivateKey: boolean;
  hasSpEncryptionCert: boolean;
  hasNotes: boolean;
  customAuthParams: KeyValueParam[];
  tags: string[];
}
