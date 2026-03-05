"use client";

import { ReactNode, useState } from "react";

interface Tab {
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  appearance?: "line" | "pill";
}

export function Tabs({ tabs, appearance = "line" }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-4 border-b border-[var(--border)]">
        <nav className="flex flex-wrap gap-2 pb-2">
          {tabs.map((tab, index) => {
            const active = activeIndex === index;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveIndex(index)}
                className={`focus-ring rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
