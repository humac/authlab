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
      prev.map((u) =>
        u.id === userId ? { ...u, isSystemAdmin: !current } : u,
      ),
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-gray-500">Loading...</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <div className="text-3xl font-bold text-gray-900">
              {stats.totalUsers}
            </div>
            <div className="text-sm text-gray-500">Total Users</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-gray-900">
              {stats.totalTeams}
            </div>
            <div className="text-sm text-gray-500">Total Teams</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-gray-900">
              {stats.totalApps}
            </div>
            <div className="text-sm text-gray-500">Total Apps</div>
          </Card>
        </div>
      )}

      {/* System Settings */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          System Settings
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium text-gray-900">
                Open Registration
              </div>
              <div className="text-sm text-gray-500">
                Allow new users to register accounts
              </div>
            </div>
            <button
              onClick={() =>
                toggleSetting(
                  "registrationEnabled",
                  settings.registrationEnabled || "true",
                )
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                (settings.registrationEnabled || "true") === "true"
                  ? "bg-primary"
                  : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  (settings.registrationEnabled || "true") === "true"
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </Card>

      {/* Users */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Users ({users.length})
        </h2>
        <div className="divide-y divide-gray-100">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{user.name}</span>
                  {user.isSystemAdmin && <Badge variant="blue">Admin</Badge>}
                </div>
                <div className="text-sm text-gray-500">
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

      {/* Teams */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Teams ({teams.length})
        </h2>
        <div className="divide-y divide-gray-100">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{team.name}</span>
                  {team.isPersonal && (
                    <span className="text-xs text-gray-400">(Personal)</span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {team._count.members} member
                  {team._count.members !== 1 ? "s" : ""} ·{" "}
                  {team._count.appInstances} app
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
