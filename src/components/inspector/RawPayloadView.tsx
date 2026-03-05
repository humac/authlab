"use client";

import { CopyButton } from "@/components/ui/CopyButton";

interface RawPayloadViewProps {
  data: string;
  format: "json" | "xml";
}

export function RawPayloadView({ data, format }: RawPayloadViewProps) {
  let formatted = data;

  if (format === "json") {
    try {
      formatted = JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      // Already formatted or not valid JSON.
    }
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <CopyButton text={formatted} />
      </div>
      <pre className="max-h-[540px] overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--code-bg)] p-4 font-mono text-sm leading-relaxed text-[var(--code-text)]">
        {formatted}
      </pre>
    </div>
  );
}
