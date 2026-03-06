"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

interface Stats {
  totalUsers: number;
  totalTeams: number;
  totalApps: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  createdAt: string;
  _count: { teamMemberships: number };
}

interface Team {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  createdAt: string;
  _count: { members: number; appInstances: number };
}

type ProviderType = "SMTP" | "BREVO";

interface ProviderConfigResponse {
  activeProvider: ProviderType | null;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromName: string;
    fromEmail: string;
    hasPassword: boolean;
  };
  brevo: {
    fromName: string;
    fromEmail: string;
    hasApiKey: boolean;
  };
}

export default function AdminSettingsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [provider, setProvider] = useState<ProviderType>("SMTP");
  const [testRecipient, setTestRecipient] = useState("");

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);

  const [brevoApiKey, setBrevoApiKey] = useState("");
  const [brevoFromName, setBrevoFromName] = useState("");
  const [brevoFromEmail, setBrevoFromEmail] = useState("");
  const [brevoHasApiKey, setBrevoHasApiKey] = useState(false);

  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);

  const applyProviderConfig = useCallback((config: ProviderConfigResponse) => {
    setProvider(config.activeProvider || "SMTP");
    setSmtpHost(config.smtp.host || "");
    setSmtpPort(String(config.smtp.port || 587));
    setSmtpSecure(Boolean(config.smtp.secure));
    setSmtpUsername(config.smtp.username || "");
    setSmtpFromName(config.smtp.fromName || "");
    setSmtpFromEmail(config.smtp.fromEmail || "");
    setSmtpHasPassword(config.smtp.hasPassword);
    setBrevoFromName(config.brevo.fromName || "");
    setBrevoFromEmail(config.brevo.fromEmail || "");
    setBrevoHasApiKey(config.brevo.hasApiKey);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [statsRes, settingsRes, usersRes, teamsRes, providerRes] = await Promise.all([
          fetch("/api/admin/stats"),
          fetch("/api/admin/settings"),
          fetch("/api/admin/users"),
          fetch("/api/admin/teams"),
          fetch("/api/admin/email-provider"),
        ]);

        const [statsData, settingsData, usersData, teamsData, providerData] =
          await Promise.all([
            statsRes.json(),
            settingsRes.json(),
            usersRes.json(),
            teamsRes.json(),
            providerRes.json(),
          ]);

        setStats(statsData);
        setSettings(settingsData);
        setUsers(usersData.users || []);
        setTeams(teamsData.teams || []);

        if (providerRes.ok) {
          applyProviderConfig(providerData as ProviderConfigResponse);
        }
      } catch {
        setError("An unexpected error occurred while loading admin settings");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [applyProviderConfig]);

  async function toggleSetting(key: string, current: string) {
    const newValue = current === "true" ? "false" : "true";
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: newValue }),
    });
    setSettings((prev) => ({ ...prev, [key]: newValue }));
  }

  async function toggleAdmin(userId: string, current: boolean) {
    await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSystemAdmin: !current }),
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isSystemAdmin: !current } : u)),
    );
  }

  async function saveEmailProvider() {
    setSavingProvider(true);
    setError("");
    setSuccess("");

    const payload =
      provider === "SMTP"
        ? {
            activeProvider: "SMTP",
            smtp: {
              host: smtpHost,
              port: Number(smtpPort),
              secure: smtpSecure,
              username: smtpUsername,
              password: smtpPassword || undefined,
              fromName: smtpFromName,
              fromEmail: smtpFromEmail,
            },
          }
        : {
            activeProvider: "BREVO",
            brevo: {
              fromName: brevoFromName,
              fromEmail: brevoFromEmail,
              apiKey: brevoApiKey || undefined,
            },
          };

    try {
      const res = await fetch("/api/admin/email-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save email provider config");
        return;
      }

      setSmtpPassword("");
      setBrevoApiKey("");

      const providerRes = await fetch("/api/admin/email-provider");
      const providerData = await providerRes.json();
      if (providerRes.ok) {
        applyProviderConfig(providerData as ProviderConfigResponse);
      }

      setSuccess("Email provider settings saved");
    } catch {
      setError("An unexpected error occurred while saving provider settings");
    } finally {
      setSavingProvider(false);
    }
  }

  async function testEmailProvider() {
    setTestingProvider(true);
    setError("");
    setSuccess("");
    const normalizedRecipient = testRecipient.trim();

    if (!normalizedRecipient) {
      setError("Test recipient email is required");
      setTestingProvider(false);
      return;
    }

    if (provider === "SMTP" && !smtpPassword && !smtpHasPassword) {
      setError("SMTP password is required for test. Save it first or enter it now.");
      setTestingProvider(false);
      return;
    }

    if (provider === "BREVO" && !brevoApiKey.trim() && !brevoHasApiKey) {
      setError("Brevo API key is required for test. Save it first or enter it now.");
      setTestingProvider(false);
      return;
    }

    const payload =
      provider === "SMTP"
        ? {
            provider: "SMTP",
            recipientEmail: normalizedRecipient,
            smtp: {
              host: smtpHost,
              port: Number(smtpPort),
              secure: smtpSecure,
              username: smtpUsername,
              password: smtpPassword || undefined,
              fromName: smtpFromName,
              fromEmail: smtpFromEmail,
            },
          }
        : {
            provider: "BREVO",
            recipientEmail: normalizedRecipient,
            brevo: {
              apiKey: brevoApiKey.trim() || undefined,
              fromName: brevoFromName,
              fromEmail: brevoFromEmail,
            },
          };

    try {
      const res = await fetch("/api/admin/email-provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send test email");
        return;
      }

      setSuccess("Test email sent successfully");
    } catch {
      setError("An unexpected error occurred while testing email provider");
    } finally {
      setTestingProvider(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-[var(--muted)]">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-enter">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Admin Settings</h1>

      {error && <div className="alert-danger rounded-xl p-3 text-sm">{error}</div>}
      {success && <div className="alert-success rounded-xl p-3 text-sm">{success}</div>}

      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <div className="text-3xl font-bold text-[var(--text)]">{stats.totalUsers}</div>
            <div className="text-sm text-[var(--muted)]">Total Users</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-[var(--text)]">{stats.totalTeams}</div>
            <div className="text-sm text-[var(--muted)]">Total Teams</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-[var(--text)]">{stats.totalApps}</div>
            <div className="text-sm text-[var(--muted)]">Total Apps</div>
          </Card>
        </div>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Email Provider</h2>

        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-medium text-[var(--text)]">Active Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderType)}
            className="focus-ring h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
          >
            <option value="SMTP">SMTP</option>
            <option value="BREVO">Brevo API v3</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            label="Test Recipient Email"
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            required
          />
        </div>

        {provider === "SMTP" ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="SMTP Host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} required />
            <Input label="SMTP Port" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} required />
            <Input label="SMTP Username" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} required />
            <Input
              label="SMTP Password"
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder={smtpHasPassword ? "********" : "Enter password"}
              helperText={smtpHasPassword ? "Write-only: leave blank to keep existing password." : undefined}
            />
            <Input label="From Name" value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} required />
            <Input label="From Email" type="email" value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} required />
            <label className="flex items-center gap-2 text-sm text-[var(--text)] md:col-span-2">
              <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
              Use secure SMTP (TLS)
            </label>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="Brevo API Key"
              type="password"
              value={brevoApiKey}
              onChange={(e) => setBrevoApiKey(e.target.value)}
              placeholder={brevoHasApiKey ? "********" : "Enter API key"}
              helperText={brevoHasApiKey ? "Write-only: leave blank to keep existing key." : undefined}
            />
            <Input label="From Name" value={brevoFromName} onChange={(e) => setBrevoFromName(e.target.value)} required />
            <Input label="From Email" type="email" value={brevoFromEmail} onChange={(e) => setBrevoFromEmail(e.target.value)} required />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={saveEmailProvider} loading={savingProvider}>
            Save Provider Settings
          </Button>
          <Button variant="secondary" onClick={testEmailProvider} loading={testingProvider}>
            Test Connection
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">System Settings</h2>
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
          <div>
            <div className="font-medium text-[var(--text)]">Open Registration</div>
            <div className="text-sm text-[var(--muted)]">Allow new users to register accounts</div>
          </div>
          <button
            onClick={() =>
              toggleSetting(
                "registrationEnabled",
                settings.registrationEnabled || "true",
              )
            }
            className={`focus-ring relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(settings.registrationEnabled || "true") === "true" ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]"}`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${(settings.registrationEnabled || "true") === "true" ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Users ({users.length})</h2>
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text)]">{user.name}</span>
                  {user.isSystemAdmin && <Badge variant="blue">Admin</Badge>}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {user.email} · {user._count.teamMemberships} team
                  {user._count.teamMemberships !== 1 ? "s" : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant={user.isSystemAdmin ? "danger" : "secondary"}
                onClick={() => toggleAdmin(user.id, user.isSystemAdmin)}
              >
                {user.isSystemAdmin ? "Remove Admin" : "Make Admin"}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Teams ({teams.length})</h2>
        <div className="space-y-2">
          {teams.map((team) => (
            <div key={team.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text)]">{team.name}</span>
                  {team.isPersonal && <span className="text-xs text-[var(--muted)]">(Personal)</span>}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {team._count.members} member{team._count.members !== 1 ? "s" : ""} · {team._count.appInstances} app
                  {team._count.appInstances !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
