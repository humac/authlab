"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { OIDCConfigFields } from "./OIDCConfigFields";
import { SAMLConfigFields } from "./SAMLConfigFields";
import type { RedactedAppInstance } from "@/types/app-instance";

interface EditAppFormProps {
  app: RedactedAppInstance;
}

export function EditAppForm({ app }: EditAppFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: app.name,
    slug: app.slug,
    buttonColor: app.buttonColor || "#3B71CA",
    issuerUrl: app.issuerUrl || "",
    clientId: app.clientId || "",
    clientSecret: "",
    scopes: app.scopes || "openid profile email",
    customAuthParams: app.customAuthParams,
    pkceMode: app.pkceMode,
    entryPoint: app.entryPoint || "",
    samlLogoutUrl: app.samlLogoutUrl || "",
    issuer: app.issuer || "",
    idpCert: "",
    nameIdFormat: app.nameIdFormat || "",
    requestedAuthnContext: app.requestedAuthnContext || "",
    forceAuthnDefault: app.forceAuthnDefault,
    isPassiveDefault: app.isPassiveDefault,
    samlSignatureAlgorithm: app.samlSignatureAlgorithm,
    clockSkewToleranceSeconds: String(app.clockSkewToleranceSeconds),
    signAuthnRequests: app.signAuthnRequests,
    spSigningPrivateKey: "",
    spSigningCert: "",
    spEncryptionPrivateKey: "",
    spEncryptionCert: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field: string, value: string | boolean | typeof formData.customAuthParams) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      name: formData.name,
      slug: formData.slug,
      buttonColor: formData.buttonColor,
    };

    if (app.protocol === "OIDC") {
      body.issuerUrl = formData.issuerUrl;
      body.clientId = formData.clientId;
      if (formData.clientSecret) body.clientSecret = formData.clientSecret;
      body.scopes = formData.scopes;
      body.customAuthParams = formData.customAuthParams.filter((entry) => entry.key.trim());
      body.pkceMode = formData.pkceMode;
    } else {
      body.entryPoint = formData.entryPoint;
      body.samlLogoutUrl = formData.samlLogoutUrl || null;
      body.issuer = formData.issuer;
      if (formData.idpCert) body.idpCert = formData.idpCert;
      body.nameIdFormat = formData.nameIdFormat || null;
      body.requestedAuthnContext = formData.requestedAuthnContext || null;
      body.forceAuthnDefault = formData.forceAuthnDefault;
      body.isPassiveDefault = formData.isPassiveDefault;
      body.samlSignatureAlgorithm = formData.samlSignatureAlgorithm;
      body.clockSkewToleranceSeconds =
        Number.parseInt(formData.clockSkewToleranceSeconds || "0", 10) || 0;
      body.signAuthnRequests = formData.signAuthnRequests;
      if (formData.spSigningPrivateKey) {
        body.spSigningPrivateKey = formData.spSigningPrivateKey;
      }
      if (formData.spSigningCert) {
        body.spSigningCert = formData.spSigningCert;
      }
      if (formData.spEncryptionPrivateKey) {
        body.spEncryptionPrivateKey = formData.spEncryptionPrivateKey;
      }
      if (formData.spEncryptionCert) {
        body.spEncryptionCert = formData.spEncryptionCert;
      }
    }

    try {
      const res = await fetch(`/api/apps/${app.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} />
          <span className="text-sm text-[var(--muted)]">Protocol cannot be changed</span>
        </div>

        <Input
          label="App Name"
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
        />
        <Input
          label="URL Slug"
          value={formData.slug}
          onChange={(e) => updateField("slug", e.target.value)}
          helperText={`Test URL: /test/${formData.slug}`}
        />

        {app.protocol === "OIDC" && (
          <OIDCConfigFields
            values={{
              issuerUrl: formData.issuerUrl,
              clientId: formData.clientId,
              clientSecret: formData.clientSecret,
              scopes: formData.scopes,
              customAuthParams: formData.customAuthParams,
              pkceMode: formData.pkceMode,
            }}
            onChange={(field, value) => updateField(field, value)}
            onCustomParamsChange={(params) => updateField("customAuthParams", params)}
          />
        )}

        {app.protocol === "SAML" && (
          <SAMLConfigFields
            values={{
              entryPoint: formData.entryPoint,
              samlLogoutUrl: formData.samlLogoutUrl,
              issuer: formData.issuer,
              idpCert: formData.idpCert,
              nameIdFormat: formData.nameIdFormat,
              requestedAuthnContext: formData.requestedAuthnContext,
              forceAuthnDefault: formData.forceAuthnDefault,
              isPassiveDefault: formData.isPassiveDefault,
              samlSignatureAlgorithm: formData.samlSignatureAlgorithm,
              clockSkewToleranceSeconds: formData.clockSkewToleranceSeconds,
              signAuthnRequests: formData.signAuthnRequests,
              spSigningPrivateKey: formData.spSigningPrivateKey,
              spSigningCert: formData.spSigningCert,
              spEncryptionPrivateKey: formData.spEncryptionPrivateKey,
              spEncryptionCert: formData.spEncryptionCert,
            }}
            generationContext={{
              name: formData.name,
              slug: formData.slug,
              hasStoredSigningMaterial: app.hasSpSigningPrivateKey || app.hasSpSigningCert,
              hasStoredEncryptionMaterial:
                app.hasSpEncryptionPrivateKey || app.hasSpEncryptionCert,
            }}
            onChange={(field, value) => {
              if (
                field === "forceAuthnDefault" ||
                field === "isPassiveDefault" ||
                field === "signAuthnRequests"
              ) {
                updateField(field, value === "true");
                return;
              }
              updateField(field, value);
            }}
            idpCertPlaceholder={
              app.hasIdpCert
                ? "Leave blank to keep existing certificate"
                : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
            }
            signingKeyPlaceholder={
              app.hasSpSigningPrivateKey
                ? "Leave blank to keep existing signing private key"
                : "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
            }
            signingCertPlaceholder={
              app.hasSpSigningCert
                ? "Leave blank to keep existing signing certificate"
                : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
            }
            encryptionKeyPlaceholder={
              app.hasSpEncryptionPrivateKey
                ? "Leave blank to keep existing encryption private key"
                : "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
            }
            encryptionCertPlaceholder={
              app.hasSpEncryptionCert
                ? "Leave blank to keep existing encryption certificate"
                : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
            }
          />
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text)]">Button Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={formData.buttonColor}
              onChange={(e) => updateField("buttonColor", e.target.value)}
              className="h-10 w-10 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent"
            />
            <span className="font-mono text-sm text-[var(--muted)]">{formData.buttonColor}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 pt-4">
          <Button type="submit" loading={saving}>
            Save Changes
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
