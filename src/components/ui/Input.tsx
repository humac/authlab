"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = "", id, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--text)]"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`focus-ring block h-11 w-full rounded-xl border bg-[var(--surface)] px-3.5 text-sm text-[var(--text)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow,background-color] placeholder:text-[var(--muted)] ${
            error
              ? "border-red-400"
              : "border-[var(--border)] hover:border-[var(--border-strong)]"
          } ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && (
          <p className="text-sm text-[var(--muted)]">{helperText}</p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
