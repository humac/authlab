"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { startRegistration } from "@simplewebauthn/browser";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

interface PasskeyItem {
  id: string;
  credentialId: string;
  createdAt: string;
  lastUsedAt: string | null;
}

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

  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(user.mfaEnabled);
  const [totpQr, setTotpQr] = useState("");
  const [totpManualKey, setTotpManualKey] = useState("");
  const [totpVerifyCode, setTotpVerifyCode] = useState("");
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpDisablePassword, setTotpDisablePassword] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarHasError, setAvatarHasError] = useState(false);

  const forcePasswordChange =
    user.mustChangePassword || searchParams.get("forcePasswordChange") === "1";

  const avatarUrl = useMemo(
    () => `/api/user/profile-image?v=${avatarVersion}`,
    [avatarVersion],
  );
  const avatarFallback =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23dfe7f6'/%3E%3Ctext x='50%25' y='53%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%233B71CA'%3E%3F%3C/text%3E%3C/svg%3E";

  async function loadPasskeys() {
    setLoadingPasskeys(true);
    try {
      const res = await fetch("/api/user/passkeys");
      const data = await res.json();
      if (res.ok) {
        setPasskeys(data.credentials || []);
      }
    } finally {
      setLoadingPasskeys(false);
    }
  }

  useEffect(() => {
    setAvatarHasError(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!forcePasswordChange) {
      void loadPasskeys();
    }
  }, [forcePasswordChange]);

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

  async function handleStartTotpSetup() {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/mfa/totp/setup/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start MFA setup");
        return;
      }
      setTotpQr(data.qrCodeDataUrl || "");
      setTotpManualKey(data.manualKey || "");
      setSuccess("Scan the QR code and verify with a 6-digit code.");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyTotpSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/mfa/totp/setup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpVerifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to verify MFA setup");
        return;
      }

      setMfaEnabled(true);
      setTotpVerifyCode("");
      setTotpQr("");
      setTotpManualKey("");
      setSuccess("MFA enabled");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisableTotp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/mfa/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: totpDisablePassword,
          code: totpDisableCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to disable MFA");
        return;
      }

      setMfaEnabled(false);
      setTotpDisableCode("");
      setTotpDisablePassword("");
      setSuccess("MFA disabled");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPasskey() {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const optionsRes = await fetch("/api/user/passkeys/register/options", {
        method: "POST",
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        setError(options.error || "Failed to start passkey setup");
        return;
      }

      const registrationResponse = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/user/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: registrationResponse }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error || "Failed to save passkey");
        return;
      }

      setSuccess("Passkey added");
      await loadPasskeys();
    } catch {
      setError("Passkey registration cancelled or failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    setError("");
    setSuccess("");

    const res = await fetch(`/api/user/passkeys/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to delete passkey");
      return;
    }

    setSuccess("Passkey removed");
    await loadPasskeys();
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    setSuccess("");

    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const res = await fetch("/api/user/profile-image", {
        method: "PUT",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to upload image");
        return;
      }

      setAvatarVersion((v) => v + 1);
      setAvatarHasError(false);
      setSuccess("Profile image updated");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  async function handleAvatarDelete() {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/profile-image", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to remove image");
        return;
      }
      setAvatarVersion((v) => v + 1);
      setAvatarHasError(false);
      setSuccess("Profile image removed");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-enter">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Profile</h1>

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

          <div className="mb-4 flex items-center gap-4">
            <Image
              src={avatarHasError ? avatarFallback : avatarUrl}
              alt="Profile"
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 rounded-full border border-[var(--border)] object-cover"
              onError={() => setAvatarHasError(true)}
            />
            <div className="space-y-2">
              <Input
                label="Upload Profile Image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                helperText="JPEG/PNG/WebP up to 2MB. EXIF metadata is stripped."
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleAvatarDelete}>
                Remove Image
              </Button>
            </div>
          </div>

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
          <Card data-testid="mfa-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text)]">MFA (TOTP)</h2>
              <Badge variant={mfaEnabled ? "green" : "gray"}>{mfaEnabled ? "Enabled" : "Disabled"}</Badge>
            </div>

            {!mfaEnabled ? (
              <div className="space-y-4">
                <Button type="button" onClick={handleStartTotpSetup} loading={loading}>
                  Start MFA Setup
                </Button>

                {totpQr && (
                  <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <Image
                      src={totpQr}
                      alt="TOTP QR"
                      width={160}
                      height={160}
                      unoptimized
                      className="h-40 w-40 rounded-lg border border-[var(--border)] bg-white p-2"
                    />
                    <Input label="Manual Key" value={totpManualKey} readOnly />
                    <form onSubmit={handleVerifyTotpSetup} className="space-y-3">
                      <Input
                        label="Verification Code"
                        value={totpVerifyCode}
                        onChange={(e) => setTotpVerifyCode(e.target.value)}
                        required
                        pattern="[0-9]{6}"
                        maxLength={6}
                      />
                      <Button type="submit" loading={loading}>Enable MFA</Button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleDisableTotp} className="space-y-4">
                <Input
                  label="Current Password"
                  type="password"
                  value={totpDisablePassword}
                  onChange={(e) => setTotpDisablePassword(e.target.value)}
                  required
                />
                <Input
                  label="Authenticator Code"
                  type="text"
                  value={totpDisableCode}
                  onChange={(e) => setTotpDisableCode(e.target.value)}
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                />
                <Button type="submit" variant="danger" loading={loading}>Disable MFA</Button>
              </form>
            )}
          </Card>

          <Card data-testid="passkeys-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text)]">Passkeys</h2>
              <Button type="button" size="sm" onClick={handleAddPasskey} loading={loading}>
                Add Passkey
              </Button>
            </div>

            {loadingPasskeys ? (
              <p className="text-sm text-[var(--muted)]">Loading passkeys...</p>
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No passkeys enrolled.</p>
            ) : (
              <div className="space-y-2">
                {passkeys.map((passkey) => (
                  <div
                    key={passkey.id}
                    data-testid={`passkey-row-${passkey.id}`}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">Credential {passkey.credentialId.slice(0, 12)}...</p>
                      <p className="text-xs text-[var(--muted)]">
                        Added {new Date(passkey.createdAt).toLocaleString()} · Last used {passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleString() : "Never"}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleDeletePasskey(passkey.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

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
