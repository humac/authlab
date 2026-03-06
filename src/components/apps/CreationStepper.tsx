"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "@/components/ui/Stepper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { OIDCConfigFields } from "./OIDCConfigFields";
import { SAMLConfigFields } from "./SAMLConfigFields";

const STEPS = [
  { label: "Protocol" },
  { label: "Customize" },
  { label: "Configure" },
  { label: "Review" },
];

interface FormData {
  protocol: "OIDC" | "SAML" | "";
  name: string;
  slug: string;
  buttonColor: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  entryPoint: string;
  issuer: string;
  idpCert: string;
}

const initialFormData: FormData = {
  protocol: "",
  name: "",
  slug: "",
  buttonColor: "#3B71CA",
  issuerUrl: "",
  clientId: "",
  clientSecret: "",
  scopes: "openid profile email",
  entryPoint: "",
  issuer: "",
  idpCert: "",
};

export function CreationStepper() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [appUrl, setAppUrl] = useState(
    (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, ""),
  );

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const autoSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin.replace(/\/+$/, ""));
    }
  }, []);

  const displaySlug = formData.slug || "your-slug";
  const testUrl = `${appUrl}/test/${displaySlug}`;
  const oidcCallbackUrl = `${appUrl}/api/auth/callback/oidc/${displaySlug}`;
  const samlCallbackUrl = `${appUrl}/api/auth/callback/saml/${displaySlug}`;
  const samlMetadataUrl = `${appUrl}/api/saml/metadata/${displaySlug}`;
  const testLoginUrl = `${appUrl}/test/${displaySlug}/login`;
  const testInspectorUrl = `${appUrl}/test/${displaySlug}/inspector`;

  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 0 && !formData.protocol) {
      newErrors.protocol = "Select a protocol";
    }

    if (step === 1) {
      if (!formData.name) newErrors.name = "Required";
      if (!formData.slug) newErrors.slug = "Required";
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formData.slug)) {
        newErrors.slug = "Must be lowercase alphanumeric with hyphens";
      }
    }

    if (step === 2) {
      if (formData.protocol === "OIDC") {
        if (!formData.issuerUrl) newErrors.issuerUrl = "Required";
        if (!formData.clientId) newErrors.clientId = "Required";
        if (!formData.clientSecret) newErrors.clientSecret = "Required";
      } else {
        if (!formData.entryPoint) newErrors.entryPoint = "Required";
        if (!formData.issuer) newErrors.issuer = "Required";
        if (!formData.idpCert) newErrors.idpCert = "Required";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((s) => s + 1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: formData.name,
        slug: formData.slug,
        protocol: formData.protocol,
        buttonColor: formData.buttonColor,
      };

      if (formData.protocol === "OIDC") {
        body.issuerUrl = formData.issuerUrl;
        body.clientId = formData.clientId;
        body.clientSecret = formData.clientSecret;
        body.scopes = formData.scopes || "openid profile email";
      } else {
        body.entryPoint = formData.entryPoint;
        body.issuer = formData.issuer;
        body.idpCert = formData.idpCert;
      }

      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setErrors({ submit: data.error || "Failed to create app" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl animate-enter">
      <Stepper steps={STEPS} currentStep={step} />

      <Card>
        {step === 0 && (
          <div>
            <h2 className="mb-1 text-xl font-semibold tracking-tight text-[var(--text)]">Choose Protocol</h2>
            <p className="mb-5 text-sm text-[var(--muted)]">Pick the identity protocol you want to test.</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(["OIDC", "SAML"] as const).map((proto) => (
                <button
                  key={proto}
                  onClick={() => updateField("protocol", proto)}
                  className={`focus-ring rounded-2xl border-2 p-5 text-left transition-colors ${
                    formData.protocol === proto
                      ? "border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_9%,transparent)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <Badge variant={proto.toLowerCase() as "oidc" | "saml"} />
                  <h3 className="mt-3 font-semibold text-[var(--text)]">
                    {proto === "OIDC" ? "OpenID Connect" : "SAML 2.0"}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {proto === "OIDC"
                      ? "OAuth-based identity protocol with JWT tokens"
                      : "XML-based enterprise single sign-on protocol"}
                  </p>
                </button>
              ))}
            </div>
            {errors.protocol && <p className="mt-2 text-sm text-red-500">{errors.protocol}</p>}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--text)]">Customize</h2>
            <div className="space-y-4">
              <Input
                label="App Name"
                placeholder="Okta Production Test"
                value={formData.name}
                onChange={(e) => {
                  updateField("name", e.target.value);
                  if (!formData.slug || formData.slug === autoSlug(formData.name)) {
                    updateField("slug", autoSlug(e.target.value));
                  }
                }}
                error={errors.name}
              />
              <Input
                label="URL Slug"
                placeholder="okta-prod"
                value={formData.slug}
                onChange={(e) => updateField("slug", e.target.value)}
                error={errors.slug}
                helperText={`Test URL: ${testUrl}`}
              />
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

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text)]">Important URLs</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Configure these values in your identity provider.
                </p>
                <dl className="mt-3 space-y-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Test URL</dt>
                    <dd className="mt-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                      {testUrl}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Test Login URL</dt>
                    <dd className="mt-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                      {testLoginUrl}
                    </dd>
                  </div>
                  {formData.protocol === "OIDC" ? (
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">OIDC Redirect URI</dt>
                      <dd className="mt-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                        {oidcCallbackUrl}
                      </dd>
                    </div>
                  ) : (
                    <>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">SAML ACS URL (Callback)</dt>
                        <dd className="mt-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                          {samlCallbackUrl}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">SAML SP Metadata URL</dt>
                        <dd className="mt-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                          {samlMetadataUrl}
                        </dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Inspector URL (after successful login)</dt>
                    <dd className="mt-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                      {testInspectorUrl}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {step === 2 && formData.protocol === "OIDC" && (
          <div>
            <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--text)]">OIDC Configuration</h2>
            <OIDCConfigFields
              values={{
                issuerUrl: formData.issuerUrl,
                clientId: formData.clientId,
                clientSecret: formData.clientSecret,
                scopes: formData.scopes,
              }}
              onChange={updateField}
              errors={errors}
            />
          </div>
        )}
        {step === 2 && formData.protocol === "SAML" && (
          <div>
            <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--text)]">SAML Configuration</h2>
            <SAMLConfigFields
              values={{
                entryPoint: formData.entryPoint,
                issuer: formData.issuer,
                idpCert: formData.idpCert,
              }}
              onChange={updateField}
              errors={errors}
            />
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--text)]">Review</h2>
            <dl className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <dt className="text-sm text-[var(--muted)]">Protocol</dt>
                <dd>
                  <Badge variant={formData.protocol.toLowerCase() as "oidc" | "saml"} />
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <dt className="text-sm text-[var(--muted)]">Name</dt>
                <dd className="text-sm font-medium text-[var(--text)]">{formData.name}</dd>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <dt className="text-sm text-[var(--muted)]">Slug</dt>
                <dd className="font-mono text-sm text-[var(--text)]">/{formData.slug}</dd>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <dt className="text-sm text-[var(--muted)]">Button color</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full border border-[var(--border)]"
                    style={{ backgroundColor: formData.buttonColor }}
                  />
                  <span className="font-mono text-sm text-[var(--text)]">{formData.buttonColor}</span>
                </dd>
              </div>
            </dl>
            {errors.submit && (
              <p className="mt-3 text-sm text-red-500">{errors.submit}</p>
            )}
          </div>
        )}

        <div
          className={`mt-8 flex border-t border-[var(--border)] pt-5 ${
            step === 0 ? "justify-end" : "justify-between"
          }`}
        >
          {step > 0 && (
            <Button
              variant="secondary"
              onClick={() => setStep((s) => s - 1)}
              disabled={submitting}
            >
              Back
            </Button>
          )}

          {step < 3 ? (
            <Button onClick={handleNext}>Continue</Button>
          ) : (
            <Button onClick={handleSubmit} loading={submitting}>
              Create App Instance
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
