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
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, className = "", id, ...props }, ref) => {
    const selectId = id || label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1">
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={`block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  },
);
Select.displayName = "Select";
