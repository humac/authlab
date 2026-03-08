"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Select } from "@/components/ui/Select";

interface SAMLConfigFieldsProps {
  values: {
    entryPoint: string;
    samlLogoutUrl: string;
    issuer: string;
    idpCert: string;
    nameIdFormat: string;
    requestedAuthnContext: string;
    forceAuthnDefault: boolean;
    isPassiveDefault: boolean;
    samlSignatureAlgorithm: "SHA1" | "SHA256";
    clockSkewToleranceSeconds: string;
    signAuthnRequests: boolean;
    spSigningPrivateKey: string;
    spSigningCert: string;
    spEncryptionPrivateKey: string;
    spEncryptionCert: string;
  };
  onChange: (field: string, value: string) => void;
  errors?: Record<string, string>;
  idpCertPlaceholder?: string;
  signingKeyPlaceholder?: string;
  signingCertPlaceholder?: string;
  encryptionKeyPlaceholder?: string;
  encryptionCertPlaceholder?: string;
  generationContext?: {
    name?: string;
    slug?: string;
    hasStoredSigningMaterial?: boolean;
    hasStoredEncryptionMaterial?: boolean;
  };
}

interface ParsedMetadata {
  entryPoint: string;
  idpCert: string;
  idpEntityId: string | null;
  binding: string;
  warnings: string[];
}

interface GeneratedSigningInfo {
  usage?: "signing" | "encryption";
  commonName: string;
  subject: string;
  validFrom: string;
  validTo: string;
  fingerprint256: string;
}

export function SAMLConfigFields({
  values,
  onChange,
  errors = {},
  idpCertPlaceholder = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  signingKeyPlaceholder = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
  signingCertPlaceholder = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  encryptionKeyPlaceholder = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
  encryptionCertPlaceholder = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  generationContext,
}: SAMLConfigFieldsProps) {
  const [source, setSource] = useState<"xml" | "url">("xml");
  const [xmlInput, setXmlInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parsedMetadata, setParsedMetadata] = useState<ParsedMetadata | null>(null);
  const [applyEntryPoint, setApplyEntryPoint] = useState(true);
  const [applyIdpCert, setApplyIdpCert] = useState(true);
  const [generatingSigningMaterial, setGeneratingSigningMaterial] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [generatedInfo, setGeneratedInfo] = useState<GeneratedSigningInfo | null>(null);
  const [generatingEncryptionMaterial, setGeneratingEncryptionMaterial] = useState(false);
  const [encryptionGenerationError, setEncryptionGenerationError] = useState("");
  const [generatedEncryptionInfo, setGeneratedEncryptionInfo] =
    useState<GeneratedSigningInfo | null>(null);

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

  const handleGenerateSigningMaterial = async () => {
    const hasExistingMaterial =
      generationContext?.hasStoredSigningMaterial ||
      values.spSigningPrivateKey.trim().length > 0 ||
      values.spSigningCert.trim().length > 0;

    if (
      hasExistingMaterial &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Generating a new test keypair will replace the current signing material in this form. Continue?",
      )
    ) {
      return;
    }

    setGeneratingSigningMaterial(true);
    setGenerationError("");

    try {
      const response = await fetch("/api/saml/signing-material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generationContext?.name,
          slug: generationContext?.slug,
          usage: "signing",
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setGenerationError(data?.error || "Failed to generate test signing material.");
        return;
      }

      onChange("spSigningPrivateKey", String(data.privateKeyPem || ""));
      onChange("spSigningCert", String(data.certificatePem || ""));
      onChange("signAuthnRequests", "true");
      setGeneratedInfo(data.info as GeneratedSigningInfo);
    } catch {
      setGenerationError("Failed to generate test signing material.");
    } finally {
      setGeneratingSigningMaterial(false);
    }
  };

  const handleGenerateEncryptionMaterial = async () => {
    const hasExistingMaterial =
      generationContext?.hasStoredEncryptionMaterial ||
      values.spEncryptionPrivateKey.trim().length > 0 ||
      values.spEncryptionCert.trim().length > 0;

    if (
      hasExistingMaterial &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Generating a new test keypair will replace the current encryption material in this form. Continue?",
      )
    ) {
      return;
    }

    setGeneratingEncryptionMaterial(true);
    setEncryptionGenerationError("");

    try {
      const response = await fetch("/api/saml/signing-material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generationContext?.name,
          slug: generationContext?.slug,
          usage: "encryption",
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setEncryptionGenerationError(data?.error || "Failed to generate test encryption material.");
        return;
      }

      onChange("spEncryptionPrivateKey", String(data.privateKeyPem || ""));
      onChange("spEncryptionCert", String(data.certificatePem || ""));
      setGeneratedEncryptionInfo(data.info as GeneratedSigningInfo);
    } catch {
      setEncryptionGenerationError("Failed to generate test encryption material.");
    } finally {
      setGeneratingEncryptionMaterial(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Import IdP Metadata</h3>

        <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-[var(--border)]">
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
              className="focus-ring block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text)] shadow-[var(--shadow-xs)] placeholder:text-[var(--muted)]"
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
          <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
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
        label="Single Logout URL"
        placeholder="https://idp.example.com/logout/saml"
        value={values.samlLogoutUrl}
        onChange={(e) => onChange("samlLogoutUrl", e.target.value)}
        error={errors.samlLogoutUrl}
        helperText="Optional. Configure this to enable SP-initiated SAML single logout."
        uiSize="sm"
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
        <label htmlFor="saml-idp-cert" className="block text-sm font-medium text-[var(--text)]">
          IdP Certificate (PEM)
        </label>
        <textarea
          id="saml-idp-cert"
          className={`focus-ring block w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text)] shadow-[var(--shadow-xs)] placeholder:text-[var(--muted)] ${errors.idpCert ? "border-red-400" : "border-[var(--border)]"}`}
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

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text)]">
          Advanced SAML defaults
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Select
            label="NameID Format"
            value={values.nameIdFormat}
            onChange={(e) => onChange("nameIdFormat", e.target.value)}
            options={[
              { value: "", label: "Provider default" },
              { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified", label: "Unspecified" },
              { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress", label: "Email address" },
              { value: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent", label: "Persistent" },
              { value: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient", label: "Transient" },
              { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:X509SubjectName", label: "X509 Subject Name" },
            ]}
          />
          <Input
            label="Requested AuthnContextClassRef"
            placeholder="urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport"
            value={values.requestedAuthnContext}
            onChange={(e) => onChange("requestedAuthnContext", e.target.value)}
            helperText="Leave blank to omit RequestedAuthnContext from the AuthnRequest."
            uiSize="sm"
          />
          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Request behavior
            </p>
            <label className="flex items-center justify-between text-sm text-[var(--text)]">
              <span>ForceAuthn by default</span>
              <input
                type="checkbox"
                checked={values.forceAuthnDefault}
                onChange={(e) => onChange("forceAuthnDefault", String(e.target.checked))}
              />
            </label>
            <label className="flex items-center justify-between text-sm text-[var(--text)]">
              <span>IsPassive by default</span>
              <input
                type="checkbox"
                checked={values.isPassiveDefault}
                onChange={(e) => onChange("isPassiveDefault", String(e.target.checked))}
              />
            </label>
            <label className="flex items-center justify-between text-sm text-[var(--text)]">
              <span>Sign AuthN requests</span>
              <input
                type="checkbox"
                checked={values.signAuthnRequests}
                onChange={(e) => onChange("signAuthnRequests", String(e.target.checked))}
              />
            </label>
          </div>
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Validation and signing
            </p>
            <Select
              label="Signature algorithm"
              value={values.samlSignatureAlgorithm}
              onChange={(e) => onChange("samlSignatureAlgorithm", e.target.value)}
              options={[
                { value: "SHA256", label: "SHA-256" },
                { value: "SHA1", label: "SHA-1 (legacy)" },
              ]}
            />
            <Input
              label="Clock skew tolerance (seconds)"
              type="number"
              min="0"
              max="300"
              value={values.clockSkewToleranceSeconds}
              onChange={(e) => onChange("clockSkewToleranceSeconds", e.target.value)}
              helperText="Applied when validating NotBefore and NotOnOrAfter conditions. Recommended range: 0-300 seconds."
              uiSize="sm"
            />
            {values.samlSignatureAlgorithm === "SHA1" && (
              <div className="alert-warning rounded-lg px-3 py-2">
                <p className="text-xs font-medium">
                  SHA-1 is for legacy IdP compatibility only and should not be used unless the IdP requires it.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                  Test signing keypair
                </p>
                <p className="text-sm text-[var(--text)]">
                  Generate a self-signed certificate for IdP metadata import in test environments.
                </p>
                <p className="text-xs text-[var(--muted)]">
                  The generated private key is shown only in this form before save. Regenerating
                  requires re-importing your SP metadata or certificate in the IdP.
                </p>
              </div>
              <Button
                type="button"
                variant={generationContext?.hasStoredSigningMaterial ? "secondary" : "primary"}
                size="sm"
                loading={generatingSigningMaterial}
                onClick={handleGenerateSigningMaterial}
              >
                {generationContext?.hasStoredSigningMaterial ||
                values.spSigningPrivateKey.trim() ||
                values.spSigningCert.trim()
                  ? "Regenerate Test Keypair"
                  : "Generate Test Keypair"}
              </Button>
            </div>

            {generationError && <p className="mt-3 text-sm text-red-500">{generationError}</p>}

            {generatedInfo && (
              <dl className="mt-3 grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    Subject
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-[var(--text)]">
                    {generatedInfo.subject}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    Valid Until
                  </dt>
                  <dd className="mt-1 text-[var(--text)]">
                    {new Date(generatedInfo.validTo).toLocaleString()}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    SHA-256 Fingerprint
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-[var(--text)]">
                    {generatedInfo.fingerprint256}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="saml-sp-signing-private-key" className="block text-sm font-medium text-[var(--text)]">
              SP Signing Private Key
            </label>
            <textarea
              id="saml-sp-signing-private-key"
              className={`focus-ring block w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text)] shadow-[var(--shadow-xs)] placeholder:text-[var(--muted)] ${errors.spSigningPrivateKey ? "border-red-400" : "border-[var(--border)]"}`}
              rows={6}
              placeholder={signingKeyPlaceholder}
              value={values.spSigningPrivateKey}
              onChange={(e) => onChange("spSigningPrivateKey", e.target.value)}
            />
            {errors.spSigningPrivateKey && (
              <p className="text-sm text-red-500">{errors.spSigningPrivateKey}</p>
            )}
            {!errors.spSigningPrivateKey && (
              <p className="text-sm text-[var(--muted)]">
                Stored encrypted at rest. After save, the private key is no longer returned in API
                responses.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="saml-sp-signing-cert" className="block text-sm font-medium text-[var(--text)]">
              SP Signing Certificate
            </label>
            <textarea
              id="saml-sp-signing-cert"
              className={`focus-ring block w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text)] shadow-[var(--shadow-xs)] placeholder:text-[var(--muted)] ${errors.spSigningCert ? "border-red-400" : "border-[var(--border)]"}`}
              rows={6}
              placeholder={signingCertPlaceholder}
              value={values.spSigningCert}
              onChange={(e) => onChange("spSigningCert", e.target.value)}
            />
            {errors.spSigningCert && (
              <p className="text-sm text-red-500">{errors.spSigningCert}</p>
            )}
            {!errors.spSigningCert && (
              <p className="text-sm text-[var(--muted)]">
                Share this certificate or refreshed SP metadata with the IdP after regeneration.
              </p>
            )}
          </div>

          <div className="lg:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                  Assertion decryption keypair
                </p>
                <p className="text-sm text-[var(--text)]">
                  Generate a certificate the IdP can use to encrypt assertions for this service provider.
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Publish this certificate in SP metadata. The private key is retained write-only after save.
                </p>
              </div>
              <Button
                type="button"
                variant={generationContext?.hasStoredEncryptionMaterial ? "secondary" : "primary"}
                size="sm"
                loading={generatingEncryptionMaterial}
                onClick={handleGenerateEncryptionMaterial}
              >
                {generationContext?.hasStoredEncryptionMaterial ||
                values.spEncryptionPrivateKey.trim() ||
                values.spEncryptionCert.trim()
                  ? "Regenerate Encryption Keypair"
                  : "Generate Encryption Keypair"}
              </Button>
            </div>

            {encryptionGenerationError && (
              <p className="mt-3 text-sm text-red-500">{encryptionGenerationError}</p>
            )}

            {generatedEncryptionInfo && (
              <dl className="mt-3 grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    Subject
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-[var(--text)]">
                    {generatedEncryptionInfo.subject}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    Valid Until
                  </dt>
                  <dd className="mt-1 text-[var(--text)]">
                    {new Date(generatedEncryptionInfo.validTo).toLocaleString()}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    SHA-256 Fingerprint
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-[var(--text)]">
                    {generatedEncryptionInfo.fingerprint256}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="saml-sp-encryption-private-key" className="block text-sm font-medium text-[var(--text)]">
              SP Encryption Private Key
            </label>
            <textarea
              id="saml-sp-encryption-private-key"
              className={`focus-ring block w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text)] shadow-[var(--shadow-xs)] placeholder:text-[var(--muted)] ${errors.spEncryptionPrivateKey ? "border-red-400" : "border-[var(--border)]"}`}
              rows={6}
              placeholder={encryptionKeyPlaceholder}
              value={values.spEncryptionPrivateKey}
              onChange={(e) => onChange("spEncryptionPrivateKey", e.target.value)}
            />
            {errors.spEncryptionPrivateKey && (
              <p className="text-sm text-red-500">{errors.spEncryptionPrivateKey}</p>
            )}
            {!errors.spEncryptionPrivateKey && (
              <p className="text-sm text-[var(--muted)]">
                Used to decrypt encrypted assertions returned by the IdP.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="saml-sp-encryption-cert" className="block text-sm font-medium text-[var(--text)]">
              SP Encryption Certificate
            </label>
            <textarea
              id="saml-sp-encryption-cert"
              className={`focus-ring block w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text)] shadow-[var(--shadow-xs)] placeholder:text-[var(--muted)] ${errors.spEncryptionCert ? "border-red-400" : "border-[var(--border)]"}`}
              rows={6}
              placeholder={encryptionCertPlaceholder}
              value={values.spEncryptionCert}
              onChange={(e) => onChange("spEncryptionCert", e.target.value)}
            />
            {errors.spEncryptionCert && (
              <p className="text-sm text-red-500">{errors.spEncryptionCert}</p>
            )}
            {!errors.spEncryptionCert && (
              <p className="text-sm text-[var(--muted)]">
                Included in SP metadata so the IdP can encrypt assertions for this app.
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
