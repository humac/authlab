"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);

  // Delete modal
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function fetchTeam() {
    const res = await fetch(`/api/teams/${id}`);
    if (res.ok) {
      setTeam(await res.json());
    }
  }

  async function fetchInvites() {
    const res = await fetch(`/api/teams/${id}/invites`);
    if (res.ok) {
      setInvites(await res.json());
    }
  }

  useEffect(() => {
    Promise.all([fetchTeam(), fetchInvites()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    return (
      <div className="flex justify-center py-12 text-gray-500">Loading...</div>
    );
  }

  if (!team) {
    return (
      <div className="flex justify-center py-12 text-gray-500">
        Team not found
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
        {!team.isPersonal && (
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            Delete Team
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Members */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Members</h2>
        <div className="divide-y divide-gray-100">
          {team.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <div className="font-medium text-gray-900">
                  {member.user.name}
                </div>
                <div className="text-sm text-gray-500">{member.user.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {member.role === "OWNER" ? (
                  <Badge variant="blue">Owner</Badge>
                ) : (
                  <>
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleRoleChange(member.user.id, e.target.value)
                      }
                      className="text-sm border border-gray-200 rounded px-2 py-1"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                    </select>
                    <button
                      onClick={() => handleRemoveMember(member.user.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Invite */}
      {!team.isPersonal && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Invite Members
          </h2>
          <form onSubmit={handleInvite} className="flex gap-3 items-end">
            <div className="flex-1">
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
              className="h-10 border border-gray-200 rounded-lg px-3 text-sm"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <Button type="submit" loading={inviting}>
              Invite
            </Button>
          </form>

          {invites.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Pending Invites
              </h3>
              <div className="divide-y divide-gray-100">
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <span className="text-sm text-gray-900">
                        {invite.email}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({invite.role})
                      </span>
                    </div>
                    <button
                      onClick={() => handleRevokeInvite(invite.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Delete Modal */}
      <Modal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete Team"
      >
        <p className="text-sm text-gray-600 mb-4">
          This will permanently delete the team &quot;{team.name}&quot; and all its app
          instances. This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
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
