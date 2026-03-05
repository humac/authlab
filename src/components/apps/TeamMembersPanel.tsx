"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type TeamRole = "OWNER" | "ADMIN" | "MEMBER";

interface TeamMember {
  id: string;
  role: TeamRole;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface TeamMembersPanelProps {
  teamId: string;
  teamName: string;
  isPersonal: boolean;
  currentUserId: string;
  currentUserRole: TeamRole;
  initialMembers: TeamMember[];
}

function canManage(role: TeamRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function canRemoveMember(
  currentUserRole: TeamRole,
  targetRole: TeamRole,
): boolean {
  if (targetRole === "OWNER") {
    return false;
  }
  if (currentUserRole === "OWNER") {
    return true;
  }
  return currentUserRole === "ADMIN" && targetRole === "MEMBER";
}

function roleBadgeVariant(role: TeamRole): "blue" | "green" | "gray" {
  if (role === "OWNER") return "blue";
  if (role === "ADMIN") return "green";
  return "gray";
}

export function TeamMembersPanel({
  teamId,
  teamName,
  isPersonal,
  currentUserId,
  currentUserRole,
  initialMembers,
}: TeamMembersPanelProps) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("MEMBER");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canManageMembers = canManage(currentUserRole);

  async function refreshMembers() {
    const res = await fetch(`/api/teams/${teamId}`);
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members || []);
  }

  async function handleAddOrInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setAdding(true);

    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add or invite member");
        return;
      }

      if (data.mode === "added") {
        setSuccess("Existing user added to team");
        await refreshMembers();
      } else {
        setSuccess("Invite sent to email");
      }
      setEmail("");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    setError("");
    setSuccess("");
    setRemovingId(member.user.id);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${member.user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to remove member");
        return;
      }
      await refreshMembers();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card className="h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Team Members</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isPersonal ? "Personal Workspace" : teamName} · {members.length} member
          {members.length !== 1 ? "s" : ""}
        </p>
      </div>

      {error && (
        <div className="alert-danger mb-3 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="alert-success mb-3 rounded-xl p-3 text-sm">
          {success}
        </div>
      )}

      <div className="mb-6 max-h-96 space-y-2 overflow-auto pr-1">
        {members.map((member) => (
          <div
            key={member.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[var(--text)]">
                  {member.user.name}
                  {member.user.id === currentUserId ? " (You)" : ""}
                </div>
                <div className="truncate text-xs text-[var(--muted)]">{member.user.email}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
                {canManageMembers && canRemoveMember(currentUserRole, member.role) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={removingId === member.user.id}
                    onClick={() => handleRemoveMember(member)}
                    className="text-[var(--danger)]"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No members found.</p>
        )}
      </div>

      {canManageMembers && !isPersonal && (
        <form onSubmit={handleAddOrInvite} className="space-y-3 border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Add Existing User or Invite by Email
          </h3>
          <Input
            label="User Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
          />
          <div className="flex items-center gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
              className="focus-ring h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <Button type="submit" loading={adding} className="flex-1">
              Add or Invite
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
