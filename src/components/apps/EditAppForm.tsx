"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
    entryPoint: app.entryPoint || "",
    issuer: app.issuer || "",
    idpCert: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body: Record<string, string> = {
      name: formData.name,
      slug: formData.slug,
      buttonColor: formData.buttonColor,
    };

    if (app.protocol === "OIDC") {
      body.issuerUrl = formData.issuerUrl;
      body.clientId = formData.clientId;
      if (formData.clientSecret) body.clientSecret = formData.clientSecret;
      body.scopes = formData.scopes;
    } else {
      body.entryPoint = formData.entryPoint;
      body.issuer = formData.issuer;
      if (formData.idpCert) body.idpCert = formData.idpCert;
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
          <>
            <Input
              label="Issuer URL"
              value={formData.issuerUrl}
              onChange={(e) => updateField("issuerUrl", e.target.value)}
            />
            <Input
              label="Client ID"
              value={formData.clientId}
              onChange={(e) => updateField("clientId", e.target.value)}
            />
            <Input
              label="Client Secret"
              type="password"
              value={formData.clientSecret}
              onChange={(e) => updateField("clientSecret", e.target.value)}
              helperText={
                app.hasClientSecret
                  ? "Leave blank to keep existing secret"
                  : "Enter client secret"
              }
            />
            <Input
              label="Scopes"
              value={formData.scopes}
              onChange={(e) => updateField("scopes", e.target.value)}
            />
          </>
        )}

        {app.protocol === "SAML" && (
          <SAMLConfigFields
            values={{
              entryPoint: formData.entryPoint,
              issuer: formData.issuer,
              idpCert: formData.idpCert,
            }}
            onChange={updateField}
            idpCertPlaceholder={
              app.hasIdpCert
                ? "Leave blank to keep existing certificate"
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
