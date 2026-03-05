"use client";

import { useTheme, type ThemeMode } from "@/components/providers/ThemeProvider";

const MODES: ThemeMode[] = ["light", "dark", "system"];

function label(mode: ThemeMode) {
  if (mode === "light") return "Light";
  if (mode === "dark") return "Dark";
  return "System";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1 ${
        compact ? "text-xs" : "text-sm"
      }`}
      role="radiogroup"
      aria-label="Theme mode"
    >
      {MODES.map((item) => {
        const active = mode === item;
        return (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(item)}
            className={`focus-ring rounded-lg px-2.5 py-1.5 font-medium transition-colors ${
              active
                ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {label(item)}
          </button>
        );
      })}
    </div>
  );
}
