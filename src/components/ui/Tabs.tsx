"use client";

import { ReactNode, useState } from "react";

interface Tab {
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  appearance?: "line" | "pill";
  compact?: boolean;
}

export function Tabs({ tabs, appearance = "line", compact = false }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] ${compact ? "p-3" : "p-4"}`}>
      <div className={`border-b border-[var(--border)] ${compact ? "mb-3" : "mb-4"}`}>
        <nav className={`flex flex-wrap gap-1.5 ${compact ? "pb-1.5" : "pb-2"}`}>
          {tabs.map((tab, index) => {
            const active = activeIndex === index;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveIndex(index)}
                className={`focus-ring rounded-md px-2.5 ${compact ? "py-1.5 text-xs" : "py-2 text-sm"} font-medium transition-colors ${
                  appearance === "pill"
                    ? active
                      ? "bg-[var(--surface-2)] text-[var(--text)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    : active
                      ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="animate-enter">{tabs[activeIndex]?.content}</div>
    </div>
  );
}
