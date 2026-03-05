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
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Import IdP Metadata</h3>

        <div className="mb-3 inline-flex overflow-hidden rounded-xl border border-[var(--border)]">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm ${source === "xml" ? "bg-[var(--surface)] font-medium text-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}
            onClick={() => setSource("xml")}
          >
            XML
          </button>
          <button
            type="button"
            className={`border-l border-[var(--border)] px-3 py-1.5 text-sm ${source === "url" ? "bg-[var(--surface)] font-medium text-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}
            onClick={() => setSource("url")}
          >
            URL
          </button>
        </div>

        {source === "xml" && (
          <div className="space-y-2">
            <textarea
              className="focus-ring block w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text)] shadow-[var(--shadow-xs)] placeholder:text-[var(--muted)]"
              rows={6}
              value={xmlInput}
              onChange={(e) => setXmlInput(e.target.value)}
              placeholder="<EntityDescriptor ...>...</EntityDescriptor>"
            />
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
              className="text-sm text-[var(--muted)]"
            />
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

        {parseError && <p className="mt-3 text-sm text-red-500">{parseError}</p>}

        {parsedMetadata && (
          <div className="mt-4 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-sm font-semibold text-[var(--text)]">Parsed Metadata Preview</p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-[var(--muted)]">IdP Entity ID</dt>
                <dd className="break-all font-mono text-[var(--text)]">
                  {parsedMetadata.idpEntityId || "Not present in metadata"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">SSO Binding</dt>
                <dd className="break-all font-mono text-[var(--text)]">{parsedMetadata.binding}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">SSO Entry Point</dt>
                <dd className="break-all font-mono text-[var(--text)]">{parsedMetadata.entryPoint}</dd>
              </div>
            </dl>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
              <p className="mb-1 text-xs text-[var(--muted)]">Certificate (PEM)</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs text-[var(--text)]">
                {parsedMetadata.idpCert}
              </pre>
              <CopyButton text={parsedMetadata.idpCert} className="mt-2" />
            </div>

            {parsedMetadata.warnings.length > 0 && (
              <div className="alert-warning rounded-lg px-3 py-2">
                <p className="mb-1 text-xs font-medium">Warnings</p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {parsedMetadata.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={applyEntryPoint}
                  onChange={(e) => setApplyEntryPoint(e.target.checked)}
                />
                Apply SSO Entry Point URL
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={applyIdpCert}
                  onChange={(e) => setApplyIdpCert(e.target.checked)}
                />
                Apply IdP Certificate
              </label>
            </div>

            <Button type="button" variant="primary" onClick={handleApplyParsedValues}>
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
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-[var(--text)]">IdP Certificate (PEM)</label>
        <textarea
          className={`focus-ring block w-full rounded-xl border bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text)] shadow-[var(--shadow-xs)] placeholder:text-[var(--muted)] ${errors.idpCert ? "border-red-400" : "border-[var(--border)]"}`}
          rows={6}
          placeholder={idpCertPlaceholder}
          value={values.idpCert}
          onChange={(e) => onChange("idpCert", e.target.value)}
        />
        {errors.idpCert && <p className="text-sm text-red-500">{errors.idpCert}</p>}
        <p className="text-sm text-[var(--muted)]">
          The IdP&apos;s public X.509 certificate in PEM format
        </p>
      </div>
    </div>
  );
}
