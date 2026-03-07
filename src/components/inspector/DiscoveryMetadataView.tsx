import { Badge } from "@/components/ui/Badge";

interface DiscoveryMetadataViewProps {
  metadata: Record<string, unknown>;
}

const ENDPOINT_KEYS = [
  "authorization_endpoint",
  "token_endpoint",
  "userinfo_endpoint",
  "jwks_uri",
  "end_session_endpoint",
];

const CAPABILITY_KEYS = [
  "response_types_supported",
  "scopes_supported",
  "claims_supported",
  "code_challenge_methods_supported",
];

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return value == null ? "Not advertised" : String(value);
}

export function DiscoveryMetadataView({
  metadata,
}: DiscoveryMetadataViewProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {ENDPOINT_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                {key.replaceAll("_", " ")}
              </p>
              <Badge variant={metadata[key] ? "green" : "gray"}>
                {metadata[key] ? "Available" : "Missing"}
              </Badge>
            </div>
            <p className="mt-2 break-all font-mono text-xs text-[var(--text)]">
              {formatValue(metadata[key])}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {CAPABILITY_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              {key.replaceAll("_", " ")}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-[var(--text)]">
              {formatValue(metadata[key])}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
