"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TeamMembersPanel } from "./TeamMembersPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
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
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RedactedAppInstance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredApps = useMemo(
    () =>
      apps
        .filter((app) =>
          [app.name, app.slug, app.protocol].some((value) =>
            value.toLowerCase().includes(query.toLowerCase()),
          ),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [apps, query],
  );

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/apps/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setApps((prev) => prev.filter((app) => app.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="bg-[var(--surface-2)]">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Applications</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{apps.length}</p>
          </Card>
          <Card className="bg-[var(--surface-2)]">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Members</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{team.members.length}</p>
          </Card>
          <Card className="bg-[var(--surface-2)]">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Role</p>
            <div className="mt-2">
              <Badge variant={team.currentRole === "OWNER" ? "blue" : team.currentRole === "ADMIN" ? "green" : "gray"}>
                {team.currentRole}
              </Badge>
            </div>
          </Card>
        </div>

        <Card className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">App inventory</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Compact view of apps in {team.isPersonal ? "your personal workspace" : team.name}.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                label="Search apps"
                uiSize="sm"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, slug, protocol"
              />
              <Link href="/apps/new" className="flex items-end">
                <Button size="sm">New App</Button>
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Application</th>
                  <th className="px-3 py-2">Protocol</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.map((app) => (
                  <tr
                    key={app.id}
                    data-testid={`app-card-${app.slug}`}
                    className="border-t border-[var(--border)] bg-[var(--surface)]"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full border border-[var(--border)]"
                          style={{ backgroundColor: app.buttonColor || "#3B71CA" }}
                        />
                        <div>
                          <p className="font-medium text-[var(--text)]">{app.name}</p>
                          <p className="font-mono text-xs text-[var(--muted)]">/{app.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} />
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Link href={`/test/${app.slug}`}>
                          <Button size="sm">Test</Button>
                        </Link>
                        <Link href={`/apps/${app.id}`}>
                          <Button size="sm" variant="secondary">
                            Edit
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[var(--danger)]"
                          onClick={() => setDeleteTarget(app)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredApps.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                No applications matched this view.
              </div>
            )}
          </div>
        </Card>
      </div>

      <TeamMembersPanel
        key={team.id}
        teamId={team.id}
        teamName={team.name}
        isPersonal={team.isPersonal}
        currentUserId={currentUserId}
        currentUserRole={team.currentRole}
        initialMembers={team.members}
      />

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete app"
      >
        <p className="text-sm text-[var(--muted)]">
          Delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
