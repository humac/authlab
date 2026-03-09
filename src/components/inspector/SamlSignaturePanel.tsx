import { Badge } from "@/components/ui/Badge";
import type { SamlSignatureDiagnostics } from "@/lib/saml-signature-diagnostics";

function variantForStatus(
  status: SamlSignatureDiagnostics["status"],
): "green" | "blue" | "gray" | "red" {
  switch (status) {
    case "verified":
      return "green";
    case "warning":
      return "blue";
    case "missing":
      return "gray";
    default:
      return "red";
  }
}

export function SamlSignaturePanel({
  diagnostics,
}: {
  diagnostics: SamlSignatureDiagnostics;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">Signature verification</p>
              <Badge variant={variantForStatus(diagnostics.status)}>{diagnostics.status}</Badge>
              {diagnostics.callbackValidated && <Badge variant="green">Callback accepted</Badge>}
            </div>
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {diagnostics.summary}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={diagnostics.responseSigned ? "green" : "gray"}>
              {diagnostics.responseSigned ? "Response signed" : "Response unsigned"}
            </Badge>
            <Badge variant={diagnostics.assertionSigned ? "green" : "gray"}>
              {diagnostics.assertionSigned ? "Assertion signed" : "Assertion unsigned"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Configured signing trust</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              IdP certificate fingerprint and subject used by AuthLab when validating inbound SAML.
            </p>
          </div>
          <dl className="mt-4 grid gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Configured subject
              </dt>
              <dd className="mt-2 break-all text-sm text-[var(--text)]">
                {diagnostics.configuredCertificateSubject || "Unavailable"}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Configured fingerprint
              </dt>
              <dd className="mt-2 break-all text-sm text-[var(--text)]">
                {diagnostics.configuredCertificateFingerprint || "Unavailable"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Captured signature coverage</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Signature blocks detected on the response or assertion envelope.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {diagnostics.details.length > 0 ? (
              diagnostics.details.map((detail) => (
                <div
                  key={detail.location}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {detail.location === "response" ? "Response signature" : "Assertion signature"}
                    </p>
                    {detail.certificateMatchesConfigured === true && (
                      <Badge variant="green">Cert match</Badge>
                    )}
                    {detail.certificateMatchesConfigured === false && (
                      <Badge variant="blue">Cert mismatch</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    Signature method {detail.signatureAlgorithm || "Unavailable"}
                  </p>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    Canonicalization {detail.canonicalizationAlgorithm || "Unavailable"}
                  </p>
                  <p className="mt-2 break-all text-xs leading-5 text-[var(--muted)]">
                    Embedded fingerprint {detail.embeddedCertificateFingerprint || "Unavailable"}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                No signature block was parsed from the raw SAML response.
              </div>
            )}
          </div>
        </section>
      </div>

      {diagnostics.details.length > 0 && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Reference details</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Digest and transform metadata captured from SignedInfo references.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {diagnostics.details.map((detail) =>
              detail.references.map((reference, index) => (
                <div
                  key={`${detail.location}-${reference.uri ?? "reference"}-${index}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="saml">{detail.location}</Badge>
                    <p className="text-sm font-medium text-[var(--text)]">
                      Reference {reference.uri || "without URI"}
                    </p>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    Digest {reference.digestAlgorithm || "Unavailable"}
                  </p>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    Transforms {reference.transforms.length > 0 ? reference.transforms.join(", ") : "Unavailable"}
                  </p>
                </div>
              )),
            )}
          </div>
        </section>
      )}
    </div>
  );
}
