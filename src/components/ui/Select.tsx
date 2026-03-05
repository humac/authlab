"use client";

import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, helperText, className = "", id, ...props }, ref) => {
    const selectId = id || label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-[var(--text)]"
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={`focus-ring block h-11 w-full rounded-xl border bg-[var(--surface)] px-3.5 text-sm text-[var(--text)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow,background-color] ${
            error
              ? "border-red-400"
              : "border-[var(--border)] hover:border-[var(--border-strong)]"
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && (
          <p className="text-sm text-[var(--muted)]">{helperText}</p>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";
