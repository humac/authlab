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
      // Already formatted or not valid JSON
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <CopyButton text={formatted} />
      </div>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono leading-relaxed max-h-[500px] overflow-y-auto">
        {formatted}
      </pre>
    </div>
  );
}
