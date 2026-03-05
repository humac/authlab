"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";

interface SAMLConfigFieldsProps {
  values: {
    entryPoint: string;
    issuer: string;
    idpCert: string;
  };
  onChange: (field: string, value: string) => void;
  errors?: Record<string, string>;
  idpCertPlaceholder?: string;
}

interface ParsedMetadata {
  entryPoint: string;
  idpCert: string;
  idpEntityId: string | null;
  binding: string;
  warnings: string[];
}

export function SAMLConfigFields({
  values,
  onChange,
  errors = {},
  idpCertPlaceholder = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
}: SAMLConfigFieldsProps) {
  const [source, setSource] = useState<"xml" | "url">("xml");
  const [xmlInput, setXmlInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parsedMetadata, setParsedMetadata] = useState<ParsedMetadata | null>(null);
  const [applyEntryPoint, setApplyEntryPoint] = useState(true);
  const [applyIdpCert, setApplyIdpCert] = useState(true);

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setXmlInput(text);
    setSource("xml");
  };

  const handleParseMetadata = async () => {
    setParseError("");
    setParsedMetadata(null);
    setParsing(true);

    const body =
      source === "xml"
        ? { source: "xml", xml: xmlInput }
        : { source: "url", url: urlInput };

    try {
      const response = await fetch("/api/saml/metadata/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setParseError(data?.error || "Failed to parse metadata.");
        return;
      }

      setParsedMetadata(data as ParsedMetadata);
      setApplyEntryPoint(true);
      setApplyIdpCert(true);
    } catch {
      setParseError("Failed to parse metadata.");
    } finally {
      setParsing(false);
    }
  };

  const handleApplyParsedValues = () => {
    if (!parsedMetadata) return;
    if (applyEntryPoint) {
      onChange("entryPoint", parsedMetadata.entryPoint);
    }
    if (applyIdpCert) {
      onChange("idpCert", parsedMetadata.idpCert);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/60">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Import IdP Metadata
        </h3>

        <div className="inline-flex rounded-lg border border-gray-200 mb-3 overflow-hidden">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm ${source === "xml" ? "bg-white font-medium" : "bg-gray-100 text-gray-600"}`}
            onClick={() => setSource("xml")}
          >
            XML
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm border-l border-gray-200 ${source === "url" ? "bg-white font-medium" : "bg-gray-100 text-gray-600"}`}
            onClick={() => setSource("url")}
          >
            URL
          </button>
        </div>

        {source === "xml" && (
          <div className="space-y-2">
            <textarea
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              rows={6}
              value={xmlInput}
              onChange={(e) => setXmlInput(e.target.value)}
              placeholder="<EntityDescriptor ...>...</EntityDescriptor>"
            />
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
                className="text-sm text-gray-600"
              />
            </div>
          </div>
        )}

        {source === "url" && (
          <Input
            label="Metadata URL"
            placeholder="https://idp.example.com/metadata"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            helperText="Only public HTTPS metadata URLs are allowed"
          />
        )}

        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleParseMetadata}
            loading={parsing}
          >
            Parse Metadata
          </Button>
        </div>

        {parseError && (
          <p className="text-sm text-red-600 mt-3">{parseError}</p>
        )}

        {parsedMetadata && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 space-y-3">
            <p className="text-sm font-semibold text-gray-900">
              Parsed Metadata Preview
            </p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">IdP Entity ID</dt>
                <dd className="font-mono break-all">
                  {parsedMetadata.idpEntityId || "Not present in metadata"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">SSO Binding</dt>
                <dd className="font-mono break-all">{parsedMetadata.binding}</dd>
              </div>
              <div>
                <dt className="text-gray-500">SSO Entry Point</dt>
                <dd className="font-mono break-all">{parsedMetadata.entryPoint}</dd>
              </div>
            </dl>

            <div className="rounded-md border border-gray-100 bg-gray-50 p-2">
              <p className="text-xs text-gray-500 mb-1">Certificate (PEM)</p>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                {parsedMetadata.idpCert}
              </pre>
              <CopyButton text={parsedMetadata.idpCert} className="mt-2" />
            </div>

            {parsedMetadata.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-medium text-amber-800 mb-1">Warnings</p>
                <ul className="text-xs text-amber-800 list-disc list-inside">
                  {parsedMetadata.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={applyEntryPoint}
                  onChange={(e) => setApplyEntryPoint(e.target.checked)}
                />
                Apply SSO Entry Point URL
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={applyIdpCert}
                  onChange={(e) => setApplyIdpCert(e.target.checked)}
                />
                Apply IdP Certificate
              </label>
            </div>

            <Button
              type="button"
              variant="primary"
              onClick={handleApplyParsedValues}
            >
              Apply Selected Values
            </Button>
          </div>
        )}
      </div>

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
          placeholder={idpCertPlaceholder}
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
