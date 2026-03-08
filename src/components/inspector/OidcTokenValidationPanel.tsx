import { Badge } from "@/components/ui/Badge";
import {
  validateOidcTokenArtifacts,
  type OidcValidationCheck,
  type OidcSignatureValidation,
} from "@/lib/oidc-token-validation";

interface OidcTokenValidationPanelProps {
  idToken: string;
  accessToken?: string | null;
  jwksUri?: string | null;
  expectedCHash?: string | null;
  grantType: string;
}

function badgeVariant(
  status: OidcValidationCheck["status"],
): "green" | "blue" | "gray" {
  if (status === "valid") {
    return "green";
  }
  if (status === "invalid") {
    return "blue";
  }
  return "gray";
}

function ValidationCard({
  title,
  result,
}: {
  title: string;
  result: OidcValidationCheck;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            {title}
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--text)]">{result.summary}</p>
        </div>
        <Badge variant={badgeVariant(result.status)}>{result.status}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{result.detail}</p>
      {result.expected || result.actual ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
              Expected
            </p>
            <p className="mt-1 break-all font-mono text-xs text-[var(--text)]">
              {result.expected ?? "Not available"}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
              Actual
            </p>
            <p className="mt-1 break-all font-mono text-xs text-[var(--text)]">
              {result.actual ?? "Not available"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SignatureCard({ result }: { result: OidcSignatureValidation }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Signature validation
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--text)]">{result.summary}</p>
        </div>
        <Badge variant={badgeVariant(result.status)}>{result.status}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{result.detail}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Alg</p>
          <p className="mt-1 font-mono text-xs text-[var(--text)]">
            {result.algorithm ?? "Unknown"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">Kid</p>
          <p className="mt-1 font-mono text-xs text-[var(--text)]">
            {result.keyId ?? "Not advertised"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
            JWKS URI
          </p>
          <p className="mt-1 break-all font-mono text-xs text-[var(--text)]">
            {result.jwksUri ?? "Not advertised"}
          </p>
        </div>
      </div>
    </div>
  );
}

export async function OidcTokenValidationPanel({
  idToken,
  accessToken,
  jwksUri,
  expectedCHash,
  grantType,
}: OidcTokenValidationPanelProps) {
  const validation = await validateOidcTokenArtifacts({
    idToken,
    accessToken,
    jwksUri,
    expectedCHash,
    grantType,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          Token validation
        </p>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          Validate the ID token signature against provider JWKS and compare bound hash claims to
          the current session artifacts.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SignatureCard result={validation.signature} />
        <div className="space-y-3">
          <ValidationCard title="Access token binding" result={validation.atHash} />
          <ValidationCard title="Authorization code binding" result={validation.cHash} />
        </div>
      </div>
    </div>
  );
}
