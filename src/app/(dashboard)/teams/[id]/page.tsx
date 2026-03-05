"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

interface Member {
  id: string;
  role: string;
  user: { id: string; email: string; name: string };
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitedBy: { name: string };
}

interface TeamData {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  members: Member[];
}

export default function TeamDetailPage() {
  const user = useUser();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const currentTeam = user.teams.find((team) => team.id === id);
  const canManage = currentTeam
    ? currentTeam.role === "OWNER" || currentTeam.role === "ADMIN"
    : false;

  const fetchTeam = useCallback(async () => {
    const res = await fetch(`/api/teams/${id}`);
    if (res.ok) {
      setTeam(await res.json());
    }
  }, [id]);

  const fetchInvites = useCallback(async () => {
    const res = await fetch(`/api/teams/${id}/invites`);
    if (res.ok) {
      setInvites(await res.json());
    }
  }, [id]);

  useEffect(() => {
    const requests = [fetchTeam()];
    if (canManage) {
      requests.push(fetchInvites());
    }
    Promise.all(requests).finally(() => setLoading(false));
  }, [canManage, fetchInvites, fetchTeam]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInviting(true);

    try {
      const res = await fetch(`/api/teams/${id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create invite");
        return;
      }

      setInviteEmail("");
      await fetchInvites();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    await fetch(`/api/invites/${inviteId}`, { method: "DELETE" });
    await fetchInvites();
  }

  async function handleRemoveMember(userId: string) {
    await fetch(`/api/teams/${id}/members/${userId}`, { method: "DELETE" });
    await fetchTeam();
  }

  async function handleRoleChange(userId: string, role: string) {
    await fetch(`/api/teams/${id}/members/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await fetchTeam();
  }

  async function handleDeleteTeam() {
    setDeleting(true);
    const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete team");
      setDeleting(false);
      setShowDelete(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-[var(--muted)]">Loading...</div>;
  }

  if (!team) {
    return <div className="py-12 text-center text-[var(--muted)]">Team not found</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">{team.name}</h1>
          <p className="text-sm text-[var(--muted)]">Manage members, invites, and team roles.</p>
        </div>
        {!team.isPersonal && canManage && (
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            Delete Team
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-300/50 bg-red-100/40 p-3 text-sm text-red-600 dark:border-red-600/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Members</h2>
        <div className="space-y-2">
          {team.members.map((member) => (
            <div key={member.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-[var(--text)]">{member.user.name}</div>
                  <div className="text-sm text-[var(--muted)]">{member.user.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {member.role === "OWNER" ? (
                    <Badge variant="blue">Owner</Badge>
                  ) : canManage ? (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                        className="focus-ring h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[var(--danger)]"
                        onClick={() => handleRemoveMember(member.user.id)}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Badge variant={member.role === "ADMIN" ? "green" : "gray"}>
                      {member.role}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {!team.isPersonal && canManage && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Invite Members</h2>
          <form onSubmit={handleInvite} className="flex flex-col items-end gap-3 md:flex-row">
            <div className="w-full flex-1">
              <Input
                label="Email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="user@example.com"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="focus-ring h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] md:w-auto"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <Button type="submit" loading={inviting}>Invite</Button>
          </form>

          {invites.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-[var(--text)]">Pending Invites</h3>
              <div className="space-y-2">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                    <div>
                      <span className="text-sm text-[var(--text)]">{invite.email}</span>
                      <span className="ml-2 text-xs text-[var(--muted)]">({invite.role})</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[var(--danger)]"
                      onClick={() => handleRevokeInvite(invite.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Delete Team">
        <p className="mb-4 text-sm text-[var(--muted)]">
          This will permanently delete the team &quot;{team.name}&quot; and all app instances.
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} onClick={handleDeleteTeam}>
            Delete Team
          </Button>
        </div>
      </Modal>
    </div>
  );
}
