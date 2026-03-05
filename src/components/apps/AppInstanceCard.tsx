"use client";

import Link from "next/link";
import { useState } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import type { RedactedAppInstance } from "@/types/app-instance";

interface AppInstanceCardProps {
  app: RedactedAppInstance;
  onDelete: (id: string) => void;
  onTransfer: (mode: "MOVE" | "COPY", app: RedactedAppInstance) => void;
}

export function AppInstanceCard({ app, onDelete, onTransfer }: AppInstanceCardProps) {
  const { teams } = useUser();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferringMode, setTransferringMode] = useState<"MOVE" | "COPY" | null>(
    null,
  );

  const sourceMembership = teams.find((team) => team.id === app.teamId);
  const canManageSourceTeam =
    sourceMembership?.role === "OWNER" || sourceMembership?.role === "ADMIN";
  const eligibleTargetTeams = teams.filter(
    (team) =>
      team.id !== app.teamId && (team.role === "OWNER" || team.role === "ADMIN"),
  );

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/apps/${app.id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete(app.id);
      }
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const openTransferModal = () => {
    setTransferError("");
    setTargetTeamId(eligibleTargetTeams[0]?.id || "");
    setShowTransferModal(true);
  };

  const handleTransfer = async (mode: "MOVE" | "COPY") => {
    if (!targetTeamId) {
      setTransferError("Please select a target team");
      return;
    }

    setTransferError("");
    setTransferringMode(mode);
    try {
      const res = await fetch(`/api/apps/${app.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, targetTeamId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTransferError(data.error || "Failed to transfer app");
        return;
      }

      onTransfer(mode, data.app);
      setShowTransferModal(false);
    } finally {
      setTransferringMode(null);
    }
  };

  return (
    <>
      <Card interactive className="flex flex-col justify-between">
        <div>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-[var(--text)]">{app.name}</h3>
              <p className="font-mono text-xs text-[var(--muted)]">/{app.slug}</p>
            </div>
            <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} />
          </div>

          <div className="mb-4 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span
              className="h-4 w-4 rounded-full border border-[var(--border)]"
              style={{ backgroundColor: app.buttonColor || "#3B71CA" }}
            />
            <span>{new Date(app.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--border)] pt-4">
          <Link href={`/test/${app.slug}`} className="flex-1">
            <Button variant="primary" size="sm" className="w-full">
              Test
            </Button>
          </Link>
          <Link href={`/apps/${app.id}`} className="flex-1">
            <Button variant="secondary" size="sm" className="w-full">
              Edit
            </Button>
          </Link>
          {canManageSourceTeam && eligibleTargetTeams.length > 0 && (
            <Button variant="ghost" size="sm" onClick={openTransferModal}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowDeleteModal(true)}>
            <svg className="h-4 w-4 text-[var(--danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </Card>

      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Move or Copy App"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Choose a destination team where you are admin or owner.
          </p>
          <select
            value={targetTeamId}
            onChange={(e) => setTargetTeamId(e.target.value)}
            className="focus-ring h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
          >
            {eligibleTargetTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.isPersonal ? "Personal Workspace" : team.name}
              </option>
            ))}
          </select>

          {transferError && <p className="text-sm text-red-500">{transferError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowTransferModal(false)}>
              Cancel
            </Button>
            <Button
              variant="subtle"
              loading={transferringMode === "COPY"}
              onClick={() => handleTransfer("COPY")}
            >
              Copy
            </Button>
            <Button loading={transferringMode === "MOVE"} onClick={() => handleTransfer("MOVE")}>
              Move
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete App Instance"
      >
        <p className="mb-4 text-sm text-[var(--muted)]">
          Are you sure you want to delete <strong>{app.name}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}
