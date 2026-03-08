"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { KeyValueEditor } from "./KeyValueEditor";
import type { KeyValueParam } from "@/types/app-instance";

interface RuntimeLaunchPanelProps {
  protocol: "OIDC" | "SAML";
  loginUrl: string;
  clientCredentialsUrl?: string;
  savedCustomParams?: KeyValueParam[];
  defaultScopes?: string;
  pkceMode?: "S256" | "PLAIN" | "NONE";
  forceAuthnDefault?: boolean;
  isPassiveDefault?: boolean;
  requestedAuthnContextDefault?: string | null;
  samlSignatureAlgorithm?: "SHA1" | "SHA256";
  clockSkewToleranceSeconds?: number;
  samlLogoutUrl?: string | null;
}

export function RuntimeLaunchPanel({
  protocol,
  loginUrl,
  clientCredentialsUrl,
  savedCustomParams = [],
  defaultScopes = "openid profile email",
  pkceMode = "S256",
  forceAuthnDefault = false,
  isPassiveDefault = false,
  requestedAuthnContextDefault = "",
  samlSignatureAlgorithm = "SHA256",
  clockSkewToleranceSeconds = 0,
  samlLogoutUrl = null,
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
                <Badge variant={pkceMode === "S256" ? "green" : "gray"}>{pkceMode}</Badge>
              </div>
              {pkceMode !== "S256" && (
                <div className="alert-warning rounded-lg px-3 py-2">
                  <p className="text-xs font-medium">
                    Reduced PKCE protection is enabled for compatibility testing.
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
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={launchClientCredentials}
              loading={clientCredentialsLoading}
            >
              Run Client Credentials
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
