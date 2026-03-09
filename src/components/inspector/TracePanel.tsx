import { Badge } from "@/components/ui/Badge";
import type { AuthTraceEntry } from "@/lib/auth-trace";
import { RawPayloadView } from "./RawPayloadView";

interface TracePanelProps {
  entries: AuthTraceEntry[];
}

function getVariant(status: AuthTraceEntry["status"]): "blue" | "green" | "gray" {
  if (status === "FAILED") {
    return "gray";
  }
  if (status === "INFO") {
    return "blue";
  }
  return "green";
}

export function TracePanel({ entries }: TracePanelProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        No protocol traces were captured for this run yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text)]">Protocol trace</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Review outbound requests, captured responses, and protocol metadata for this auth run.
        </p>
      </div>

      {entries.map((entry, index) => (
        <details
          key={entry.id}
          open={index === entries.length - 1}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  {entry.title}
                </h3>
                <Badge variant={getVariant(entry.status)}>{entry.status}</Badge>
              </div>
              <p className="text-sm text-[var(--muted)]">{entry.summary}</p>
            </div>
            <time className="shrink-0 text-xs text-[var(--muted)]">
              {new Date(entry.occurredAt).toLocaleString()}
            </time>
          </summary>

          <div className="space-y-4 border-t border-[var(--border)] px-4 py-4">
            {entry.sections.map((section) => (
              <section key={`${entry.id}-${section.label}`} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  {section.label}
                </h4>
                <RawPayloadView data={section.data} format={section.format === "xml" ? "xml" : "json"} />
              </section>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
