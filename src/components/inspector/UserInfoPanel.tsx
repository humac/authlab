"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ClaimsTable } from "./ClaimsTable";
import { RawPayloadView } from "./RawPayloadView";

interface UserInfoPanelProps {
  slug: string;
  initialUserInfo: Record<string, unknown> | null;
  idTokenClaims: Record<string, unknown>;
}

export function UserInfoPanel({
  slug,
  initialUserInfo,
  idTokenClaims,
}: UserInfoPanelProps) {
  const [userinfo, setUserinfo] = useState<Record<string, unknown> | null>(
    initialUserInfo,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchUserInfo() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/auth/userinfo/${slug}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to fetch UserInfo");
        return;
      }
      setUserinfo(data.userinfo || null);
    } catch {
      setError("Failed to fetch UserInfo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">UserInfo endpoint</p>
          <p className="text-xs text-[var(--muted)]">
            Compare fetched claims against the ID token claim set.
          </p>
        </div>
        <Button size="sm" onClick={fetchUserInfo} loading={loading}>
          Fetch UserInfo
        </Button>
      </div>

      {error && <div className="alert-danger rounded-lg p-3 text-sm">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            ID token claims
          </p>
          <ClaimsTable claims={idTokenClaims} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            UserInfo claims
          </p>
          <ClaimsTable claims={userinfo ?? {}} />
        </div>
      </div>

      {userinfo && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Raw UserInfo
          </p>
          <RawPayloadView data={JSON.stringify(userinfo, null, 2)} format="json" />
        </div>
      )}
    </div>
  );
}
