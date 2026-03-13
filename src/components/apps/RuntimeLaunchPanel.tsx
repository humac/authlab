"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { KeyValueEditor } from "./KeyValueEditor";
import type { KeyValueParam } from "@/types/app-instance";

interface RuntimeLaunchPanelProps {
  protocol: "OIDC" | "SAML";
  loginUrl: string;
  clientCredentialsUrl?: string;
  deviceAuthorizationUrl?: string;
  tokenExchangeUrl?: string;
  hasActiveAccessToken?: boolean;
  hasActiveIdToken?: boolean;
  savedCustomParams?: KeyValueParam[];
  defaultScopes?: string;
  pkceMode?: "S256" | "PLAIN" | "NONE";
  usePar?: boolean;
  parSupported?: boolean;
  forceAuthnDefault?: boolean;
  isPassiveDefault?: boolean;
  requestedAuthnContextDefault?: string | null;
  samlSignatureAlgorithm?: "SHA1" | "SHA256";
  clockSkewToleranceSeconds?: number;
  samlLogoutUrl?: string | null;
  isPublicClient?: boolean;
}

export function RuntimeLaunchPanel({
  protocol,
  loginUrl,
  clientCredentialsUrl,
  deviceAuthorizationUrl,
  tokenExchangeUrl,
  hasActiveAccessToken = false,
  hasActiveIdToken = false,
  savedCustomParams = [],
  defaultScopes = "openid profile email",
  pkceMode = "S256",
  usePar = false,
  parSupported = false,
  forceAuthnDefault = false,
  isPassiveDefault = false,
  requestedAuthnContextDefault = "",
  samlSignatureAlgorithm = "SHA256",
  clockSkewToleranceSeconds = 0,
  samlLogoutUrl = null,
  isPublicClient = false,
}: RuntimeLaunchPanelProps) {
  const router = useRouter();
  const [params, setParams] = useState<KeyValueParam[]>(
    savedCustomParams.length > 0 ? savedCustomParams : [{ key: "", value: "" }],
  );
  const [forceAuthn, setForceAuthn] = useState(forceAuthnDefault);
  const [isPassive, setIsPassive] = useState(isPassiveDefault);
  const [requestedAuthnContext, setRequestedAuthnContext] = useState(
    requestedAuthnContextDefault || "",
  );
  const [clientCredentialScopes, setClientCredentialScopes] = useState(defaultScopes);
  const [clientCredentialsLoading, setClientCredentialsLoading] = useState(false);
  const [clientCredentialsError, setClientCredentialsError] = useState("");
  const [deviceAuthorizationScopes, setDeviceAuthorizationScopes] = useState(defaultScopes);
  const [deviceAuthorizationLoading, setDeviceAuthorizationLoading] = useState(false);
  const [deviceAuthorizationError, setDeviceAuthorizationError] = useState("");
  const [tokenExchangeSource, setTokenExchangeSource] = useState<"access_token" | "id_token">(
    hasActiveAccessToken ? "access_token" : "id_token",
  );
  const [tokenExchangeRequestedType, setTokenExchangeRequestedType] = useState(
    "urn:ietf:params:oauth:token-type:access_token",
  );
  const [tokenExchangeAudience, setTokenExchangeAudience] = useState("");
  const [tokenExchangeScopes, setTokenExchangeScopes] = useState("");
  const [tokenExchangeLoading, setTokenExchangeLoading] = useState(false);
  const [tokenExchangeError, setTokenExchangeError] = useState("");

  const runtimePayload = useMemo(() => {
    if (protocol === "OIDC") {
      return JSON.stringify(
        Object.fromEntries(
          params
            .map((entry) => [entry.key.trim(), entry.value] as const)
            .filter(([key]) => key.length > 0),
        ),
      );
    }

    return JSON.stringify({
      forceAuthn: String(forceAuthn),
      isPassive: String(isPassive),
      requestedAuthnContext,
    });
  }, [forceAuthn, isPassive, params, protocol, requestedAuthnContext]);

  async function launchClientCredentials() {
    if (!clientCredentialsUrl) {
      return;
    }

    setClientCredentialsLoading(true);
    setClientCredentialsError("");
    try {
      const response = await fetch(clientCredentialsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: clientCredentialScopes }),
      });
      const data = await response.json();
      if (!response.ok) {
        setClientCredentialsError(
          typeof data.error === "string"
            ? data.error
            : "Client credentials exchange failed",
        );
        return;
      }
      if (typeof data.redirectTo === "string") {
        router.push(data.redirectTo);
        router.refresh();
      }
    } catch {
      setClientCredentialsError("Client credentials exchange failed");
    } finally {
      setClientCredentialsLoading(false);
    }
  }

  async function launchDeviceAuthorization() {
    if (!deviceAuthorizationUrl) {
      return;
    }

    setDeviceAuthorizationLoading(true);
    setDeviceAuthorizationError("");
    try {
      const response = await fetch(deviceAuthorizationUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: deviceAuthorizationScopes }),
      });
      const data = await response.json();
      if (!response.ok) {
        setDeviceAuthorizationError(
          typeof data.error === "string"
            ? data.error
            : "Device authorization request failed",
        );
        return;
      }
      if (typeof data.redirectTo === "string") {
        router.push(data.redirectTo);
        router.refresh();
      }
    } catch {
      setDeviceAuthorizationError("Device authorization request failed");
    } finally {
      setDeviceAuthorizationLoading(false);
    }
  }

  async function launchTokenExchange() {
    if (!tokenExchangeUrl) {
      return;
    }

    setTokenExchangeLoading(true);
    setTokenExchangeError("");
    try {
      const response = await fetch(tokenExchangeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTokenSource: tokenExchangeSource,
          requestedTokenType: tokenExchangeRequestedType,
          audience: tokenExchangeAudience,
          scope: tokenExchangeScopes,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setTokenExchangeError(
          typeof data.error === "string" ? data.error : "Token exchange failed",
        );
        return;
      }
      if (typeof data.redirectTo === "string") {
        router.push(data.redirectTo);
        router.refresh();
      }
    } catch {
      setTokenExchangeError("Token exchange failed");
    } finally {
      setTokenExchangeLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {protocol === "OIDC" ? (
        <>
          <form action={loginUrl} method="GET" className="space-y-4">
            <input type="hidden" name="runtime" value={runtimePayload} />
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    Browser login
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Launch the interactive authorization code flow with the configured PKCE mode.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={pkceMode === "S256" ? "green" : "gray"}>{pkceMode}</Badge>
                  <Badge variant={usePar && parSupported ? "blue" : "gray"}>
                    {usePar ? (parSupported ? "PAR on" : "PAR missing") : "PAR off"}
                  </Badge>
                </div>
              </div>
              {pkceMode !== "S256" && (
                <div className="alert-warning rounded-lg px-3 py-2">
                  <p className="text-xs font-medium">
                    Reduced PKCE protection is enabled for compatibility testing.
                  </p>
                </div>
              )}
              {usePar && (
                <div className={parSupported ? "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" : "alert-danger rounded-lg px-3 py-2"}>
                  <p className="text-xs font-medium">
                    {parSupported
                      ? "Browser login will post the authorization request to the provider before redirecting with a request URI."
                      : "PAR is enabled for this app, but the provider discovery metadata does not advertise a pushed authorization request endpoint."}
                  </p>
                </div>
              )}
              <KeyValueEditor
                label="Runtime auth parameters"
                values={params}
                onChange={setParams}
                helperText="One-off parameters override saved defaults for this run only."
                compact
              />
              <Button type="submit" size="sm" className="w-full">
                Launch Browser Flow
              </Button>
            </div>
          </form>

          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Client credentials
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Issue an M2M access token without redirecting through browser login.
              </p>
            </div>
            <Input
              label="Requested scopes"
              value={clientCredentialScopes}
              onChange={(event) => setClientCredentialScopes(event.target.value)}
              helperText="Leave blank to omit the scope parameter."
              uiSize="sm"
            />
            {clientCredentialsError && (
              <div className="alert-danger rounded-lg p-3 text-sm">{clientCredentialsError}</div>
            )}
            {isPublicClient && (
              <p className="text-xs text-[var(--muted)]">
                Client credentials requires a client secret.
              </p>
            )}
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={launchClientCredentials}
              loading={clientCredentialsLoading}
              disabled={isPublicClient}
            >
              Run Client Credentials
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                  Device authorization
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Start a device flow for CLI and headless testing, then complete it from the inspector.
                </p>
              </div>
              <Badge variant={deviceAuthorizationUrl ? "green" : "gray"}>
                {deviceAuthorizationUrl ? "Supported" : "Unavailable"}
              </Badge>
            </div>
            <Input
              label="Requested scopes"
              value={deviceAuthorizationScopes}
              onChange={(event) => setDeviceAuthorizationScopes(event.target.value)}
              helperText="Leave blank to use the provider default scope behavior."
              uiSize="sm"
            />
            {deviceAuthorizationError && (
              <div className="alert-danger rounded-lg p-3 text-sm">{deviceAuthorizationError}</div>
            )}
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={launchDeviceAuthorization}
              loading={deviceAuthorizationLoading}
              disabled={!deviceAuthorizationUrl}
            >
              Start Device Flow
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                  Token exchange
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Exchange the active access token or ID token for a new delegated token.
                </p>
              </div>
              <Badge
                variant={
                  hasActiveAccessToken || hasActiveIdToken ? "green" : "gray"
                }
              >
                {hasActiveAccessToken || hasActiveIdToken ? "Ready" : "Needs active run"}
              </Badge>
            </div>
            <Select
              label="Subject token source"
              value={tokenExchangeSource}
              onChange={(event) =>
                setTokenExchangeSource(event.target.value as "access_token" | "id_token")
              }
              options={[
                ...(hasActiveAccessToken
                  ? [{ value: "access_token", label: "Active access token" }]
                  : []),
                ...(hasActiveIdToken ? [{ value: "id_token", label: "Active ID token" }] : []),
                ...(!hasActiveAccessToken && !hasActiveIdToken
                  ? [{ value: "access_token", label: "No token source available" }]
                  : []),
              ]}
              helperText="The current active OIDC run supplies the subject token."
              uiSize="sm"
              disabled={!hasActiveAccessToken && !hasActiveIdToken}
            />
            <Select
              label="Requested token type"
              value={tokenExchangeRequestedType}
              onChange={(event) => setTokenExchangeRequestedType(event.target.value)}
              options={[
                {
                  value: "urn:ietf:params:oauth:token-type:access_token",
                  label: "Access token",
                },
                {
                  value: "urn:ietf:params:oauth:token-type:refresh_token",
                  label: "Refresh token",
                },
                {
                  value: "urn:ietf:params:oauth:token-type:id_token",
                  label: "ID token",
                },
              ]}
              helperText="Most providers return an access token even when metadata does not advertise token exchange."
              uiSize="sm"
              disabled={!hasActiveAccessToken && !hasActiveIdToken}
            />
            <Input
              label="Audience"
              value={tokenExchangeAudience}
              onChange={(event) => setTokenExchangeAudience(event.target.value)}
              helperText="Optional target audience or resource hint."
              uiSize="sm"
              disabled={!hasActiveAccessToken && !hasActiveIdToken}
            />
            <Input
              label="Requested scopes"
              value={tokenExchangeScopes}
              onChange={(event) => setTokenExchangeScopes(event.target.value)}
              helperText="Optional scope override for the exchanged token."
              uiSize="sm"
              disabled={!hasActiveAccessToken && !hasActiveIdToken}
            />
            {tokenExchangeError && (
              <div className="alert-danger rounded-lg p-3 text-sm">{tokenExchangeError}</div>
            )}
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={launchTokenExchange}
              loading={tokenExchangeLoading}
              disabled={!tokenExchangeUrl || (!hasActiveAccessToken && !hasActiveIdToken)}
            >
              Run Token Exchange
            </Button>
          </div>
        </>
      ) : (
        <form action={loginUrl} method="GET" className="space-y-4">
          <input type="hidden" name="runtime" value={runtimePayload} />
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Runtime SAML controls
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Override the saved request behavior for this run.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={samlSignatureAlgorithm === "SHA256" ? "green" : "gray"}>
              {samlSignatureAlgorithm}
            </Badge>
            <Badge variant={clockSkewToleranceSeconds > 0 ? "blue" : "gray"}>
              Clock skew {clockSkewToleranceSeconds}s
            </Badge>
            <Badge variant={samlLogoutUrl ? "green" : "gray"}>
              {samlLogoutUrl ? "SLO ready" : "No SLO URL"}
            </Badge>
          </div>
          <Input
            label="Requested AuthnContextClassRef"
            value={requestedAuthnContext}
            onChange={(event) => setRequestedAuthnContext(event.target.value)}
            helperText="Leave blank to omit RequestedAuthnContext for this run."
            uiSize="sm"
          />
          <label className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
            <span>ForceAuthn</span>
            <input
              type="checkbox"
              checked={forceAuthn}
              onChange={(event) => setForceAuthn(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
            <span>IsPassive</span>
            <input
              type="checkbox"
              checked={isPassive}
              onChange={(event) => setIsPassive(event.target.checked)}
            />
          </label>
          </div>
          <Button type="submit" size="sm" className="w-full">
            Launch {protocol} Flow
          </Button>
        </form>
      )}
    </div>
  );
}
