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
  uiSize?: "sm" | "md";
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      options,
      error,
      helperText,
      className = "",
      id,
      uiSize = "md",
      ...props
    },
    ref,
  ) => {
    const selectId = id || label.toLowerCase().replace(/\s+/g, "-");
    const sizes = {
      sm: "h-9 px-3 text-sm",
      md: "h-10 px-3.5 text-sm",
    };

    return (
      <div className="space-y-1">
        <label
          htmlFor={selectId}
          className="block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]"
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={`focus-ring block w-full rounded-lg border bg-[var(--surface)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow,background-color] ${sizes[uiSize]} ${
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
