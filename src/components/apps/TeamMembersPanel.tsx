"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

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
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("MEMBER");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const canManageMembers = canManage(currentUserRole);
  const filteredMembers = useMemo(
    () =>
      members.filter((member) =>
        [member.user.name, member.user.email, member.role]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [members, query],
  );

  async function refreshMembers() {
    const res = await fetch(`/api/teams/${teamId}`);
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members || []);
  }

  async function handleAddOrInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
        await refreshMembers();
      }
      setEmail("");
      setRole("MEMBER");
      setDrawerOpen(false);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <Card className="h-full space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Team members</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isPersonal ? "Personal workspace" : teamName} · {members.length} seats
            </p>
          </div>
          {canManageMembers && !isPersonal && (
            <Button size="sm" onClick={() => setDrawerOpen(true)}>
              Invite
            </Button>
          )}
        </div>

        <Input
          label="Search members"
          uiSize="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name, email, or role"
        />

        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="responsive-table w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <tr key={member.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2.5" data-label="Member">
                    <div>
                      <p className="font-medium text-[var(--text)]">
                        {member.user.name}
                        {member.user.id === currentUserId ? " (You)" : ""}
                      </p>
                      <p className="text-xs text-[var(--muted)]">{member.user.email}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5" data-label="Role">
                    <Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredMembers.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              No members matched this filter.
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Invite team member"
        placement="right"
      >
        <form onSubmit={handleAddOrInvite} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Role
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as TeamRole)}
              className="focus-ring h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {error && <div className="alert-danger rounded-lg p-3 text-sm">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={adding}>
              Add or Invite
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
