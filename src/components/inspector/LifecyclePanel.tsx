"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClaimsTable } from "./ClaimsTable";
import { RawPayloadView } from "./RawPayloadView";

interface LifecycleEventView {
  id: string;
  type: string;
  status: string;
  request: Record<string, unknown> | null;
  response: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

interface LifecyclePanelProps {
  slug: string;
  status: "PENDING" | "AUTHENTICATED" | "LOGGED_OUT" | "FAILED";
  grantType: string;
  claims: Record<string, unknown> | null;
  accessTokenExpiresAt: string | null;
  hasRefreshToken: boolean;
  lastIntrospection: Record<string, unknown> | null;
  lastRevocationAt: string | null;
  deviceAuthorization?: {
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string | null;
    expiresIn: number;
    interval: number | null;
    requestedScopes: string | null;
    startedAt: string | null;
  } | null;
  events: LifecycleEventView[];
}

interface TimelineEntry {
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  variant: "blue" | "green" | "gray";
}

function eventVariant(type: string, status: string): "blue" | "green" | "gray" {
  if (status === "FAILED") {
    return "gray";
  }
  if (
    type === "REVOKED" ||
    type === "DEVICE_AUTHORIZATION_STARTED" ||
    type === "FRONTCHANNEL_LOGGED_OUT" ||
    type === "BACKCHANNEL_LOGGED_OUT"
  ) {
    return "blue";
  }
  return "green";
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not captured";
  }
  return new Date(value).toLocaleString();
}

function formatRelativeTime(value: string | null, enabled = true): string {
  if (!value) {
    return "Not captured";
  }
  if (!enabled) {
    return formatTimestamp(value);
  }
  const deltaMs = new Date(value).getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(deltaMs) / 60000);

  if (absMinutes < 1) {
    return deltaMs >= 0 ? "in under a minute" : "under a minute ago";
  }

  if (absMinutes < 60) {
    return deltaMs >= 0 ? `in ${absMinutes}m` : `${absMinutes}m ago`;
  }

  const absHours = Math.round(absMinutes / 60);
  if (absHours < 48) {
    return deltaMs >= 0 ? `in ${absHours}h` : `${absHours}h ago`;
  }

  const absDays = Math.round(absHours / 24);
  return deltaMs >= 0 ? `in ${absDays}d` : `${absDays}d ago`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStringClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getStringListClaim(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }
  return [];
}

function getPosture(
  status: string,
  grantType: string,
  accessTokenExpiresAt: string | null,
  lastIntrospection: Record<string, unknown> | null,
  lastRevocationAt: string | null,
  enableRelative: boolean,
): { label: string; detail: string; variant: "blue" | "green" | "gray" } {
  if (grantType === "DEVICE_AUTHORIZATION" && status === "PENDING") {
    return {
      label: "Awaiting approval",
      detail: "The device flow has started, but the provider has not completed the secondary-device approval yet.",
      variant: "blue",
    };
  }
  const active =
    isRecord(lastIntrospection) && typeof lastIntrospection.active === "boolean"
      ? lastIntrospection.active
      : null;
  const expiryMs =
    enableRelative && accessTokenExpiresAt ? new Date(accessTokenExpiresAt).getTime() : null;
  const isExpired = expiryMs !== null ? expiryMs <= Date.now() : false;
  const expiresSoon = expiryMs !== null ? expiryMs - Date.now() <= 15 * 60 * 1000 : false;

  if (active === false) {
    return {
      label: "Inactive",
      detail: "The latest introspection response marked the token inactive.",
      variant: "gray",
    };
  }
  if (isExpired) {
    return {
      label: "Expired",
      detail: "The locally tracked access-token expiry has passed.",
      variant: "gray",
    };
  }
  if (lastRevocationAt) {
    return {
      label: "Revocation requested",
      detail: `A revocation call was last sent ${formatRelativeTime(lastRevocationAt, enableRelative)}.`,
      variant: "blue",
    };
  }
  if (expiresSoon) {
    return {
      label: "Expires soon",
      detail: `The current access token is scheduled to expire ${formatRelativeTime(accessTokenExpiresAt, enableRelative)}.`,
      variant: "blue",
    };
  }
  return {
    label: "Active",
    detail: accessTokenExpiresAt
      ? `The current access token is scheduled to expire ${formatRelativeTime(accessTokenExpiresAt, enableRelative)}.`
      : "The provider did not return an expiry timestamp for this token.",
    variant: "green",
  };
}

function getRefreshDiagnostics(
  grantType: string,
  status: string,
  hasRefreshToken: boolean,
  events: LifecycleEventView[],
): { label: string; detail: string; variant: "blue" | "green" | "gray" } {
  if (grantType === "DEVICE_AUTHORIZATION" && status === "PENDING") {
    return {
      label: "Waiting on approval",
      detail: "Refresh testing is unavailable until the device flow exchanges for tokens.",
      variant: "gray",
    };
  }
  const refreshedEvent = events.find((event) => event.type === "REFRESHED");

  if (refreshedEvent) {
    const rotated =
      isRecord(refreshedEvent.metadata) && refreshedEvent.metadata.replacedRefreshToken === true;
    return rotated
      ? {
          label: "Rotation observed",
          detail: "The latest refresh replaced the stored refresh token, which is the expected enterprise posture.",
          variant: "green",
        }
      : {
          label: "Refresh tested",
          detail: "A refresh exchange succeeded, but no refresh-token rotation evidence was captured.",
          variant: "blue",
        };
  }

  if (hasRefreshToken) {
    return {
      label: "Ready to test",
      detail: "A refresh token is available, but no refresh cycle has been exercised on this run yet.",
      variant: "blue",
    };
  }

  return {
    label: "Unavailable",
    detail: "This run does not currently have a refresh token snapshot.",
    variant: "gray",
  };
}

function getAuthContextDiagnostics(
  grantType: string,
  claims: Record<string, unknown> | null,
): {
  label: string;
  detail: string;
  variant: "blue" | "green" | "gray";
  acr: string | null;
  amr: string[];
} {
  if (grantType === "CLIENT_CREDENTIALS") {
    return {
      label: "No user context",
      detail: "Client credentials runs do not produce an end-user authentication context.",
      variant: "gray",
      acr: null,
      amr: [],
    };
  }
  if (grantType === "DEVICE_AUTHORIZATION" && (!claims || Object.keys(claims).length === 0)) {
    return {
      label: "Awaiting user session",
      detail: "Authentication-context claims will appear after the end user approves the device code.",
      variant: "gray",
      acr: null,
      amr: [],
    };
  }

  const acr = getStringClaim(claims?.acr);
  const amr = getStringListClaim(claims?.amr);
  const indicatesMfa = amr.some((value) => value.toLowerCase().includes("mfa"));

  if (acr || amr.length > 0) {
    return {
      label: indicatesMfa ? "MFA context visible" : "Auth context visible",
      detail: indicatesMfa
        ? "The returned claims include authentication-method evidence that suggests MFA or step-up policy execution."
        : "The returned claims include authentication context evidence from the provider.",
      variant: indicatesMfa ? "green" : "blue",
      acr,
      amr,
    };
  }

  return {
    label: "No auth context",
    detail: "No `acr` or `amr` claims were returned for this browser session.",
    variant: "gray",
    acr: null,
    amr: [],
  };
}

function describeEvent(event: LifecycleEventView): string {
  switch (event.type) {
    case "AUTHENTICATED":
      return "Interactive browser login completed.";
    case "CLIENT_CREDENTIALS_ISSUED":
      return "Machine-to-machine token issued.";
    case "DEVICE_AUTHORIZATION_STARTED":
      return "Device authorization started and user verification instructions captured.";
    case "DEVICE_AUTHORIZATION_COMPLETED":
      return "Device authorization completed and the token snapshot was stored.";
    case "TOKEN_EXCHANGED":
      return "A new token snapshot was issued from the active session token.";
    case "REFRESHED":
      return isRecord(event.metadata) && event.metadata.replacedRefreshToken === true
        ? "Access token refreshed and refresh token rotated."
        : "Access token refreshed from the stored refresh token.";
    case "INTROSPECTED":
      return isRecord(event.metadata) && typeof event.metadata.active === "boolean"
        ? event.metadata.active
          ? "Provider reported the token as active."
          : "Provider reported the token as inactive."
        : "Token introspection response captured.";
    case "REVOKED":
      return isRecord(event.metadata) && typeof event.metadata.target === "string"
        ? `Revocation requested for ${String(event.metadata.target).replaceAll("_", " ")}.`
        : "Revocation requested.";
    case "USERINFO_FETCHED":
      return "UserInfo response captured.";
    case "FRONTCHANNEL_LOGGED_OUT":
      return "Front-channel logout callback accepted and matching runs invalidated.";
    case "BACKCHANNEL_LOGGED_OUT":
      return "Back-channel logout token accepted and matching runs invalidated.";
    case "FAILED":
      return "A lifecycle action failed.";
    default:
      return "Lifecycle event captured.";
  }
}

function buildTimelineEntries(
  status: string,
  grantType: string,
  accessTokenExpiresAt: string | null,
  lastRevocationAt: string | null,
  events: LifecycleEventView[],
  enableRelative: boolean,
): TimelineEntry[] {
  const chronological = [...events].sort(
    (left, right) =>
      new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
  );
  const issuedEvent =
    chronological.find(
      (event) =>
        event.type === "AUTHENTICATED" ||
        event.type === "CLIENT_CREDENTIALS_ISSUED" ||
        event.type === "DEVICE_AUTHORIZATION_COMPLETED" ||
        event.type === "TOKEN_EXCHANGED",
    ) ?? chronological[0];
  const deviceStartEvent = chronological.find(
    (event) => event.type === "DEVICE_AUTHORIZATION_STARTED",
  );
  const refreshedEvent = [...chronological].reverse().find((event) => event.type === "REFRESHED");
  const introspectedEvent = [...chronological]
    .reverse()
    .find((event) => event.type === "INTROSPECTED");
  const revokedEvent = [...chronological].reverse().find((event) => event.type === "REVOKED");
  const entries: TimelineEntry[] = [];

  if (issuedEvent) {
    entries.push({
      id: `${issuedEvent.id}-issued`,
      title:
        grantType === "CLIENT_CREDENTIALS"
          ? "Machine token issued"
          : grantType === "DEVICE_AUTHORIZATION"
            ? status === "PENDING"
              ? "Device flow started"
              : "Device flow completed"
            : grantType === "TOKEN_EXCHANGE"
              ? "Token exchange completed"
            : "Browser session issued",
      detail:
        grantType === "CLIENT_CREDENTIALS"
          ? "The client credentials grant returned a token snapshot for this app."
          : grantType === "DEVICE_AUTHORIZATION" && status === "PENDING"
            ? "The provider issued a device code and is waiting for the end user to approve it on a secondary device."
            : grantType === "DEVICE_AUTHORIZATION"
              ? "The device authorization exchange completed and stored the current token snapshot."
            : grantType === "TOKEN_EXCHANGE"
              ? "The token exchange grant returned a new delegated token snapshot and switched the active inspector session."
          : "The authorization code exchange completed and stored the current token snapshot.",
      occurredAt: issuedEvent.occurredAt,
      variant: grantType === "DEVICE_AUTHORIZATION" && status === "PENDING" ? "blue" : "green",
    });
  }

  if (deviceStartEvent && issuedEvent?.id !== deviceStartEvent.id) {
    entries.push({
      id: `${deviceStartEvent.id}-device-start`,
      title: "Device verification issued",
      detail: describeEvent(deviceStartEvent),
      occurredAt: deviceStartEvent.occurredAt,
      variant: "blue",
    });
  }

  if (refreshedEvent) {
    entries.push({
      id: `${refreshedEvent.id}-refresh`,
      title: "Token refresh completed",
      detail: describeEvent(refreshedEvent),
      occurredAt: refreshedEvent.occurredAt,
      variant: "blue",
    });
  }

  if (introspectedEvent) {
    entries.push({
      id: `${introspectedEvent.id}-introspection`,
      title: "Token introspected",
      detail: describeEvent(introspectedEvent),
      occurredAt: introspectedEvent.occurredAt,
      variant: eventVariant(introspectedEvent.type, introspectedEvent.status),
    });
  }

  if (accessTokenExpiresAt) {
    const expiryVariant =
      enableRelative && new Date(accessTokenExpiresAt).getTime() <= Date.now() ? "gray" : "blue";
    entries.push({
      id: "access-token-expiry",
      title: expiryVariant === "gray" ? "Access token expired" : "Access token expiry scheduled",
      detail:
        expiryVariant === "gray"
          ? "The locally tracked expiry timestamp has passed."
          : `The current access token is scheduled to expire ${formatRelativeTime(
              accessTokenExpiresAt,
              enableRelative,
            )}.`,
      occurredAt: accessTokenExpiresAt,
      variant: expiryVariant,
    });
  }

  if (lastRevocationAt || revokedEvent) {
    const occurredAt = lastRevocationAt ?? revokedEvent?.occurredAt ?? "";
    entries.push({
      id: "revocation-requested",
      title: "Revocation requested",
      detail: revokedEvent ? describeEvent(revokedEvent) : "A revocation request was recorded.",
      occurredAt,
      variant: "gray",
    });
  }

  return entries.sort(
    (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
  );
}

export function LifecyclePanel({
  slug,
  status,
  grantType,
  claims,
  accessTokenExpiresAt,
  hasRefreshToken,
  lastIntrospection,
  lastRevocationAt,
  deviceAuthorization = null,
  events,
}: LifecyclePanelProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mounted, setMounted] = useState(false);
  const refreshDiagnostics = getRefreshDiagnostics(grantType, status, hasRefreshToken, events);
  const authContext = getAuthContextDiagnostics(grantType, claims);
  const posture = getPosture(
    status,
    grantType,
    accessTokenExpiresAt,
    lastIntrospection,
    lastRevocationAt,
    mounted,
  );
  const latestEvent = events[0] ?? null;
  const timelineEntries = buildTimelineEntries(
    status,
    grantType,
    accessTokenExpiresAt,
    lastRevocationAt,
    events,
    mounted,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  async function runAction(
    action: string,
    url: string,
    body?: Record<string, string>,
  ) {
    setLoadingAction(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 202 && data && typeof data === "object" && "pending" in data) {
        const pollAfter =
          typeof data.pollAfterSeconds === "number"
            ? ` Poll again in ${data.pollAfterSeconds}s.`
            : "";
        setNotice(
          typeof data.error === "string"
            ? `${data.error}.${pollAfter}`
            : `The device flow is still waiting for approval.${pollAfter}`,
        );
        return;
      }
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Lifecycle action failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Lifecycle action failed");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Run mode
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="blue">
              {grantType === "CLIENT_CREDENTIALS"
                ? "M2M"
                : grantType === "DEVICE_AUTHORIZATION"
                  ? "Device"
                  : grantType === "TOKEN_EXCHANGE"
                    ? "Exchange"
                  : "Browser"}
            </Badge>
            <span className="text-sm font-medium text-[var(--text)]">
              {grantType === "CLIENT_CREDENTIALS"
                ? "Client credentials"
                : grantType === "DEVICE_AUTHORIZATION"
                  ? "Device authorization"
                  : grantType === "TOKEN_EXCHANGE"
                    ? "Token exchange"
                  : "Authorization code"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Token posture
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={posture.variant}>{posture.label}</Badge>
            <span className="text-sm font-medium text-[var(--text)]">{posture.label}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{posture.detail}</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Refresh posture
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={refreshDiagnostics.variant}>{refreshDiagnostics.label}</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{refreshDiagnostics.detail}</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Auth context
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={authContext.variant}>{authContext.label}</Badge>
          </div>
          <div className="mt-2 space-y-2 text-xs text-[var(--muted)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="uppercase tracking-[0.08em]">ACR</span>
              <code className="rounded bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text)]">
                {authContext.acr ?? "Not returned"}
              </code>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="uppercase tracking-[0.08em]">AMR</span>
              {authContext.amr.length > 0 ? (
                authContext.amr.map((value) => (
                  <code
                    key={value}
                    className="rounded bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text)]"
                  >
                    {value}
                  </code>
                ))
              ) : (
                <code className="rounded bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text)]">
                  Not returned
                </code>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{authContext.detail}</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Refresh token
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={hasRefreshToken ? "green" : "gray"}>
              {hasRefreshToken ? "Stored" : "Unavailable"}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            {hasRefreshToken
              ? "Refresh, introspection, and revoke checks can run against this stored session state."
              : "Offline lifecycle checks are limited because no refresh token is stored."}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Last event
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--text)]">
            {latestEvent ? latestEvent.type.replaceAll("_", " ") : "No lifecycle events"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {latestEvent
              ? `${formatTimestamp(latestEvent.occurredAt)} • ${describeEvent(latestEvent)}`
              : "The event stream has not captured any lifecycle actions yet."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Token timeline
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Follow issuance, refresh, introspection, expiry, and revocation on the active run.
              </p>
            </div>
            <Badge variant={posture.variant}>{posture.label}</Badge>
          </div>

          <div className="mt-4 space-y-0">
            {timelineEntries.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
                No token timeline markers have been captured yet.
              </div>
            ) : (
              timelineEntries.map((entry, index) => (
                <div key={entry.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        entry.variant === "green"
                          ? "bg-[#10b981]"
                          : entry.variant === "blue"
                            ? "bg-[#3b82f6]"
                            : "bg-[var(--border-strong)]"
                      }`}
                    />
                    {index < timelineEntries.length - 1 ? (
                      <span className="mt-2 h-full min-h-8 w-px bg-[var(--border)]" />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">{entry.title}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                            {entry.detail}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium text-[var(--text)]">
                            {formatRelativeTime(entry.occurredAt, mounted)}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--muted)]">
                            {formatTimestamp(entry.occurredAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Lifecycle actions
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Run active token checks and capture new evidence on this session snapshot.
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                {grantType === "DEVICE_AUTHORIZATION" && status === "PENDING"
                  ? "Device flow state"
                  : "Access token expiry"}
              </p>
              <p className="mt-1 text-sm text-[var(--text)]">
                {grantType === "DEVICE_AUTHORIZATION" && status === "PENDING"
                  ? "Waiting for end-user verification"
                  : accessTokenExpiresAt
                  ? formatTimestamp(accessTokenExpiresAt)
                  : "Provider did not return an expiry timestamp"}
              </p>
            </div>

            {grantType === "DEVICE_AUTHORIZATION" && status === "PENDING" && deviceAuthorization ? (
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      User code
                    </p>
                    <code className="mt-1 inline-block rounded bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--text)]">
                      {deviceAuthorization.userCode}
                    </code>
                  </div>
                  <Badge variant="blue">
                    {deviceAuthorization.interval
                      ? `Poll ${deviceAuthorization.interval}s`
                      : "Default poll interval"}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs text-[var(--muted)]">
                  <p>
                    Verify at{" "}
                    <a
                      href={deviceAuthorization.verificationUriComplete ?? deviceAuthorization.verificationUri}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[var(--primary)] hover:underline"
                    >
                      {deviceAuthorization.verificationUri}
                    </a>
                  </p>
                  {deviceAuthorization.requestedScopes ? (
                    <p>Requested scopes: {deviceAuthorization.requestedScopes}</p>
                  ) : null}
                  {deviceAuthorization.startedAt ? (
                    <p>Started: {formatTimestamp(deviceAuthorization.startedAt)}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => runAction("device-poll", `/api/auth/device/${slug}/poll`)}
                  loading={loadingAction === "device-poll"}
                >
                  Poll for Device Completion
                </Button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    runAction("introspect-access", `/api/auth/token/introspect/${slug}`, {
                      target: "access_token",
                    })
                  }
                  loading={loadingAction === "introspect-access"}
                >
                  Introspect Access Token
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    runAction("revoke-access", `/api/auth/token/revoke/${slug}`, {
                      target: "access_token",
                    })
                  }
                  loading={loadingAction === "revoke-access"}
                >
                  Revoke Access Token
                </Button>
                {hasRefreshToken ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => runAction("refresh", `/api/auth/token/refresh/${slug}`)}
                    loading={loadingAction === "refresh"}
                  >
                    Refresh Tokens
                  </Button>
                ) : null}
                {hasRefreshToken ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      runAction("introspect-refresh", `/api/auth/token/introspect/${slug}`, {
                        target: "refresh_token",
                      })
                    }
                    loading={loadingAction === "introspect-refresh"}
                  >
                    Introspect Refresh Token
                  </Button>
                ) : null}
                {hasRefreshToken ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      runAction("revoke-refresh", `/api/auth/token/revoke/${slug}`, {
                        target: "refresh_token",
                      })
                    }
                    loading={loadingAction === "revoke-refresh"}
                  >
                    Revoke Refresh Token
                  </Button>
                ) : null}
              </div>
            )}

            {lastRevocationAt ? (
              <p className="text-xs text-[var(--muted)]">
                Last revocation requested at {formatTimestamp(lastRevocationAt)}.
              </p>
            ) : null}

            {notice ? <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">{notice}</div> : null}
            {error ? <div className="alert-danger rounded-lg p-3 text-sm">{error}</div> : null}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Latest introspection
            </p>
            {lastIntrospection ? (
              <ClaimsTable claims={lastIntrospection} />
            ) : (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                No introspection response captured yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          Event log
        </p>
        <div className="space-y-2">
          {events.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
              No lifecycle events captured yet.
            </div>
          ) : (
            events.map((event) => (
              <details
                key={event.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={eventVariant(event.type, event.status)}>
                        {event.type.replaceAll("_", " ")}
                      </Badge>
                      <span className="text-sm text-[var(--text)]">
                        {formatTimestamp(event.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      {describeEvent(event)}
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                    {event.status}
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
                  {event.metadata ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                        Metadata
                      </p>
                      <ClaimsTable claims={event.metadata} />
                    </div>
                  ) : null}
                  {event.request ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                        Request
                      </p>
                      <RawPayloadView data={JSON.stringify(event.request, null, 2)} format="json" />
                    </div>
                  ) : null}
                  {event.response ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                        Response
                      </p>
                      <RawPayloadView data={event.response} format="json" />
                    </div>
                  ) : null}
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
