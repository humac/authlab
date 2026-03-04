"use client";

import { ReactNode, useState } from "react";

interface Tab {
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
}

export function Tabs({ tabs }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px space-x-6">
          {tabs.map((tab, index) => (
            <button
              key={tab.label}
              onClick={() => setActiveIndex(index)}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeIndex === index
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="pt-4">{tabs[activeIndex]?.content}</div>
    </div>
  );
}
