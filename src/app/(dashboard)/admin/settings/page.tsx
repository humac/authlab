"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Stats {
  totalUsers: number;
  totalTeams: number;
  totalApps: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  createdAt: string;
  _count: { teamMemberships: number };
}

interface Team {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  createdAt: string;
  _count: { members: number; appInstances: number };
}

export default function AdminSettingsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats").then((r) => r.json()),
      fetch("/api/admin/settings").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/teams").then((r) => r.json()),
    ])
      .then(([statsData, settingsData, usersData, teamsData]) => {
        setStats(statsData);
        setSettings(settingsData);
        setUsers(usersData.users || []);
        setTeams(teamsData.teams || []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleSetting(key: string, current: string) {
    const newValue = current === "true" ? "false" : "true";
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: newValue }),
    });
    setSettings((prev) => ({ ...prev, [key]: newValue }));
  }

  async function toggleAdmin(userId: string, current: boolean) {
    await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSystemAdmin: !current }),
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isSystemAdmin: !current } : u)),
    );
  }

  if (loading) {
    return <div className="py-12 text-center text-[var(--muted)]">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-enter">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Admin Settings</h1>

      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <div className="text-3xl font-bold text-[var(--text)]">{stats.totalUsers}</div>
            <div className="text-sm text-[var(--muted)]">Total Users</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-[var(--text)]">{stats.totalTeams}</div>
            <div className="text-sm text-[var(--muted)]">Total Teams</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-[var(--text)]">{stats.totalApps}</div>
            <div className="text-sm text-[var(--muted)]">Total Apps</div>
          </Card>
        </div>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">System Settings</h2>
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
          <div>
            <div className="font-medium text-[var(--text)]">Open Registration</div>
            <div className="text-sm text-[var(--muted)]">Allow new users to register accounts</div>
          </div>
          <button
            onClick={() =>
              toggleSetting(
                "registrationEnabled",
                settings.registrationEnabled || "true",
              )
            }
            className={`focus-ring relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(settings.registrationEnabled || "true") === "true" ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]"}`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${(settings.registrationEnabled || "true") === "true" ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Users ({users.length})</h2>
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text)]">{user.name}</span>
                  {user.isSystemAdmin && <Badge variant="blue">Admin</Badge>}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {user.email} · {user._count.teamMemberships} team
                  {user._count.teamMemberships !== 1 ? "s" : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant={user.isSystemAdmin ? "danger" : "secondary"}
                onClick={() => toggleAdmin(user.id, user.isSystemAdmin)}
              >
                {user.isSystemAdmin ? "Remove Admin" : "Make Admin"}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Teams ({teams.length})</h2>
        <div className="space-y-2">
          {teams.map((team) => (
            <div key={team.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text)]">{team.name}</span>
                  {team.isPersonal && <span className="text-xs text-[var(--muted)]">(Personal)</span>}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {team._count.members} member{team._count.members !== 1 ? "s" : ""} · {team._count.appInstances} app
                  {team._count.appInstances !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
