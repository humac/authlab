"use client";

import { useState } from "react";
import { AppInstanceCard } from "./AppInstanceCard";
import type { RedactedAppInstance } from "@/types/app-instance";

interface DashboardProps {
  initialApps: RedactedAppInstance[];
}

export function Dashboard({ initialApps }: DashboardProps) {
  const [apps, setApps] = useState(initialApps);

  const handleDelete = (id: string) => {
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {apps.map((app) => (
        <AppInstanceCard key={app.id} app={app} onDelete={handleDelete} />
      ))}
    </div>
  );
}
