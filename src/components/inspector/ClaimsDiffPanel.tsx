import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buildClaimsDiffEntries } from "@/lib/claims-diff";
import type { AuthRun } from "@/types/auth-run";

interface ClaimsDiffPanelProps {
  slug: string;
  currentRun: AuthRun;
  compareRun: AuthRun | null;
  candidates: AuthRun[];
}

function formatRunLabel(run: AuthRun): string {
  const timestamp = run.authenticatedAt ?? run.createdAt;
  return `${run.grantType.replaceAll("_", " ")} · ${timestamp.toLocaleString()} · ${run.status.replaceAll("_", " ")}`;
}

function formatStatusVariant(status: ReturnType<typeof buildClaimsDiffEntries>[number]["status"]) {
  switch (status) {
    case "added":
      return "green";
    case "removed":
      return "gray";
    case "changed":
      return "blue";
    default:
      return "gray";
  }
}

export function ClaimsDiffPanel({
  slug,
  currentRun,
  compareRun,
  candidates,
}: ClaimsDiffPanelProps) {
  const entries = compareRun
    ? buildClaimsDiffEntries(currentRun.claims, compareRun.claims)
    : [];
  const changedCount = entries.filter((entry) => entry.status === "changed").length;
  const addedCount = entries.filter((entry) => entry.status === "added").length;
  const removedCount = entries.filter((entry) => entry.status === "removed").length;
  const relevantEntries = entries.filter((entry) => entry.status !== "unchanged");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Compare runs
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Compare the current run’s claims with another persisted run for the same app.
            </p>
          </div>
          {compareRun && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="blue">{changedCount} changed</Badge>
              <Badge variant="green">{addedCount} added</Badge>
              <Badge variant="gray">{removedCount} removed</Badge>
            </div>
          )}
        </div>

        <form method="GET" action={`/test/${slug}/inspector`} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="tab" value="Claims Diff" />
          <div className="min-w-0 flex-1 space-y-1">
            <label
              htmlFor="compare-run"
              className="block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]"
            >
              Baseline run
            </label>
            <select
              id="compare-run"
              name="compare"
              defaultValue={compareRun?.id ?? ""}
              className="focus-ring block h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] shadow-[var(--shadow-xs)]"
            >
              <option value="">Select a run to compare</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {formatRunLabel(candidate)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="focus-ring inline-flex h-9 items-center justify-center rounded-lg border border-transparent bg-[var(--primary)] px-3 text-sm font-medium text-white transition-[background-color] hover:bg-[var(--primary-strong)]"
          >
            Compare
          </button>
          {compareRun && (
            <Link
              href={`/test/${slug}/inspector?tab=Claims+Diff`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] transition-[background-color] hover:bg-[var(--surface-2)]"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {!compareRun && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center">
          <p className="text-sm font-medium text-[var(--text)]">No baseline selected</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Select another run above to inspect claim drift between configurations or flows.
          </p>
        </div>
      )}

      {compareRun && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Current run
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                {formatRunLabel(currentRun)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">{currentRun.id}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Baseline run
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                {formatRunLabel(compareRun)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">{compareRun.id}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  <th className="px-4 py-3 text-left font-semibold text-[var(--muted)]">Claim</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--muted)]">Current</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--muted)]">Baseline</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {relevantEntries.map((entry) => (
                  <tr key={entry.key} className="border-t border-[var(--border)] align-top">
                    <td className="px-4 py-3 font-mono font-medium text-[var(--primary)]" data-label="Claim">
                      {entry.key}
                    </td>
                    <td className="whitespace-pre-wrap break-all px-4 py-3 font-mono text-[var(--text)]" data-label="Current">
                      {entry.currentValue ?? "null"}
                    </td>
                    <td className="whitespace-pre-wrap break-all px-4 py-3 font-mono text-[var(--text)]" data-label="Baseline">
                      {entry.compareValue ?? "null"}
                    </td>
                    <td className="px-4 py-3" data-label="Status">
                      <Badge variant={formatStatusVariant(entry.status)}>
                        {entry.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {relevantEntries.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                No differences detected between these runs.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
