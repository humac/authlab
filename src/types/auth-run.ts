import type {
  AuthRunEventStatus,
  AuthRunEventType,
  AuthRunGrantType,
  Protocol,
} from "@/generated/prisma/client/enums";

export interface AuthRunEvent {
  id: string;
  authRunId: string;
  type: AuthRunEventType;
  status: AuthRunEventStatus;
  request: Record<string, unknown> | null;
  response: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: Date;
  createdAt: Date;
}

export interface AuthRun {
  id: string;
  appInstanceId: string;
  protocol: Protocol;
  grantType: AuthRunGrantType;
  status: "PENDING" | "AUTHENTICATED" | "LOGGED_OUT" | "FAILED";
  loginState: string | null;
  nonce: string | null;
  nonceStatus: string | null;
  runtimeOverrides: Record<string, string>;
  outboundAuthParams: Record<string, string>;
  claims: Record<string, unknown>;
  idToken: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  rawTokenResponse: string | null;
  rawSamlResponseXml: string | null;
  userinfo: Record<string, unknown> | null;
  lastIntrospection: Record<string, unknown> | null;
  lastRevocationAt: Date | null;
  authenticatedAt: Date | null;
  completedAt: Date | null;
  logoutState: string | null;
  logoutCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAuthRunInput {
  appInstanceId: string;
  protocol: Protocol;
  grantType?: AuthRunGrantType;
  loginState?: string | null;
  nonce?: string | null;
  runtimeOverrides?: Record<string, string>;
  outboundAuthParams?: Record<string, string>;
}

export interface CompleteAuthRunInput {
  claims?: Record<string, unknown>;
  idToken?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  rawTokenResponse?: string | null;
  rawSamlResponseXml?: string | null;
  userinfo?: Record<string, unknown> | null;
  lastIntrospection?: Record<string, unknown> | null;
  lastRevocationAt?: Date | null;
  authenticatedAt?: Date;
  status?: AuthRun["status"];
  nonceStatus?: string | null;
}

export interface CreateAuthRunEventInput {
  authRunId: string;
  type: AuthRunEventType;
  status?: AuthRunEventStatus;
  request?: Record<string, unknown> | null;
  response?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
}
