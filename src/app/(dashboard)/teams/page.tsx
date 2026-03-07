"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type TeamRole = "OWNER" | "ADMIN" | "MEMBER";
type JoinRequestRole = "ADMIN" | "MEMBER";

interface TeamDirectoryMember {
  id: string;
  role: TeamRole;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface TeamJoinRequest {
  id: string;
  role: JoinRequestRole;
  note?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface TeamDirectoryTeam {
  id: string;
  name: string;
  slug: string;
  myRole: TeamRole | null;
  canManage: boolean;
  myPendingRequest: { id: string } | null;
  members: TeamDirectoryMember[];
  pendingJoinRequests: TeamJoinRequest[];
}

function roleBadge(role: TeamRole | JoinRequestRole) {
  if (role === "OWNER") return "blue";
  if (role === "ADMIN") return "green";
  return "gray";
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function TeamsPage() {
  const user = useUser();
  const router = useRouter();

  const [teams, setTeams] = useState<TeamDirectoryTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamSlug, setNewTeamSlug] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingSlug, setEditingSlug] = useState("");
  const [updatingTeam, setUpdatingTeam] = useState(false);

  const [memberForms, setMemberForms] = useState<
    Record<string, { email: string; role: JoinRequestRole }>
  >({});
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const isSystemAdmin = user.isSystemAdmin;

  async function loadDirectory() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/teams/directory");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load teams");
        return;
      }
      setTeams(data.teams || []);
    } catch {
      setError("An unexpected error occurred while loading teams");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDirectory();
  }, []);

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );

  function getMemberForm(teamId: string) {
    return memberForms[teamId] || { email: "", role: "MEMBER" };
  }

  function updateMemberForm(
    teamId: string,
    field: "email" | "role",
    value: string,
  ) {
    setMemberForms((prev) => ({
      ...prev,
      [teamId]: {
        ...getMemberForm(teamId),
        [field]: value,
      },
    }));
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCreatingTeam(true);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTeamName,
          slug: newTeamSlug || toSlug(newTeamName),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create team");
        return;
      }
      setSuccess("Team created");
      setNewTeamName("");
      setNewTeamSlug("");
      await loadDirectory();
      router.refresh();
    } catch {
      setError("An unexpected error occurred while creating team");
    } finally {
      setCreatingTeam(false);
    }
  }

  async function handleUpdateTeam(teamId: string) {
    setError("");
    setSuccess("");
    setUpdatingTeam(true);

    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName, slug: editingSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update team");
        return;
      }
      setSuccess("Team updated");
      setEditingTeamId(null);
      await loadDirectory();
    } catch {
      setError("An unexpected error occurred while updating team");
    } finally {
      setUpdatingTeam(false);
    }
  }

  async function handleDeleteTeam(teamId: string) {
    if (!confirm("Delete this team? This cannot be undone.")) return;
    setError("");
    setSuccess("");
    setPendingActionId(`delete-${teamId}`);
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete team");
        return;
      }
      setSuccess("Team deleted");
      await loadDirectory();
      router.refresh();
    } catch {
      setError("An unexpected error occurred while deleting team");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleAddMember(teamId: string, e: React.FormEvent) {
    e.preventDefault();
    const form = getMemberForm(teamId);
    setError("");
    setSuccess("");
    setPendingActionId(`member-${teamId}`);
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, role: form.role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add/invite member");
        return;
      }
      setSuccess(
        data.mode === "invited"
          ? `Invite sent to ${form.email}`
          : `Added ${form.email} to team`,
      );
      setMemberForms((prev) => ({
        ...prev,
        [teamId]: { email: "", role: "MEMBER" },
      }));
      await loadDirectory();
    } catch {
      setError("An unexpected error occurred while adding member");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleRequestJoin(teamId: string) {
    setError("");
    setSuccess("");
    setPendingActionId(`join-${teamId}`);
    try {
      const res = await fetch(`/api/teams/${teamId}/join-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "MEMBER" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit join request");
        return;
      }
      setSuccess("Join request submitted");
      await loadDirectory();
    } catch {
      setError("An unexpected error occurred while requesting to join");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleReviewJoinRequest(
    requestId: string,
    action: "approve" | "reject",
  ) {
    setError("");
    setSuccess("");
    setPendingActionId(`request-${requestId}`);
    try {
      const res = await fetch(`/api/teams/join-requests/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to review request");
        return;
      }
      setSuccess(action === "approve" ? "Join request approved" : "Join request rejected");
      await loadDirectory();
      router.refresh();
    } catch {
      setError("An unexpected error occurred while reviewing request");
    } finally {
      setPendingActionId(null);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-[var(--muted)]">Loading teams...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-enter">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Teams</h1>
        <p className="text-sm text-[var(--muted)]">
          Browse teams and members. Admins can manage teams, members, and join requests.
        </p>
      </div>

      {error && <div className="alert-danger rounded-xl p-3 text-sm">{error}</div>}
      {success && <div className="alert-success rounded-xl p-3 text-sm">{success}</div>}

      {isSystemAdmin && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Create Team</h2>
          <form onSubmit={handleCreateTeam} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Input
              label="Name"
              value={newTeamName}
              onChange={(e) => {
                setNewTeamName(e.target.value);
                if (!newTeamSlug || newTeamSlug === toSlug(newTeamName)) {
                  setNewTeamSlug(toSlug(e.target.value));
                }
              }}
              required
            />
            <Input
              label="Slug"
              value={newTeamSlug}
              onChange={(e) => setNewTeamSlug(e.target.value)}
              required
            />
            <div className="md:self-end">
              <Button type="submit" loading={creatingTeam}>Create Team</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-4">
        {sortedTeams.map((team) => {
          const memberForm = getMemberForm(team.id);
          const isEditing = editingTeamId === team.id;

          return (
            <Card key={team.id} data-testid={`team-card-${team.slug}`}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        label="Team Name"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        required
                      />
                      <Input
                        label="Slug"
                        value={editingSlug}
                        onChange={(e) => setEditingSlug(e.target.value)}
                        required
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateTeam(team.id)}
                          loading={updatingTeam}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingTeamId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold text-[var(--text)]">{team.name}</h2>
                      <p className="font-mono text-xs text-[var(--muted)]">/{team.slug}</p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {team.myRole && (
                    <Badge variant={roleBadge(team.myRole)}>
                      {team.myRole}
                    </Badge>
                  )}
                  {!team.myRole && team.myPendingRequest && (
                    <Badge variant="gray">Request Pending</Badge>
                  )}
                  {team.canManage && !isEditing && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingTeamId(team.id);
                          setEditingName(team.name);
                          setEditingSlug(team.slug);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={pendingActionId === `delete-${team.id}`}
                        onClick={() => handleDeleteTeam(team.id)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                  {!team.canManage && !team.myRole && !team.myPendingRequest && (
                    <Button
                      size="sm"
                      loading={pendingActionId === `join-${team.id}`}
                      onClick={() => handleRequestJoin(team.id)}
                    >
                      Request to Join
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="mb-2 text-sm font-medium text-[var(--text)]">
                  Members ({team.members.length})
                </p>
                <div className="space-y-2">
                  {team.members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--text)]">{member.user.name}</p>
                        <p className="text-xs text-[var(--muted)]">{member.user.email}</p>
                      </div>
                      <Badge variant={roleBadge(member.role)}>{member.role}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {team.canManage && (
                <div className="mt-4 space-y-4">
                  <form onSubmit={(e) => handleAddMember(team.id, e)} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                    <Input
                      label="Add Member by Email"
                      type="email"
                      value={memberForm.email}
                      onChange={(e) => updateMemberForm(team.id, "email", e.target.value)}
                      required
                      placeholder="user@example.com"
                    />
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-[var(--text)]">Role</label>
                      <select
                        value={memberForm.role}
                        onChange={(e) => updateMemberForm(team.id, "role", e.target.value)}
                        className="focus-ring h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>
                    <div className="md:self-end">
                      <Button type="submit" loading={pendingActionId === `member-${team.id}`}>
                        Add or Invite
                      </Button>
                    </div>
                  </form>

                  {team.pendingJoinRequests.length > 0 && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                      <p className="mb-2 text-sm font-medium text-[var(--text)]">
                        Pending Join Requests ({team.pendingJoinRequests.length})
                      </p>
                      <div className="space-y-2">
                        {team.pendingJoinRequests.map((request) => (
                          <div key={request.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-[var(--text)]">{request.user.name}</p>
                              <p className="text-xs text-[var(--muted)]">
                                {request.user.email} · requested {request.role.toLowerCase()}
                              </p>
                              {request.note && (
                                <p className="text-xs text-[var(--muted)]">Note: {request.note}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                loading={pendingActionId === `request-${request.id}`}
                                onClick={() => handleReviewJoinRequest(request.id, "approve")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={pendingActionId === `request-${request.id}`}
                                onClick={() => handleReviewJoinRequest(request.id, "reject")}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {sortedTeams.length === 0 && (
          <Card tone="subtle">
            <p className="text-sm text-[var(--muted)]">No teams available.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
