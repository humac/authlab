"use client";

import { useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import type { AppNotes } from "@/types/app-instance";

interface AppNotesPanelProps {
  notes: AppNotes | null;
  onEdit: () => void;
}

function CredentialCard({
  label,
  username,
  password,
  url,
  note,
}: {
  label: string;
  username: string;
  password: string;
  url?: string | null;
  note?: string | null;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </p>
      {url && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-[var(--muted)]">URL</span>
            <p className="truncate font-mono text-sm text-[var(--text)]">{url}</p>
          </div>
          <CopyButton text={url} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs text-[var(--muted)]">Username</span>
          <p className="truncate font-mono text-sm text-[var(--text)]">{username}</p>
        </div>
        <CopyButton text={username} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs text-[var(--muted)]">Password</span>
          <p className="truncate font-mono text-sm text-[var(--text)]">
            {showPassword ? password : "\u2022".repeat(Math.min(password.length, 12))}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="rounded p-1 text-[var(--muted)] hover:text-[var(--text)]"
            title={showPassword ? "Hide password" : "Show password"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              {showPassword ? (
                <path d="M2.5 8s2.5-4 5.5-4 5.5 4 5.5 4-2.5 4-5.5 4S2.5 8 2.5 8z M8 6a2 2 0 100 4 2 2 0 000-4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M2 2l12 12M6.5 6.5a2 2 0 002.83 2.83M2.5 8s2.5-4 5.5-4c.97 0 1.85.3 2.6.72M13.5 8s-.87 1.37-2.2 2.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          <CopyButton text={password} />
        </div>
      </div>
      {note && (
        <p className="text-xs text-[var(--muted)] italic">{note}</p>
      )}
    </div>
  );
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AppNotesPanel({ notes, onEdit }: AppNotesPanelProps) {
  if (!notes || (notes.credentials.length === 0 && !notes.markdown)) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-[var(--muted)]">No notes yet</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Add shared credentials or setup instructions for your team.
        </p>
        <Button size="sm" className="mt-4" onClick={onEdit}>
          Add Notes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notes.credentials.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Shared credentials
          </p>
          {notes.credentials.map((cred, i) => (
            <CredentialCard key={i} {...cred} />
          ))}
        </div>
      )}

      {notes.markdown && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Notes
          </p>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="whitespace-pre-wrap text-sm text-[var(--text)]">
              {notes.markdown}
            </p>
          </div>
        </div>
      )}

      {notes.updatedBy && notes.updatedAt && (
        <p className="text-xs text-[var(--muted)]">
          Updated by {notes.updatedBy} · {formatRelativeTime(notes.updatedAt)}
        </p>
      )}

      <Button size="sm" variant="secondary" onClick={onEdit}>
        Edit Notes
      </Button>
    </div>
  );
}
