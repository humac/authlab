import { inflateRawSync } from "zlib";
import type { AuthRun, AuthRunEvent } from "@/types/auth-run";

export type AuthTraceFormat = "json" | "xml" | "text";

export interface AuthTraceSection {
  label: string;
  format: AuthTraceFormat;
  data: string;
}

export interface AuthTraceEntry {
  id: string;
  title: string;
  summary: string;
  occurredAt: string;
  status: "SUCCESS" | "FAILED" | "INFO";
  sections: AuthTraceSection[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function inferPayloadFormat(value: string): AuthTraceFormat {
  const trimmed = value.trim();
  if (trimmed.startsWith("<")) {
    return "xml";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }
  return "text";
}

export function decodeSamlRedirectRequest(value: string): string | null {
  try {
    return inflateRawSync(Buffer.from(value, "base64")).toString("utf-8");
  } catch {
    return null;
  }
}

function buildEventTitle(protocol: AuthRun["protocol"], type: AuthRunEvent["type"]): string {
  switch (type) {
    case "AUTHORIZATION_STARTED":
      return protocol === "OIDC" ? "Authorization request" : "AuthnRequest redirect";
    case "AUTHENTICATED":
      return protocol === "OIDC" ? "Token exchange" : "Assertion callback";
    case "CLIENT_CREDENTIALS_ISSUED":
      return "Client credentials exchange";
    case "DEVICE_AUTHORIZATION_STARTED":
      return "Device authorization request";
    case "DEVICE_AUTHORIZATION_COMPLETED":
      return "Device token exchange";
    case "TOKEN_EXCHANGED":
      return "Token exchange";
    case "REFRESHED":
      return "Refresh token exchange";
    case "INTROSPECTED":
      return "Token introspection";
    case "REVOKED":
      return "Token revocation";
    case "USERINFO_FETCHED":
      return "UserInfo request";
    case "FRONTCHANNEL_LOGGED_OUT":
      return "Front-channel logout";
    case "BACKCHANNEL_LOGGED_OUT":
      return "Back-channel logout";
    case "FAILED":
      return "Failed protocol step";
    default:
      return String(type).replaceAll("_", " ");
  }
}

function buildEventSummary(protocol: AuthRun["protocol"], event: AuthRunEvent): string {
  if (event.type === "FAILED" && isRecord(event.metadata)) {
    const action =
      typeof event.metadata.action === "string" ? event.metadata.action : "protocol";
    const message =
      typeof event.metadata.message === "string" ? event.metadata.message : null;
    return message ? `${action} failed: ${message}` : `${action} failed.`;
  }

  switch (event.type) {
    case "AUTHORIZATION_STARTED":
      return protocol === "OIDC"
        ? "Prepared the browser redirect to the provider authorization endpoint."
        : "Prepared the SP-initiated redirect with the outbound AuthnRequest.";
    case "AUTHENTICATED":
      return protocol === "OIDC"
        ? "Exchanged the authorization code for tokens."
        : "Validated the SAML response and extracted assertion claims.";
    case "CLIENT_CREDENTIALS_ISSUED":
      return "Exchanged client credentials directly for an access token.";
    case "DEVICE_AUTHORIZATION_STARTED":
      return "Requested a user code and verification URI from the provider.";
    case "DEVICE_AUTHORIZATION_COMPLETED":
      return "Completed the device-code token exchange after secondary-device approval.";
    case "TOKEN_EXCHANGED":
      return "Exchanged the active session token for a new delegated or impersonated token.";
    case "REFRESHED":
      return "Refreshed the active token set using the stored refresh token.";
    case "INTROSPECTED":
      return "Called the provider introspection endpoint for the stored token.";
    case "REVOKED":
      return "Submitted a revocation request for the selected token.";
    case "USERINFO_FETCHED":
      return "Called the provider UserInfo endpoint with the current access token.";
    case "FRONTCHANNEL_LOGGED_OUT":
      return "Accepted a front-channel logout callback and invalidated matching runs.";
    case "BACKCHANNEL_LOGGED_OUT":
      return "Accepted a provider-initiated logout token and invalidated matching runs.";
    default:
      return "Captured as part of the active auth run trace.";
  }
}

function buildSectionsFromEvent(
  protocol: AuthRun["protocol"],
  event: AuthRunEvent,
): AuthTraceSection[] {
  const sections: AuthTraceSection[] = [];

  if (event.request && Object.keys(event.request).length > 0) {
    sections.push({
      label: "Request",
      format: "json",
      data: formatJson(event.request),
    });
  }

  if (event.response) {
    sections.push({
      label:
        event.type === "AUTHORIZATION_STARTED" && protocol === "SAML"
          ? "AuthnRequest"
          : event.type === "AUTHENTICATED" && protocol === "SAML"
            ? "SAML response XML"
            : "Response",
      format: inferPayloadFormat(event.response),
      data: event.response,
    });
  }

  if (event.metadata && Object.keys(event.metadata).length > 0) {
    sections.push({
      label: "Metadata",
      format: "json",
      data: formatJson(event.metadata),
    });
  }

  return sections;
}

function buildSyntheticAuthorizationEntry(input: {
  run: AuthRun;
  oidcAuthorizationEndpoint?: string | null;
  samlEntryPoint?: string | null;
}): AuthTraceEntry | null {
  const { run, oidcAuthorizationEndpoint, samlEntryPoint } = input;
  const hasParams = Object.keys(run.outboundAuthParams).length > 0;
  if (!hasParams) {
    return null;
  }

  const requestDetails =
    run.protocol === "OIDC"
      ? {
          method: "GET",
          endpoint: oidcAuthorizationEndpoint ?? "Provider authorization endpoint",
        }
      : {
          method: "GET",
          endpoint: samlEntryPoint ?? "IdP SSO endpoint",
        };

  return {
    id: `synthetic-auth-start-${run.id}`,
    title: run.protocol === "OIDC" ? "Authorization request" : "AuthnRequest redirect",
    summary:
      run.protocol === "OIDC"
        ? "Captured from the stored outbound authorization parameters for this browser run."
        : "Captured from the stored outbound SAML launch parameters for this SP-initiated run.",
    occurredAt: run.createdAt.toISOString(),
    status: "INFO",
    sections: [
      {
        label: "Request",
        format: "json",
        data: formatJson(requestDetails),
      },
      {
        label: "Parameters",
        format: "json",
        data: formatJson(run.outboundAuthParams),
      },
    ],
  };
}

function buildSyntheticSamlResponseEntry(run: AuthRun): AuthTraceEntry | null {
  if (run.protocol !== "SAML" || !run.rawSamlResponseXml) {
    return null;
  }

  return {
    id: `synthetic-saml-response-${run.id}`,
    title: "Assertion callback",
    summary: "Captured from the stored raw SAML response XML for this run.",
    occurredAt:
      run.authenticatedAt?.toISOString() ?? run.updatedAt.toISOString(),
    status: run.status === "FAILED" ? "FAILED" : "SUCCESS",
    sections: [
      {
        label: "SAML response XML",
        format: "xml",
        data: run.rawSamlResponseXml,
      },
    ],
  };
}

export function buildAuthTraceEntries(input: {
  run: AuthRun;
  events: AuthRunEvent[];
  oidcAuthorizationEndpoint?: string | null;
  samlEntryPoint?: string | null;
}): AuthTraceEntry[] {
  const { run, events, oidcAuthorizationEndpoint, samlEntryPoint } = input;
  const entries: AuthTraceEntry[] = [];
  const hasAuthorizationStart = events.some(
    (event) => event.type === "AUTHORIZATION_STARTED",
  );
  if (!hasAuthorizationStart) {
    const syntheticStart = buildSyntheticAuthorizationEntry({
      run,
      oidcAuthorizationEndpoint,
      samlEntryPoint,
    });
    if (syntheticStart) {
      entries.push(syntheticStart);
    }
  }

  for (const event of events) {
    entries.push({
      id: event.id,
      title: buildEventTitle(run.protocol, event.type),
      summary: buildEventSummary(run.protocol, event),
      occurredAt: event.occurredAt.toISOString(),
      status:
        event.status === "FAILED"
          ? "FAILED"
          : event.type === "AUTHORIZATION_STARTED"
            ? "INFO"
            : "SUCCESS",
      sections: buildSectionsFromEvent(run.protocol, event),
    });
  }

  const hasSamlAuthenticated = events.some((event) => event.type === "AUTHENTICATED");
  if (run.protocol === "SAML" && !hasSamlAuthenticated) {
    const syntheticResponse = buildSyntheticSamlResponseEntry(run);
    if (syntheticResponse) {
      entries.push(syntheticResponse);
    }
  }

  return entries.sort(
    (left, right) =>
      new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
  );
}
