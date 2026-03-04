"use client";

import { useState } from "react";
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
  { label: "Configure" },
  { label: "Customize" },
  { label: "Review" },
];

interface FormData {
  protocol: "OIDC" | "SAML" | "";
  name: string;
  slug: string;
  buttonColor: string;
  // OIDC
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  // SAML
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

  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 0 && !formData.protocol) {
      newErrors.protocol = "Select a protocol";
    }

    if (step === 1) {
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

    if (step === 2) {
      if (!formData.name) newErrors.name = "Required";
      if (!formData.slug) newErrors.slug = "Required";
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formData.slug)) {
        newErrors.slug = "Must be lowercase alphanumeric with hyphens";
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
    <div className="max-w-2xl mx-auto">
      <Stepper steps={STEPS} currentStep={step} />

      <Card>
        {/* Step 0: Protocol */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Choose Protocol</h2>
            <div className="grid grid-cols-2 gap-4">
              {(["OIDC", "SAML"] as const).map((proto) => (
                <button
                  key={proto}
                  onClick={() => updateField("protocol", proto)}
                  className={`p-6 rounded-lg border-2 text-left transition-all ${
                    formData.protocol === proto
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Badge variant={proto.toLowerCase() as "oidc" | "saml"} />
                  <h3 className="font-semibold mt-3">
                    {proto === "OIDC"
                      ? "OpenID Connect"
                      : "SAML 2.0"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {proto === "OIDC"
                      ? "OAuth 2.0-based identity protocol with JWT tokens"
                      : "XML-based single sign-on protocol"}
                  </p>
                </button>
              ))}
            </div>
            {errors.protocol && (
              <p className="text-sm text-red-600 mt-2">{errors.protocol}</p>
            )}
          </div>
        )}

        {/* Step 1: Configuration */}
        {step === 1 && formData.protocol === "OIDC" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">OIDC Configuration</h2>
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
        {step === 1 && formData.protocol === "SAML" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">SAML Configuration</h2>
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

        {/* Step 2: Customize */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Customize</h2>
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
                helperText={`Test URL: /test/${formData.slug || "your-slug"}`}
              />
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
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Review</h2>
            <dl className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-sm text-gray-500">Protocol</dt>
                <dd>
                  <Badge variant={formData.protocol.toLowerCase() as "oidc" | "saml"} />
                </dd>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-sm text-gray-500">Name</dt>
                <dd className="text-sm font-medium">{formData.name}</dd>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-sm text-gray-500">Slug</dt>
                <dd className="text-sm font-mono">{formData.slug}</dd>
              </div>
              {formData.protocol === "OIDC" ? (
                <>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <dt className="text-sm text-gray-500">Issuer URL</dt>
                    <dd className="text-sm font-mono truncate ml-4 max-w-xs">
                      {formData.issuerUrl}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <dt className="text-sm text-gray-500">Client ID</dt>
                    <dd className="text-sm font-mono truncate ml-4 max-w-xs">
                      {formData.clientId}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <dt className="text-sm text-gray-500">Scopes</dt>
                    <dd className="text-sm">{formData.scopes}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <dt className="text-sm text-gray-500">Entry Point</dt>
                    <dd className="text-sm font-mono truncate ml-4 max-w-xs">
                      {formData.entryPoint}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <dt className="text-sm text-gray-500">Issuer</dt>
                    <dd className="text-sm font-mono truncate ml-4 max-w-xs">
                      {formData.issuer}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex justify-between py-2">
                <dt className="text-sm text-gray-500">Button Color</dt>
                <dd className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{ backgroundColor: formData.buttonColor }}
                  />
                  <span className="text-sm font-mono">
                    {formData.buttonColor}
                  </span>
                </dd>
              </div>
            </dl>
            {errors.submit && (
              <p className="text-sm text-red-600 mt-4">{errors.submit}</p>
            )}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
          <Button
            variant="secondary"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            Back
          </Button>
          {step < 3 ? (
            <Button onClick={handleNext}>Next</Button>
          ) : (
            <Button onClick={handleSubmit} loading={submitting}>
              Create App
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
