"use client";

import Link from "next/link";
import { useState } from "react";
import { AppInstanceCard } from "./AppInstanceCard";
import { TeamMembersPanel } from "./TeamMembersPanel";
import { Button } from "@/components/ui/Button";
import type { RedactedAppInstance } from "@/types/app-instance";

interface DashboardProps {
  initialApps: RedactedAppInstance[];
  team: {
    id: string;
    name: string;
    isPersonal: boolean;
    currentRole: "OWNER" | "ADMIN" | "MEMBER";
    members: Array<{
      id: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
      user: {
        id: string;
        name: string;
        email: string;
      };
    }>;
  };
  currentUserId: string;
}

export function Dashboard({ initialApps, team, currentUserId }: DashboardProps) {
  const [apps, setApps] = useState(initialApps);

  const handleDelete = (id: string) => {
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  const handleTransfer = (
    mode: "MOVE" | "COPY",
    app: RedactedAppInstance,
  ) => {
    if (mode === "MOVE") {
      setApps((prev) => prev.filter((existing) => existing.id !== app.id));
      return;
    }

    if (app.teamId === team.id) {
      setApps((prev) => [app, ...prev]);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      {apps.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {apps.map((app) => (
            <AppInstanceCard
              key={app.id}
              app={app}
              onDelete={handleDelete}
              onTransfer={handleTransfer}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Apps Yet</h2>
          <p className="text-sm text-gray-500 mb-5">
            This team does not have any app instances yet.
          </p>
          <Link href="/apps/new">
            <Button>Create New App</Button>
          </Link>
        </div>
      )}
      <TeamMembersPanel
        teamId={team.id}
        teamName={team.name}
        isPersonal={team.isPersonal}
        currentUserId={currentUserId}
        currentUserRole={team.currentRole}
        initialMembers={team.members}
      />
    </div>
  );
}
