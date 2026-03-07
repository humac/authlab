"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";

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
  const [memberQuery, setMemberQuery] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
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

  const filteredMembers = useMemo(
    () =>
      (team?.members || []).filter((member) =>
        [member.user.name, member.user.email, member.role]
          .join(" ")
          .toLowerCase()
          .includes(memberQuery.toLowerCase()),
      ),
    [memberQuery, team?.members],
  );

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
      setInviteRole("MEMBER");
      setInviteOpen(false);
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

  const memberTab = (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Input
          label="Search members"
          uiSize="sm"
          value={memberQuery}
          onChange={(event) => setMemberQuery(event.target.value)}
          placeholder="Search members"
        />
        {canManage && !team.isPersonal && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            Invite member
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((member) => (
              <tr key={member.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-[var(--text)]">{member.user.name}</p>
                  <p className="text-xs text-[var(--muted)]">{member.user.email}</p>
                </td>
                <td className="px-3 py-2.5">
                  {member.role === "OWNER" ? (
                    <Badge variant="blue">OWNER</Badge>
                  ) : canManage ? (
                    <select
                      value={member.role}
                      onChange={(event) => handleRoleChange(member.user.id, event.target.value)}
                      className="focus-ring h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                    </select>
                  ) : (
                    <Badge variant={member.role === "ADMIN" ? "green" : "gray"}>
                      {member.role}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {canManage && member.role !== "OWNER" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[var(--danger)]"
                      onClick={() => handleRemoveMember(member.user.id)}
                    >
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const invitesTab = (
    <div className="space-y-3">
      {invites.map((invite) => (
        <div key={invite.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
          <div>
            <p className="font-medium text-[var(--text)]">{invite.email}</p>
            <p className="text-xs text-[var(--muted)]">
              {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="text-[var(--danger)]" onClick={() => handleRevokeInvite(invite.id)}>
            Revoke
          </Button>
        </div>
      ))}
      {invites.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No pending invites.</p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 animate-enter">
      <PageHeader
        title={team.name}
        description="Manage members, roles, and invitations in a denser operations view."
        actions={
          !team.isPersonal && canManage ? (
            <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
              Delete team
            </Button>
          ) : null
        }
      />

      {error && <div className="alert-danger rounded-lg p-3 text-sm">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-[var(--surface-2)]">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Slug</p>
          <p className="mt-2 font-mono text-sm text-[var(--text)]">/{team.slug}</p>
        </Card>
        <Card className="bg-[var(--surface-2)]">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Members</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{team.members.length}</p>
        </Card>
        <Card className="bg-[var(--surface-2)]">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Pending invites</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{invites.length}</p>
        </Card>
      </div>

      <Tabs
        compact
        appearance="pill"
        tabs={[
          { label: "Members", content: memberTab },
          ...(canManage && !team.isPersonal ? [{ label: "Invites", content: invitesTab }] : []),
        ]}
      />

      <Modal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite member"
        placement="right"
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">Role</label>
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
              className="focus-ring h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={inviting}>
              Send invite
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Delete team">
        <p className="text-sm text-[var(--muted)]">
          This permanently deletes <strong>{team.name}</strong> and all app instances in it.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDeleteTeam}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
