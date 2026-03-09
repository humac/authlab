import { decrypt, encrypt } from "@/lib/encryption";
import { getPrisma } from "@/lib/db";
import type {
  AuthRun,
  AuthRunEvent,
  CreateAuthRunEventInput,
  CompleteAuthRunInput,
  CreateAuthRunInput,
} from "@/types/auth-run";

type AuthRunRecord = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof getPrisma>>["authRun"]["findUnique"]>>
>;

type AuthRunEventRecord = NonNullable<
  Awaited<
    ReturnType<Awaited<ReturnType<typeof getPrisma>>["authRunEvent"]["findUnique"]>
  >
>;

function parseRecordJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeRun(record: AuthRunRecord): AuthRun {
  return {
    id: record.id,
    appInstanceId: record.appInstanceId,
    protocol: record.protocol,
    grantType: record.grantType,
    status: record.status,
    loginState: record.loginState,
    nonce: record.nonce,
    nonceStatus: record.nonceStatus,
    oidcSubject: record.oidcSubject,
    oidcSessionId: record.oidcSessionId,
    runtimeOverrides:
      parseRecordJson<Record<string, string>>(record.runtimeOverridesJson) ?? {},
    outboundAuthParams:
      parseRecordJson<Record<string, string>>(record.outboundAuthParamsJson) ?? {},
    claims: parseRecordJson<Record<string, unknown>>(record.claimsJson) ?? {},
    idToken: record.idToken,
    accessToken: record.accessTokenEnc ? decrypt(record.accessTokenEnc) : null,
    refreshToken: record.refreshTokenEnc ? decrypt(record.refreshTokenEnc) : null,
    accessTokenExpiresAt: record.accessTokenExpiresAt,
    rawTokenResponse: record.rawTokenResponseEnc
      ? decrypt(record.rawTokenResponseEnc)
      : null,
    rawSamlResponseXml: record.rawSamlResponseXml,
    userinfo: parseRecordJson<Record<string, unknown>>(record.userinfoJson),
    lastIntrospection: parseRecordJson<Record<string, unknown>>(
      record.lastIntrospectionJson,
    ),
    lastRevocationAt: record.lastRevocationAt,
    authenticatedAt: record.authenticatedAt,
    completedAt: record.completedAt,
    logoutState: record.logoutState,
    logoutCompletedAt: record.logoutCompletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeEvent(record: AuthRunEventRecord): AuthRunEvent {
  return {
    id: record.id,
    authRunId: record.authRunId,
    type: record.type,
    status: record.status,
    request: parseRecordJson<Record<string, unknown>>(record.requestJson),
    response: record.responseEnc ? decrypt(record.responseEnc) : null,
    metadata: parseRecordJson<Record<string, unknown>>(record.metadataJson),
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
  };
}

export async function createAuthRun(input: CreateAuthRunInput): Promise<AuthRun> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.create({
    data: {
      appInstanceId: input.appInstanceId,
      protocol: input.protocol,
      grantType: input.grantType ?? "AUTHORIZATION_CODE",
      loginState: input.loginState ?? null,
      nonce: input.nonce ?? null,
      oidcSubject: input.oidcSubject ?? null,
      oidcSessionId: input.oidcSessionId ?? null,
      runtimeOverridesJson: input.runtimeOverrides
        ? JSON.stringify(input.runtimeOverrides)
        : null,
      outboundAuthParamsJson: input.outboundAuthParams
        ? JSON.stringify(input.outboundAuthParams)
        : null,
    },
  });
  return normalizeRun(record);
}

export async function getAuthRunById(id: string): Promise<AuthRun | null> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.findUnique({ where: { id } });
  return record ? normalizeRun(record) : null;
}

export async function listAuthRunsForApp(
  appInstanceId: string,
  protocol: AuthRun["protocol"],
  limit = 12,
): Promise<AuthRun[]> {
  const prisma = await getPrisma();
  const records = await prisma.authRun.findMany({
    where: {
      appInstanceId,
      protocol,
      status: { not: "PENDING" },
    },
    orderBy: [{ authenticatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return records.map(normalizeRun);
}

export async function getAuthRunByLoginState(
  loginState: string,
): Promise<AuthRun | null> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.findUnique({ where: { loginState } });
  return record ? normalizeRun(record) : null;
}

export async function getAuthRunByLogoutState(
  logoutState: string,
): Promise<AuthRun | null> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.findUnique({ where: { logoutState } });
  return record ? normalizeRun(record) : null;
}

export async function listBackchannelLogoutCandidates(input: {
  appInstanceId: string;
  oidcSessionId?: string | null;
  oidcSubject?: string | null;
}): Promise<AuthRun[]> {
  const prisma = await getPrisma();
  const orFilters: Array<
    | {
        oidcSessionId: string;
      }
    | {
        oidcSubject: string;
      }
  > = [];

  if (input.oidcSessionId) {
    orFilters.push({ oidcSessionId: input.oidcSessionId });
  }
  if (input.oidcSubject) {
    orFilters.push({ oidcSubject: input.oidcSubject });
  }

  if (orFilters.length === 0) {
    return [];
  }

  const records = await prisma.authRun.findMany({
    where: {
      appInstanceId: input.appInstanceId,
      protocol: "OIDC",
      status: "AUTHENTICATED",
      OR: orFilters,
    },
    orderBy: [{ authenticatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (input.oidcSessionId) {
    const exactSessionMatches = records.filter(
      (record) => record.oidcSessionId === input.oidcSessionId,
    );
    if (exactSessionMatches.length > 0) {
      return exactSessionMatches.map(normalizeRun);
    }
  }

  return records.map(normalizeRun);
}

export async function completeAuthRun(
  id: string,
  input: CompleteAuthRunInput,
): Promise<AuthRun> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.update({
    where: { id },
    data: {
      status: input.status ?? "AUTHENTICATED",
      oidcSubject:
        input.oidcSubject !== undefined ? input.oidcSubject : undefined,
      oidcSessionId:
        input.oidcSessionId !== undefined ? input.oidcSessionId : undefined,
      claimsJson:
        input.claims !== undefined ? JSON.stringify(input.claims ?? {}) : undefined,
      idToken: input.idToken,
      accessTokenEnc:
        input.accessToken !== undefined
          ? input.accessToken
            ? encrypt(input.accessToken)
            : null
          : undefined,
      refreshTokenEnc:
        input.refreshToken !== undefined
          ? input.refreshToken
            ? encrypt(input.refreshToken)
            : null
          : undefined,
      accessTokenExpiresAt:
        input.accessTokenExpiresAt !== undefined
          ? input.accessTokenExpiresAt
          : undefined,
      rawTokenResponseEnc:
        input.rawTokenResponse !== undefined
          ? input.rawTokenResponse
            ? encrypt(input.rawTokenResponse)
            : null
          : undefined,
      rawSamlResponseXml:
        input.rawSamlResponseXml !== undefined
          ? input.rawSamlResponseXml
          : undefined,
      userinfoJson:
        input.userinfo !== undefined
          ? input.userinfo
            ? JSON.stringify(input.userinfo)
            : null
          : undefined,
      lastIntrospectionJson:
        input.lastIntrospection !== undefined
          ? input.lastIntrospection
            ? JSON.stringify(input.lastIntrospection)
            : null
          : undefined,
      lastRevocationAt:
        input.lastRevocationAt !== undefined
          ? input.lastRevocationAt
          : undefined,
      authenticatedAt: input.authenticatedAt ?? new Date(),
      nonceStatus:
        input.nonceStatus !== undefined ? input.nonceStatus : undefined,
    },
  });
  return normalizeRun(record);
}

export async function updateAuthRunUserInfo(
  id: string,
  userinfo: Record<string, unknown> | null,
): Promise<AuthRun> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.update({
    where: { id },
    data: {
      userinfoJson: userinfo ? JSON.stringify(userinfo) : null,
    },
  });
  return normalizeRun(record);
}

export async function listAuthRunEvents(authRunId: string): Promise<AuthRunEvent[]> {
  const prisma = await getPrisma();
  const records = await prisma.authRunEvent.findMany({
    where: { authRunId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });
  return records.map(normalizeEvent);
}

export async function createAuthRunEvent(
  input: CreateAuthRunEventInput,
): Promise<AuthRunEvent> {
  const prisma = await getPrisma();
  const record = await prisma.authRunEvent.create({
    data: {
      authRunId: input.authRunId,
      type: input.type,
      status: input.status ?? "SUCCESS",
      requestJson:
        input.request !== undefined ? JSON.stringify(input.request ?? null) : null,
      responseEnc:
        input.response !== undefined
          ? input.response
            ? encrypt(input.response)
            : null
          : null,
      metadataJson:
        input.metadata !== undefined ? JSON.stringify(input.metadata ?? null) : null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
  return normalizeEvent(record);
}

export async function setAuthRunLogoutState(
  id: string,
  logoutState: string,
): Promise<AuthRun> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.update({
    where: { id },
    data: { logoutState },
  });
  return normalizeRun(record);
}

export async function markAuthRunLoggedOut(id: string): Promise<AuthRun> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.update({
    where: { id },
    data: {
      status: "LOGGED_OUT",
      completedAt: new Date(),
      logoutCompletedAt: new Date(),
    },
  });
  return normalizeRun(record);
}

export async function markAuthRunsLoggedOut(ids: string[]): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  const prisma = await getPrisma();
  const result = await prisma.authRun.updateMany({
    where: {
      id: { in: ids },
      status: "AUTHENTICATED",
    },
    data: {
      status: "LOGGED_OUT",
      completedAt: new Date(),
      logoutCompletedAt: new Date(),
    },
  });

  return result.count;
}

export async function markAuthRunFailed(id: string): Promise<AuthRun> {
  const prisma = await getPrisma();
  const record = await prisma.authRun.update({
    where: { id },
    data: {
      status: "FAILED",
      completedAt: new Date(),
    },
  });
  return normalizeRun(record);
}
