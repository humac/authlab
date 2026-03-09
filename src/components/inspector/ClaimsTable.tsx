"use client";

import { useState } from "react";

interface ClaimsTableProps {
  claims: Record<string, unknown>;
}

export function ClaimsTable({ claims }: ClaimsTableProps) {
  const [sortAsc, setSortAsc] = useState(true);
  const entries = Object.entries(claims).sort(([a], [b]) =>
    sortAsc ? a.localeCompare(b) : b.localeCompare(a),
  );

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "null";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <table className="responsive-table w-full text-sm">
        <thead>
          <tr className="bg-[var(--surface-2)]">
            <th
              className="cursor-pointer px-4 py-3 text-left font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              onClick={() => setSortAsc(!sortAsc)}
            >
              Claim Name {sortAsc ? "\u2191" : "\u2193"}
            </th>
            <th className="px-4 py-3 text-left font-semibold text-[var(--muted)]">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, value]) => (
            <tr
              key={key}
              className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
            >
              <td className="px-4 py-3 font-mono font-medium text-[var(--primary)]" data-label="Claim">
                {key}
              </td>
              <td className="break-all whitespace-pre-wrap px-4 py-3 font-mono text-[var(--text)]" data-label="Value">
                {formatValue(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && (
        <p className="py-8 text-center text-[var(--muted)]">No claims available</p>
      )}
    </div>
  );
}
