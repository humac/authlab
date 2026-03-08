import { Badge } from "@/components/ui/Badge";

interface SamlOverviewPanelProps {
  claims: Record<string, unknown> | null;
  hasRawXml: boolean;
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getAttributeCount(claims: Record<string, unknown> | null): number {
  return claims ? Object.keys(claims).length : 0;
}

export function SamlOverviewPanel({
  claims,
  hasRawXml,
}: SamlOverviewPanelProps) {
  const nameId =
    getStringValue(claims?.nameId) ??
    getStringValue(claims?.NameID) ??
    getStringValue(claims?.sub);
  const nameIdFormat =
    getStringValue(claims?.nameIdFormat) ?? getStringValue(claims?.NameIDFormat);
  const authnContext =
    getStringValue(claims?.authnContextClassRef) ??
    getStringValue(claims?.AuthnContextClassRef);
  const attributeCount = getAttributeCount(claims);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              SAML session overview
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              This inspector run captured a SAML assertion snapshot. Phase 3 will add structured
              assertion diagnostics, but this view keeps the current run protocol-specific.
            </p>
          </div>
          <Badge variant="saml">SAML</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Assertion payload
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={hasRawXml ? "green" : "gray"}>
              {hasRawXml ? "Captured" : "Unavailable"}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            {hasRawXml
              ? "The raw SAML response XML is available for inspection in the Raw XML tab."
              : "No raw assertion XML was retained for this run."}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            NameID
          </p>
          <p className="mt-2 break-all text-sm font-medium text-[var(--text)]">
            {nameId ?? "Not captured"}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            {nameIdFormat ? `Format: ${nameIdFormat}` : "NameID format is not currently captured."}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Authn context
          </p>
          <p className="mt-2 break-all text-sm font-medium text-[var(--text)]">
            {authnContext ?? "Not captured"}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Requested and returned authentication context support is planned for Phase 3.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Claims captured
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--text)]">{attributeCount}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Attribute and subject values remain available in the Claims tab.
          </p>
        </div>
      </div>
    </div>
  );
}
