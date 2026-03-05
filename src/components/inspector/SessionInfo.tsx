"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface SessionInfoProps {
  slug: string;
  protocol: "OIDC" | "SAML";
  authenticatedAt: string;
}

export function SessionInfo({
  slug,
  protocol,
  authenticatedAt,
}: SessionInfoProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch(`/api/auth/logout?slug=${slug}`, { method: "POST" });
    router.push(`/test/${slug}`);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Protocol:</span>
        <Badge variant={protocol.toLowerCase() as "oidc" | "saml"} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Slug:</span>
        <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-sm text-[var(--text)]">{slug}</code>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Authenticated:</span>
        <span className="text-sm text-[var(--text)]">{new Date(authenticatedAt).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Cookie:</span>
        <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-sm text-[var(--text)]">authlab_{slug}</code>
      </div>
      <div className="ml-auto">
        <Button variant="secondary" size="sm" onClick={handleLogout} loading={loggingOut}>
          Logout
        </Button>
      </div>
    </div>
  );
}
