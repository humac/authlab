"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import type { RedactedAppInstance } from "@/types/app-instance";

interface AppInstanceCardProps {
  app: RedactedAppInstance;
  onDelete: (id: string) => void;
}

export function AppInstanceCard({ app, onDelete }: AppInstanceCardProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <>
      <Card className="flex flex-col justify-between hover:shadow-md transition-shadow">
        <div>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">{app.name}</h3>
              <p className="text-sm text-gray-500 font-mono">/{app.slug}</p>
            </div>
            <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} />
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-4 h-4 rounded-full border border-gray-200"
              style={{ backgroundColor: app.buttonColor || "#3B71CA" }}
            />
            <span className="text-xs text-gray-400">
              {new Date(app.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-gray-100">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
          >
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </Card>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete App Instance"
      >
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete <strong>{app.name}</strong>? This
          action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={() => setShowDeleteModal(false)}
          >
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
