"use client";

import { Input } from "@/components/ui/Input";

interface SAMLConfigFieldsProps {
  values: {
    entryPoint: string;
    issuer: string;
    idpCert: string;
  };
  onChange: (field: string, value: string) => void;
  errors?: Record<string, string>;
}

export function SAMLConfigFields({
  values,
  onChange,
  errors = {},
}: SAMLConfigFieldsProps) {
  return (
    <div className="space-y-4">
      <Input
        label="SSO Entry Point URL"
        placeholder="https://idp.example.com/sso/saml"
        value={values.entryPoint}
        onChange={(e) => onChange("entryPoint", e.target.value)}
        error={errors.entryPoint}
        helperText="Identity Provider Single Sign-On URL"
      />
      <Input
        label="Issuer (SP Entity ID)"
        placeholder="https://your-app.com"
        value={values.issuer}
        onChange={(e) => onChange("issuer", e.target.value)}
        error={errors.issuer}
        helperText="Your Service Provider Entity ID"
      />
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          IdP Certificate (PEM)
        </label>
        <textarea
          className={`block w-full rounded-lg border px-3 py-2 text-sm font-mono shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary ${
            errors.idpCert ? "border-red-300" : "border-gray-300"
          }`}
          rows={6}
          placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
          value={values.idpCert}
          onChange={(e) => onChange("idpCert", e.target.value)}
        />
        {errors.idpCert && (
          <p className="text-sm text-red-600">{errors.idpCert}</p>
        )}
        <p className="text-sm text-gray-500">
          The IDP&apos;s public X.509 certificate in PEM format
        </p>
      </div>
    </div>
  );
}
