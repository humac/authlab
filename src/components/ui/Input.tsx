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
      <div className="space-y-1">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary ${
            error
              ? "border-red-300 focus:border-red-500 focus:ring-red-500/50"
              : "border-gray-300"
          } ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {helperText && !error && (
          <p className="text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
