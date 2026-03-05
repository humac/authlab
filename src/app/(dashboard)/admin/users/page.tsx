"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

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
  createdAt: string;
  teamMemberships: UserMembership[];
}

interface EditState {
  id: string;
  name: string;
  email: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
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
    if (!confirm("Delete this user? This action cannot be undone.")) return;

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
      <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        {assignableTeams.map((team) => {
          const selectedRole = selection[team.id];
          return (
            <div key={team.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">{team.name}</p>
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
                  className="focus-ring h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] disabled:opacity-60"
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
    <div className="mx-auto max-w-6xl space-y-6 animate-enter">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">User Management</h1>
        <p className="text-sm text-[var(--muted)]">
          Create, update, and remove users. Temporary passwords force reset on first login.
        </p>
      </div>

      {error && <div className="alert-danger rounded-xl p-3 text-sm">{error}</div>}
      {success && <div className="alert-success rounded-xl p-3 text-sm">{success}</div>}

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Create User</h2>
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              required
            />
          </div>
          <Input
            label="Temporary Password"
            type="password"
            value={createTempPassword}
            onChange={(e) => setCreateTempPassword(e.target.value)}
            required
            minLength={8}
            helperText="User will be forced to change this password on first login."
          />
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={createIsAdmin}
              onChange={(e) => setCreateIsAdmin(e.target.checked)}
            />
            System admin
          </label>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text)]">Team Assignments</p>
            {renderTeamAssignments(createTeams, (teamId, role) =>
              setCreateTeams((prev) => ({ ...prev, [teamId]: role })),
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={pendingActionId === "create-user"}>
              Create User
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Users ({users.length})</h2>
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--text)]">{user.name}</span>
                  {user.isSystemAdmin && <Badge variant="blue">Admin</Badge>}
                  {user.mustChangePassword && <Badge variant="gray">Password Reset Required</Badge>}
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {user.email} · {user.teamMemberships.length} team membership
                  {user.teamMemberships.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEditModal(user)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={pendingActionId === `delete-${user.id}`}
                  onClick={() => handleDeleteUser(user.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        isOpen={!!editState}
        onClose={() => setEditState(null)}
        title="Edit User"
        size="lg"
      >
        {editState && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                label="Name"
                value={editState.name}
                onChange={(e) => setEditState((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                required
              />
              <Input
                label="Email"
                type="email"
                value={editState.email}
                onChange={(e) => setEditState((prev) => (prev ? { ...prev, email: e.target.value } : prev))}
                required
              />
            </div>

            <Input
              label="Reset Temporary Password (optional)"
              type="password"
              value={editState.tempPassword}
              onChange={(e) => setEditState((prev) => (prev ? { ...prev, tempPassword: e.target.value } : prev))}
              minLength={8}
              helperText="When set, the user must change password at next login."
            />

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={editState.isSystemAdmin}
                  onChange={(e) => setEditState((prev) => (prev ? { ...prev, isSystemAdmin: e.target.checked } : prev))}
                />
                System admin
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={editState.mustChangePassword}
                  onChange={(e) => setEditState((prev) => (prev ? { ...prev, mustChangePassword: e.target.checked } : prev))}
                />
                Require password change
              </label>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--text)]">Team Assignments</p>
              {renderTeamAssignments(editState.teams, (teamId, role) =>
                setEditState((prev) =>
                  prev
                    ? { ...prev, teams: { ...prev.teams, [teamId]: role } }
                    : prev,
                ),
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditState(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveUser}
                loading={pendingActionId === `save-${editState.id}`}
              >
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
