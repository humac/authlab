"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AppNotes, AppCredential } from "@/types/app-instance";

interface AppNotesEditorProps {
  appId: string;
  initial: AppNotes | null;
  onSaved: (notes: AppNotes) => void;
  onCancel: () => void;
}

function emptyCredential(): AppCredential {
  return { label: "", username: "", password: "" };
}

export function AppNotesEditor({ appId, initial, onSaved, onCancel }: AppNotesEditorProps) {
  const [markdown, setMarkdown] = useState(initial?.markdown ?? "");
  const [credentials, setCredentials] = useState<AppCredential[]>(
    initial?.credentials.length ? initial.credentials : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateCredential(index: number, patch: Partial<AppCredential>) {
    setCredentials((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeCredential(index: number) {
    setCredentials((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Separate fully-empty rows (discard) from partially-filled rows (validate)
      const nonEmpty = credentials.filter(
        (c) => c.label.trim() || c.username.trim() || c.password.trim(),
      );
      const incomplete = nonEmpty.filter((c) => !c.label.trim() || !c.username.trim());
      if (incomplete.length > 0) {
        throw new Error("Each credential needs at least a label and username.");
      }
      const body = {
        notes: {
          markdown,
          credentials: nonEmpty,
        },
      };
      const res = await fetch(`/api/apps/${appId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      // Re-fetch decrypted notes (PUT returns redacted instance without notes content)
      const notesRes = await fetch(`/api/apps/${appId}/notes`, { cache: "no-store" });
      if (notesRes.ok) {
        const notesData = await notesRes.json();
        onSaved(notesData.notes ?? body.notes);
      } else {
        onSaved(body.notes as AppNotes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Credentials */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Shared credentials
          </p>
          {credentials.length < 10 && (
            <button
              type="button"
              onClick={() => setCredentials((prev) => [...prev, emptyCredential()])}
              className="text-xs font-medium text-[var(--primary)] hover:underline"
            >
              + Add credential
            </button>
          )}
        </div>

        {credentials.length === 0 && (
          <button
            type="button"
            onClick={() => setCredentials([emptyCredential()])}
            className="w-full rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            Add a shared credential (e.g. demo account)
          </button>
        )}

        {credentials.map((cred, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={cred.label}
                onChange={(e) => updateCredential(i, { label: e.target.value })}
                placeholder="Label (e.g. Demo Account)"
                maxLength={100}
                className="h-7 flex-1 rounded border-none bg-transparent px-0 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)] placeholder:text-[var(--muted)]/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeCredential(i)}
                className="rounded p-1 text-[var(--muted)] hover:text-[var(--danger)]"
                title="Remove credential"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--muted)]">Username</label>
                <input
                  type="text"
                  value={cred.username}
                  onChange={(e) => updateCredential(i, { username: e.target.value })}
                  placeholder="user@example.com"
                  maxLength={200}
                  className="focus-ring h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 font-mono text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--muted)]">Password</label>
                <input
                  type="text"
                  value={cred.password}
                  onChange={(e) => updateCredential(i, { password: e.target.value })}
                  placeholder="password"
                  maxLength={200}
                  className="focus-ring h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 font-mono text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-[var(--muted)]">Login URL (optional)</label>
              <input
                type="text"
                value={cred.url ?? ""}
                onChange={(e) => updateCredential(i, { url: e.target.value || null })}
                placeholder="https://idp.example.com/login"
                maxLength={500}
                className="focus-ring h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 font-mono text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-[var(--muted)]">Note (optional)</label>
              <input
                type="text"
                value={cred.note ?? ""}
                onChange={(e) => updateCredential(i, { note: e.target.value || null })}
                placeholder="e.g. MFA disabled, use code 123456"
                maxLength={500}
                className="focus-ring h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Freeform notes */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          Notes
        </p>
        <textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder="Setup instructions, gotchas, links..."
          maxLength={5000}
          rows={6}
          className="focus-ring w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50"
        />
        <p className="text-right text-[10px] text-[var(--muted)]">
          {markdown.length}/5000
        </p>
      </div>

      {error && (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} loading={saving}>
          Save Notes
        </Button>
      </div>
    </div>
  );
}
