"use client";

import Link from "next/link";
import { useState } from "react";
import { AppInstanceCard } from "./AppInstanceCard";
import { TeamMembersPanel } from "./TeamMembersPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      {apps.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        <Card className="border-dashed text-center" tone="subtle">
          <h2 className="text-xl font-semibold text-[var(--text)]">No apps yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This team does not have any app instances.
          </p>
          <Link href="/apps/new" className="mt-5 inline-block">
            <Button>Create New App</Button>
          </Link>
        </Card>
      )}
      <TeamMembersPanel
        key={team.id}
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
