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
    <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Protocol:</span>
        <Badge variant={protocol.toLowerCase() as "oidc" | "saml"} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Slug:</span>
        <code className="text-sm font-mono text-gray-700">{slug}</code>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Authenticated:</span>
        <span className="text-sm text-gray-700">
          {new Date(authenticatedAt).toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Cookie:</span>
        <code className="text-sm font-mono text-gray-700">
          authlab_{slug}
        </code>
      </div>
      <div className="ml-auto">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleLogout}
          loading={loggingOut}
        >
          Logout
        </Button>
      </div>
    </div>
  );
}
