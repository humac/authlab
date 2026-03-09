import { Badge } from "@/components/ui/Badge";
import type { CertificateDiagnostics } from "@/lib/certificate-diagnostics";

function variantForStatus(
  status: CertificateDiagnostics["status"],
): "green" | "blue" | "gray" | "red" {
  switch (status) {
    case "healthy":
      return "green";
    case "expiring":
      return "blue";
    case "expired":
    case "invalid":
      return "red";
    default:
      return "gray";
  }
}

export function CertificateHealthPanel({
  title,
  diagnostics,
}: {
  title: string;
  diagnostics: CertificateDiagnostics;
}) {
  const rows = [
    ["Subject", diagnostics.subject],
    ["Issuer", diagnostics.issuer],
    ["Serial", diagnostics.serialNumber],
    ["Valid from", diagnostics.validFrom],
    ["Valid to", diagnostics.validTo],
    ["Fingerprint", diagnostics.fingerprint256],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
              <Badge variant={variantForStatus(diagnostics.status)}>
                {diagnostics.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {diagnostics.summary}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Days until expiry
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--text)]">
              {diagnostics.daysUntilExpiry ?? "Unavailable"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              {label}
            </p>
            <p className="mt-2 break-all text-sm text-[var(--text)]">
              {value || "Unavailable"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
