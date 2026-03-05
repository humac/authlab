"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function SettingsPage() {
  const user = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [leavingTeamId, setLeavingTeamId] = useState<string | null>(null);
  const forcePasswordChange =
    user.mustChangePassword || searchParams.get("forcePasswordChange") === "1";

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const updates: Record<string, string> = {};
    if (name !== user.name) updates.name = name;
    if (email !== user.email) updates.email = email;

    if (Object.keys(updates).length === 0) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/user/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Update failed");
        return;
      }

      setSuccess("Profile updated");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/user/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Password update failed");
        return;
      }

      setSuccess("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleLeaveTeam(teamId: string) {
    setError("");
    setSuccess("");
    setLeavingTeamId(teamId);

    try {
      const res = await fetch(`/api/teams/${teamId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to leave team");
        return;
      }

      setSuccess("You have left the team");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLeavingTeamId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-enter">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Settings</h1>

      {error && (
        <div className="alert-danger rounded-xl p-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="alert-success rounded-xl p-3 text-sm">
          {success}
        </div>
      )}

      {forcePasswordChange && (
        <div className="alert-warning rounded-xl p-3 text-sm">
          You must change your temporary password before continuing to other pages.
        </div>
      )}

      {!forcePasswordChange && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Profile</h2>
          <form onSubmit={handleProfile} className="space-y-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div className="flex justify-end">
              <Button type="submit" loading={loading}>Save Changes</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Change Password</h2>
        <form onSubmit={handlePassword} className="space-y-4">
          <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>Update Password</Button>
          </div>
        </form>
      </Card>

      {!forcePasswordChange && (
        <>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Team Memberships</h2>
            <div className="space-y-2">
              {user.teams.map((team) => (
                <div key={team.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                  <div>
                    <div className="font-medium text-[var(--text)]">{team.isPersonal ? "Personal Workspace" : team.name}</div>
                    <div className="text-sm text-[var(--muted)]">
                      <span className="mr-2">{team.role}</span>· {team.memberCount} member
                      {team.memberCount !== 1 ? "s" : ""} · {team.appCount} app
                      {team.appCount !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {team.id === user.activeTeamId && <Badge variant="blue">Active</Badge>}
                    {!team.isPersonal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLeaveTeam(team.id)}
                        loading={leavingTeamId === team.id}
                        className="text-[var(--danger)]"
                      >
                        Leave
                      </Button>
                    )}
                    {team.isPersonal && <Badge variant="gray">Required</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card tone="subtle">
            <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">Team Management</h2>
            <p className="text-sm text-[var(--muted)]">
              Team member management and invites are available directly on the dashboard for the active team.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
