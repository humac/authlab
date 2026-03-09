"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";

type TeamRole = "ADMIN" | "MEMBER";

interface TeamOption {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
}

interface UserMembership {
  id: string;
  role: TeamRole | "OWNER";
  teamId: string;
  team: TeamOption;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  isVerified?: boolean;
  mfaEnabled?: boolean;
  createdAt: string;
  teamMemberships: UserMembership[];
}

interface EditState {
  id: string;
  name: string;
  email: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
  tempPassword: string;
  teams: Record<string, TeamRole | null>;
}

function initialTeamSelection(teams: TeamOption[]) {
  return Object.fromEntries(
    teams.filter((team) => !team.isPersonal).map((team) => [team.id, null]),
  ) as Record<string, TeamRole | null>;
}

export default function AdminUsersPage() {
  const currentUser = useUser();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createTempPassword, setCreateTempPassword] = useState("");
  const [createIsAdmin, setCreateIsAdmin] = useState(false);
  const [createTeams, setCreateTeams] = useState<Record<string, TeamRole | null>>({});

  const [editState, setEditState] = useState<EditState | null>(null);

  const assignableTeams = useMemo(
    () => teams.filter((team) => !team.isPersonal),
    [teams],
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [usersRes, teamsRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/teams"),
        ]);
        const [usersData, teamsData] = await Promise.all([
          usersRes.json(),
          teamsRes.json(),
        ]);

        if (!usersRes.ok) {
          setError(usersData.error || "Failed to load users");
          return;
        }
        if (!teamsRes.ok) {
          setError(teamsData.error || "Failed to load teams");
          return;
        }

        const nextTeams = teamsData.teams || [];
        setUsers(usersData.users || []);
        setTeams(nextTeams);
        setCreateTeams(initialTeamSelection(nextTeams));
      } catch {
        setError("An unexpected error occurred while loading user data");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function selectedMemberships(selection: Record<string, TeamRole | null>) {
    return Object.entries(selection)
      .filter(([, role]) => role !== null)
      .map(([teamId, role]) => ({ teamId, role: role as TeamRole }));
  }

  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        [user.name, user.email, user.isSystemAdmin ? "admin" : "user"]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, users],
  );

  function openEditModal(user: AdminUser) {
    const selection = initialTeamSelection(teams);
    for (const membership of user.teamMemberships) {
      if (!membership.team.isPersonal && membership.role !== "OWNER") {
        selection[membership.teamId] = membership.role as TeamRole;
      }
    }

    setEditState({
      id: user.id,
      name: user.name,
      email: user.email,
      isSystemAdmin: user.isSystemAdmin,
      mustChangePassword: user.mustChangePassword,
      isVerified: user.isVerified ?? true,
      mfaEnabled: user.mfaEnabled ?? false,
      tempPassword: "",
      teams: selection,
    });
  }

  async function refreshUsers() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (res.ok) {
      setUsers(data.users || []);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setPendingActionId("create-user");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          tempPassword: createTempPassword,
          isSystemAdmin: createIsAdmin,
          memberships: selectedMemberships(createTeams),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user");
        return;
      }

      setCreateName("");
      setCreateEmail("");
      setCreateTempPassword("");
      setCreateIsAdmin(false);
      setCreateTeams(initialTeamSelection(teams));
      setCreateOpen(false);
      setSuccess("User created with temporary password");
      await refreshUsers();
    } catch {
      setError("An unexpected error occurred while creating user");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleSaveUser() {
    if (!editState) return;

    setError("");
    setSuccess("");
    setPendingActionId(`save-${editState.id}`);

    try {
      const userRes = await fetch(`/api/admin/users/${editState.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editState.name,
          email: editState.email,
          isSystemAdmin: editState.isSystemAdmin,
          mustChangePassword: editState.mustChangePassword,
          tempPassword: editState.tempPassword || undefined,
          isVerified: editState.isVerified,
          mfaEnabled: editState.mfaEnabled,
        }),
      });
      const userData = await userRes.json();
      if (!userRes.ok) {
        setError(userData.error || "Failed to update user");
        return;
      }

      const teamsRes = await fetch(`/api/admin/users/${editState.id}/teams`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberships: selectedMemberships(editState.teams),
        }),
      });
      const teamsData = await teamsRes.json();
      if (!teamsRes.ok) {
        setError(teamsData.error || "Failed to update team assignments");
        return;
      }

      setSuccess("User updated");
      setEditState(null);
      await refreshUsers();
    } catch {
      setError("An unexpected error occurred while updating user");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDeleteUser(userId: string) {
    setError("");
    setSuccess("");
    setPendingActionId(`delete-${userId}`);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete user");
        return;
      }
      setSuccess("User deleted");
      await refreshUsers();
    } catch {
      setError("An unexpected error occurred while deleting user");
    } finally {
      setPendingActionId(null);
    }
  }

  function renderTeamAssignments(
    selection: Record<string, TeamRole | null>,
    onChange: (teamId: string, role: TeamRole | null) => void,
  ) {
    return (
      <div className="space-y-2">
        {assignableTeams.map((team) => {
          const selectedRole = selection[team.id];
          return (
            <div
              key={team.id}
              data-testid={`team-assignment-${team.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
            >
              <div>
                <p className="font-medium text-[var(--text)]">{team.name}</p>
                <p className="font-mono text-xs text-[var(--muted)]">/{team.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedRole !== null}
                  onChange={(e) => onChange(team.id, e.target.checked ? "MEMBER" : null)}
                />
                <select
                  value={selectedRole ?? "MEMBER"}
                  onChange={(e) => onChange(team.id, e.target.value as TeamRole)}
                  disabled={selectedRole === null}
                  className="focus-ring h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (!currentUser.isSystemAdmin) {
    return <div className="py-12 text-center text-[var(--muted)]">Forbidden</div>;
  }

  if (loading) {
    return <div className="py-12 text-center text-[var(--muted)]">Loading user management...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 animate-enter">
      <PageHeader
        title="User Management"
        description="Create accounts, apply temporary passwords, and manage team access."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New user
          </Button>
        }
      />

      {error && <div className="alert-danger rounded-lg p-3 text-sm">{error}</div>}
      {success && <div className="alert-success rounded-lg p-3 text-sm">{success}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-[var(--surface-2)]">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Users</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{users.length}</p>
        </Card>
        <Card className="bg-[var(--surface-2)]">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">System admins</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
            {users.filter((user) => user.isSystemAdmin).length}
          </p>
        </Card>
        <Card className="bg-[var(--surface-2)]">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Password resets</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
            {users.filter((user) => user.mustChangePassword).length}
          </p>
        </Card>
        <Card className="bg-[var(--surface-2)]">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Assignable teams</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{assignableTeams.length}</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <Input
          label="Search users"
          uiSize="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, email, or admin status"
        />

        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="responsive-table w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Teams</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  data-testid={`admin-user-row-${user.id}`}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-3 py-2.5" data-label="User">
                    <p className="font-medium text-[var(--text)]">{user.name}</p>
                    <p className="text-xs text-[var(--muted)]">{user.email}</p>
                  </td>
                  <td className="px-3 py-2.5" data-label="Status">
                    <div className="flex flex-wrap gap-1.5">
                      {user.isSystemAdmin && <Badge variant="blue">SYS ADMIN</Badge>}
                      {user.mustChangePassword && <Badge variant="green">RESET</Badge>}
                      {!user.isVerified && <Badge variant="gray">UNVERIFIED</Badge>}
                      {user.mfaEnabled && <Badge variant="green">MFA</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--muted)]" data-label="Teams">
                    {user.teamMemberships
                      .filter((membership) => !membership.team.isPersonal)
                      .map((membership) => `${membership.team.name} (${membership.role})`)
                      .join(", ") || "No shared teams"}
                  </td>
                  <td className="px-3 py-2.5" data-label="Actions">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEditModal(user)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[var(--danger)]"
                        onClick={() => handleDeleteUser(user.id)}
                        loading={pendingActionId === `delete-${user.id}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              No users matched this filter.
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create user"
        placement="right"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input label="Name" value={createName} onChange={(e) => setCreateName(e.target.value)} required />
          <Input label="Email" type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required />
          <Input
            label="Temporary password"
            type="password"
            value={createTempPassword}
            onChange={(e) => setCreateTempPassword(e.target.value)}
            required
            minLength={8}
          />
          <label className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
            <span>System admin</span>
            <input
              type="checkbox"
              checked={createIsAdmin}
              onChange={(e) => setCreateIsAdmin(e.target.checked)}
            />
          </label>
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Team assignments</p>
            {renderTeamAssignments(createTeams, (teamId, role) =>
              setCreateTeams((prev) => ({ ...prev, [teamId]: role })),
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={pendingActionId === "create-user"}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(editState)}
        onClose={() => setEditState(null)}
        title={editState ? `Edit ${editState.name}` : "Edit user"}
        placement="right"
      >
        {editState && (
          <Tabs
            compact
            appearance="pill"
            tabs={[
              {
                label: "Identity",
                content: (
                  <div className="space-y-4">
                    <Input label="Name" value={editState.name} onChange={(e) => setEditState({ ...editState, name: e.target.value })} />
                    <Input label="Email" type="email" value={editState.email} onChange={(e) => setEditState({ ...editState, email: e.target.value })} />
                    <Input
                      label="Temporary password"
                      type="password"
                      value={editState.tempPassword}
                      onChange={(e) => setEditState({ ...editState, tempPassword: e.target.value })}
                      helperText="Leave blank to keep the current password."
                    />
                  </div>
                ),
              },
              {
                label: "Security",
                content: (
                  <div className="space-y-3">
                    {[
                      ["System admin", "isSystemAdmin"],
                      ["Must change password", "mustChangePassword"],
                      ["Email verified", "isVerified"],
                      ["MFA enabled", "mfaEnabled"],
                    ].map(([label, field]) => (
                      <label
                        key={field}
                        className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(editState[field as keyof EditState])}
                          onChange={(e) =>
                            setEditState({
                              ...editState,
                              [field]: e.target.checked,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                ),
              },
              {
                label: "Teams",
                content: renderTeamAssignments(editState.teams, (teamId, role) =>
                  setEditState({
                    ...editState,
                    teams: { ...editState.teams, [teamId]: role },
                  }),
                ),
              },
            ]}
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditState(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            loading={Boolean(editState && pendingActionId === `save-${editState.id}`)}
            onClick={handleSaveUser}
          >
            Save changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}
