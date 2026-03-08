"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { KeyValueParam } from "@/types/app-instance";

interface KeyValueEditorProps {
  label: string;
  values: KeyValueParam[];
  onChange: (values: KeyValueParam[]) => void;
  keyLabel?: string;
  valueLabel?: string;
  helperText?: string;
  compact?: boolean;
}

export function KeyValueEditor({
  label,
  values,
  onChange,
  keyLabel = "Key",
  valueLabel = "Value",
  helperText,
  compact = false,
}: KeyValueEditorProps) {
  const rows = values.length > 0 ? values : [{ key: "", value: "" }];

  const updateRow = (index: number, field: "key" | "value", nextValue: string) => {
    const nextRows = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: nextValue } : row,
    );
    onChange(nextRows);
  };

  const addRow = () => {
    onChange([...rows, { key: "", value: "" }]);
  };

  const removeRow = (index: number) => {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(nextRows.length > 0 ? nextRows : [{ key: "", value: "" }]);
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          {label}
        </p>
        {helperText && (
          <p className="mt-1 text-xs text-[var(--muted)]">{helperText}</p>
        )}
      </div>
      <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        {rows.map((row, index) => (
          <div
            key={`${row.key}-${index}`}
            className={`grid gap-2 ${compact ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"}`}
          >
            <Input
              label={keyLabel}
              uiSize="sm"
              value={row.key}
              onChange={(event) => updateRow(index, "key", event.target.value)}
              placeholder="prompt"
            />
            <Input
              label={valueLabel}
              uiSize="sm"
              value={row.value}
              onChange={(event) => updateRow(index, "value", event.target.value)}
              placeholder="login"
            />
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[var(--danger)]"
                onClick={() => removeRow(index)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div className="flex justify-between">
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            Add Row
          </Button>
        </div>
      </div>
    </div>
  );
}
