"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";

type TeamRole = "OWNER" | "ADMIN" | "MEMBER";
type JoinRequestRole = "ADMIN" | "MEMBER";
type TeamBadgeVariant = "blue" | "green" | "gray";

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

function roleBadge(role: TeamRole | JoinRequestRole | null): TeamBadgeVariant {
  if (role === "OWNER") return "blue";
  if (role === "ADMIN") return "green";
  return "gray";
}

function getAccessSummary(team: TeamDirectoryTeam) {
  if (team.myPendingRequest) {
    return {
      label: "Request pending",
      helper: "Waiting for an owner or admin review",
      variant: "gray" as const,
    };
  }

  if (team.myRole) {
    return {
      label: team.myRole,
      helper: "Current access level",
      variant: roleBadge(team.myRole),
    };
  }

  return {
    label: "No access",
    helper: "Send a request to join this workspace",
    variant: "gray" as const,
  };
}

function getJoinQueueSummary(team: TeamDirectoryTeam) {
  if (team.pendingJoinRequests.length === 0) {
    return {
      label: "No requests",
      helper: "Nothing waiting for review",
      variant: "gray" as const,
    };
  }

  const count = team.pendingJoinRequests.length;
  return {
    label: `${count} awaiting review`,
    helper: team.canManage
      ? "You can review these requests"
      : "Team admins review these requests",
    variant: "green" as const,
  };
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
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamSlug, setNewTeamSlug] = useState("");
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);

  const [editTarget, setEditTarget] = useState<TeamDirectoryTeam | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingSlug, setEditingSlug] = useState("");
  const [updatingTeam, setUpdatingTeam] = useState(false);

  const [reviewTarget, setReviewTarget] = useState<TeamDirectoryTeam | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

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

  const filteredTeams = useMemo(
    () =>
      teams
        .filter((team) =>
          [team.name, team.slug, team.myRole || ""]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [query, teams],
  );

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setCreatingTeam(true);
    setError("");
    setSuccess("");

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
      setCreateOpen(false);
      setNewTeamName("");
      setNewTeamSlug("");
      setCreateSlugTouched(false);
      setSuccess("Team created");
      await loadDirectory();
      router.refresh();
    } catch {
      setError("An unexpected error occurred while creating team");
    } finally {
      setCreatingTeam(false);
    }
  }

  async function handleUpdateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setUpdatingTeam(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/teams/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName, slug: editingSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update team");
        return;
      }
      setEditTarget(null);
      setSuccess("Team updated");
      await loadDirectory();
    } catch {
      setError("An unexpected error occurred while updating team");
    } finally {
      setUpdatingTeam(false);
    }
  }

  async function handleDeleteTeam(teamId: string) {
    setPendingActionId(`delete-${teamId}`);
    setError("");
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

  async function handleRequestJoin(teamId: string) {
    setPendingActionId(`join-${teamId}`);
    setError("");
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
      setError("An unexpected error occurred while requesting access");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleReviewJoinRequest(requestId: string, action: "approve" | "reject") {
    setPendingActionId(`request-${requestId}`);
    setError("");
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
      setError("An unexpected error occurred while reviewing the request");
    } finally {
      setPendingActionId(null);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-[var(--muted)]">Loading teams...</div>;
  }

  function closeCreateModal() {
    setCreateOpen(false);
    setNewTeamName("");
    setNewTeamSlug("");
    setCreateSlugTouched(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 animate-enter">
      <PageHeader
        title="Teams"
        description="Browse workspaces, request access, and manage pending approvals."
        actions={
          user.isSystemAdmin ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Create team
            </Button>
          ) : null
        }
      />

      {error && <div className="alert-danger rounded-lg p-3 text-sm">{error}</div>}
      {success && <div className="alert-success rounded-lg p-3 text-sm">{success}</div>}

      <Card className="bg-[var(--surface-2)]">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Access state
            </p>
            <p className="mt-1 text-sm text-[var(--text)]">
              Each row shows whether you already have access, still need to request access, or
              have a request waiting for review.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Join queue
            </p>
            <p className="mt-1 text-sm text-[var(--text)]">
              This is the number of incoming join requests waiting for a team owner or admin.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Review flow
            </p>
            <p className="mt-1 text-sm text-[var(--text)]">
              If you can manage a team, use <span className="font-medium">Review requests</span>{" "}
              to approve or reject pending access requests.
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <Input
            label="Search teams"
            uiSize="sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by team name, slug, or your role"
          />
          <p className="text-sm text-[var(--muted)]">
            Access and review states are labeled directly in the table.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="responsive-table w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Access</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2">Join queue</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((team) => {
                const accessSummary = getAccessSummary(team);
                const joinQueueSummary = getJoinQueueSummary(team);

                return (
                <tr
                  key={team.id}
                  data-testid={`team-card-${team.slug}`}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-3 py-2.5" data-label="Team">
                    <div>
                      <p className="font-medium text-[var(--text)]">{team.name}</p>
                      <p className="font-mono text-xs text-[var(--muted)]">/{team.slug}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5" data-label="Access">
                    <div>
                      <Badge variant={accessSummary.variant}>{accessSummary.label}</Badge>
                      <p className="mt-1 text-xs text-[var(--muted)]">{accessSummary.helper}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--muted)]" data-label="Members">{team.members.length}</td>
                  <td className="px-3 py-2.5" data-label="Join queue">
                    <div>
                      <Badge variant={joinQueueSummary.variant}>{joinQueueSummary.label}</Badge>
                      <p className="mt-1 text-xs text-[var(--muted)]">{joinQueueSummary.helper}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5" data-label="Actions">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/teams/${team.id}`}>
                        <Button size="sm" variant="secondary">
                          Open
                        </Button>
                      </Link>
                      {team.canManage && team.pendingJoinRequests.length > 0 && (
                        <Button size="sm" onClick={() => setReviewTarget(team)}>
                          Review requests
                        </Button>
                      )}
                      {!team.myRole && !team.myPendingRequest && (
                        <Button
                          size="sm"
                          onClick={() => handleRequestJoin(team.id)}
                          loading={pendingActionId === `join-${team.id}`}
                        >
                          Request access
                        </Button>
                      )}
                      {team.myPendingRequest && (
                        <Button size="sm" variant="subtle" disabled>
                          Request pending
                        </Button>
                      )}
                      {team.canManage && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditTarget(team);
                              setEditingName(team.name);
                              setEditingSlug(team.slug);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[var(--danger)]"
                            onClick={() => handleDeleteTeam(team.id)}
                            loading={pendingActionId === `delete-${team.id}`}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTeams.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              No teams matched this filter.
            </div>
          )}
        </div>
      </Card>

      <Modal isOpen={createOpen} onClose={closeCreateModal} title="Create team">
        <form onSubmit={handleCreateTeam} className="space-y-4">
          <Input
            label="Name"
            value={newTeamName}
            onChange={(event) => {
              const nextName = event.target.value;
              setNewTeamName(nextName);
              if (!createSlugTouched || !newTeamSlug.trim()) {
                setNewTeamSlug(toSlug(nextName));
              }
            }}
            required
          />
          <Input
            label="Slug"
            value={newTeamSlug}
            onChange={(event) => {
              const nextSlug = toSlug(event.target.value);
              setNewTeamSlug(nextSlug);
              setCreateSlugTouched(nextSlug.length > 0);
            }}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={creatingTeam}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit team">
        <form onSubmit={handleUpdateTeam} className="space-y-4">
          <Input label="Name" value={editingName} onChange={(event) => setEditingName(event.target.value)} required />
          <Input label="Slug" value={editingSlug} onChange={(event) => setEditingSlug(event.target.value)} required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={updatingTeam}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title={reviewTarget ? `Pending requests · ${reviewTarget.name}` : "Pending requests"}
        placement="right"
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--muted)]">
            Approving a request adds the person to the team immediately. Rejecting keeps the team
            private and removes the pending request.
          </div>
          {(reviewTarget?.pendingJoinRequests || []).map((request) => (
            <div key={request.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--text)]">{request.user.name}</p>
                  <p className="text-xs text-[var(--muted)]">{request.user.email}</p>
                  {request.note && (
                    <p className="mt-2 text-sm text-[var(--muted)]">{request.note}</p>
                  )}
                </div>
                <Badge variant={roleBadge(request.role)}>{request.role}</Badge>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleReviewJoinRequest(request.id, "reject")}
                  loading={pendingActionId === `request-${request.id}`}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleReviewJoinRequest(request.id, "approve")}
                  loading={pendingActionId === `request-${request.id}`}
                >
                  Approve
                </Button>
              </div>
            </div>
          ))}
          {reviewTarget && reviewTarget.pendingJoinRequests.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No pending join requests.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
