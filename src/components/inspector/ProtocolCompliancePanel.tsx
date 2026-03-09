import { Badge } from "@/components/ui/Badge";
import type { ProtocolComplianceReport } from "@/lib/protocol-compliance";

function variantForStatus(
  status: ProtocolComplianceReport["checks"][number]["status"],
): "green" | "blue" | "gray" | "red" {
  switch (status) {
    case "pass":
      return "green";
    case "warn":
      return "blue";
    case "fail":
      return "red";
    default:
      return "gray";
  }
}

export function ProtocolCompliancePanel({
  report,
}: {
  report: ProtocolComplianceReport;
}) {
  const passed = report.checks.filter((check) => check.status === "pass").length;
  const warnings = report.checks.filter((check) => check.status === "warn").length;
  const failed = report.checks.filter((check) => check.status === "fail").length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">Protocol compliance report</p>
              <Badge variant={report.protocol.toLowerCase() as "oidc" | "saml"} />
            </div>
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="green">{passed} passed</Badge>
            <Badge variant="blue">{warnings} warning{warnings === 1 ? "" : "s"}</Badge>
            <Badge variant={failed > 0 ? "red" : "gray"}>
              {failed} failed
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {report.checks.map((check) => (
          <div
            key={check.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--text)]">{check.title}</p>
                  <Badge variant={variantForStatus(check.status)}>{check.status}</Badge>
                </div>
                <p className="text-sm leading-6 text-[var(--muted)]">{check.summary}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
