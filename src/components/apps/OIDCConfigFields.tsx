"use client";

import { Input } from "@/components/ui/Input";

interface OIDCConfigFieldsProps {
  values: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    scopes: string;
  };
  onChange: (field: string, value: string) => void;
  errors?: Record<string, string>;
}

export function OIDCConfigFields({
  values,
  onChange,
  errors = {},
}: OIDCConfigFieldsProps) {
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
    </div>
  );
}
