"use client";

import { Input } from "@/components/ui/Input";
import { KeyValueEditor } from "./KeyValueEditor";
import type { KeyValueParam } from "@/types/app-instance";

interface OIDCConfigFieldsProps {
  values: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    scopes: string;
    customAuthParams: KeyValueParam[];
    pkceMode: "S256" | "PLAIN" | "NONE";
    usePar: boolean;
  };
  onChange: (field: string, value: string | boolean) => void;
  onCustomParamsChange: (params: KeyValueParam[]) => void;
  errors?: Record<string, string>;
}

export function OIDCConfigFields({
  values,
  onChange,
  onCustomParamsChange,
  errors = {},
}: OIDCConfigFieldsProps) {
  const isInsecure =
    values.issuerUrl.startsWith("http://");

  return (
    <div className="space-y-4">
      <Input
        label="Issuer URL"
        placeholder="https://accounts.google.com"
        value={values.issuerUrl}
        onChange={(e) => onChange("issuerUrl", e.target.value)}
        error={errors.issuerUrl}
        helperText="The OpenID Connect discovery endpoint base URL"
      />
      {isInsecure && (
        <div className="alert-warning rounded-lg px-3 py-2">
          <p className="text-xs font-medium">
            Insecure issuer URL: using plain HTTP exposes client credentials and
            tokens to network interception. Only use HTTP for local development.
          </p>
        </div>
      )}
      <Input
        label="Client ID"
        placeholder="your-client-id"
        value={values.clientId}
        onChange={(e) => onChange("clientId", e.target.value)}
        error={errors.clientId}
      />
      <Input
        label="Client Secret"
        type="password"
        placeholder="your-client-secret"
        value={values.clientSecret}
        onChange={(e) => onChange("clientSecret", e.target.value)}
        error={errors.clientSecret}
      />
      <Input
        label="Scopes"
        placeholder="openid profile email"
        value={values.scopes}
        onChange={(e) => onChange("scopes", e.target.value)}
        error={errors.scopes}
        helperText="Space-separated list of OIDC scopes"
      />
      <div className="space-y-1.5">
        <label htmlFor="oidc-pkce-mode" className="block text-sm font-medium text-[var(--text)]">
          PKCE Mode
        </label>
        <select
          id="oidc-pkce-mode"
          name="pkceMode"
          value={values.pkceMode}
          onChange={(event) => onChange("pkceMode", event.target.value)}
          className="focus-ring h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
        >
          <option value="S256">S256 (recommended)</option>
          <option value="PLAIN">plain (legacy / testing only)</option>
          <option value="NONE">disabled (legacy / testing only)</option>
        </select>
        <p className="text-xs text-[var(--muted)]">
          Use `plain` or disabled PKCE only when reproducing legacy client or IdP behavior.
        </p>
      </div>
      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text)]">
          Advanced OIDC defaults
        </summary>
        <div className="mt-3">
          <label className="mb-3 flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
            <div className="space-y-0.5">
              <span className="font-medium">Use Pushed Authorization Requests (PAR)</span>
              <p className="text-xs text-[var(--muted)]">
                Post the authorization payload to the provider first, then redirect with a
                `request_uri`.
              </p>
            </div>
            <input
              type="checkbox"
              checked={values.usePar}
              onChange={(event) => onChange("usePar", event.target.checked)}
            />
          </label>
          <KeyValueEditor
            label="Saved authorization parameters"
            values={values.customAuthParams}
            onChange={onCustomParamsChange}
            helperText="Saved parameters are merged into every OIDC authorization request unless a runtime override replaces them."
          />
          {errors.customAuthParams && (
            <p className="mt-2 text-sm text-red-500">{errors.customAuthParams}</p>
          )}
        </div>
      </details>
    </div>
  );
}
