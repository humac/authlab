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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th
              className="text-left py-3 px-4 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
              onClick={() => setSortAsc(!sortAsc)}
            >
              Claim Name {sortAsc ? "\u2191" : "\u2193"}
            </th>
            <th className="text-left py-3 px-4 font-medium text-gray-500">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, value]) => (
            <tr
              key={key}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="py-3 px-4 font-mono text-primary font-medium">
                {key}
              </td>
              <td className="py-3 px-4 font-mono text-gray-700 break-all whitespace-pre-wrap">
                {formatValue(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && (
        <p className="text-center text-gray-400 py-8">No claims available</p>
      )}
    </div>
  );
}
