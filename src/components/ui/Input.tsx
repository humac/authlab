"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  uiSize?: "sm" | "md";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      className = "",
      id,
      uiSize = "md",
      ...props
    },
    ref,
  ) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");
    const sizes = {
      sm: "h-9 px-3 text-sm leading-[1.2]",
      md: "h-10 px-3.5 text-sm leading-[1.25]",
    };

    return (
      <div className="space-y-1">
        <label
          htmlFor={inputId}
          className="block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`focus-ring block w-full rounded-lg border bg-[var(--surface)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow,background-color] placeholder:text-[var(--muted)] placeholder:leading-[1.2] ${sizes[uiSize]} ${
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
