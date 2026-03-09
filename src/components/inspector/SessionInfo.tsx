"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface SessionInfoProps {
  slug: string;
  protocol: "OIDC" | "SAML";
  status: "PENDING" | "AUTHENTICATED" | "LOGGED_OUT" | "FAILED";
  authenticatedAt: string;
  runId: string;
  nonceStatus?: string | null;
  hasRpLogout?: boolean;
  hasSamlLogout?: boolean;
}

export function SessionInfo({
  slug,
  protocol,
  status,
  authenticatedAt,
  runId,
  nonceStatus,
  hasRpLogout = false,
  hasSamlLogout = false,
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
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Protocol</span>
        <Badge variant={protocol.toLowerCase() as "oidc" | "saml"} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Slug</span>
        <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text)]">{slug}</code>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
          {status === "PENDING" ? "Started" : "Authenticated"}
        </span>
        <span className="text-sm text-[var(--text)]">{new Date(authenticatedAt).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Status</span>
        <Badge
          variant={
            status === "AUTHENTICATED"
              ? "green"
              : status === "PENDING"
                ? "blue"
                : "gray"
          }
        >
          {status.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Run</span>
        <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text)]">{runId}</code>
      </div>
      {nonceStatus && (
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Nonce</span>
          <Badge variant={nonceStatus === "valid" ? "green" : "gray"}>{nonceStatus}</Badge>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {hasRpLogout && protocol === "OIDC" && (
          <a href={`/api/auth/logout/oidc/${slug}`}>
            <Button variant="secondary" size="sm">
              RP Logout
            </Button>
          </a>
        )}
        {hasSamlLogout && protocol === "SAML" && (
          <a href={`/api/auth/logout/saml/${slug}`}>
            <Button variant="secondary" size="sm">
              SAML SLO
            </Button>
          </a>
        )}
        <Button variant="secondary" size="sm" onClick={handleLogout} loading={loggingOut}>
          Logout
        </Button>
      </div>
    </div>
  );
}
