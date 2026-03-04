"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
        <div className="flex items-center gap-2 mb-4">
          <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} />
          <span className="text-sm text-gray-500">
            Protocol cannot be changed
          </span>
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
          <>
            <Input
              label="SSO Entry Point URL"
              value={formData.entryPoint}
              onChange={(e) => updateField("entryPoint", e.target.value)}
            />
            <Input
              label="Issuer (SP Entity ID)"
              value={formData.issuer}
              onChange={(e) => updateField("issuer", e.target.value)}
            />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                IdP Certificate (PEM)
              </label>
              <textarea
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                rows={6}
                value={formData.idpCert}
                onChange={(e) => updateField("idpCert", e.target.value)}
                placeholder={
                  app.hasIdpCert
                    ? "Leave blank to keep existing certificate"
                    : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
                }
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Button Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={formData.buttonColor}
              onChange={(e) => updateField("buttonColor", e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-gray-300"
            />
            <span className="text-sm text-gray-500 font-mono">
              {formData.buttonColor}
            </span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

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
