"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ teamName: string; role: string } | null>(null);

  useEffect(() => {
    fetch("/api/user/me")
      .then((res) => {
        if (!res.ok) {
          router.push(`/login?redirect=/invite/${token}`);
          return;
        }
        setStatus("ready");
      })
      .catch(() => {
        router.push(`/login?redirect=/invite/${token}`);
      });
  }, [token, router]);

  async function handleAccept() {
    setStatus("accepting");
    setError("");

    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to accept invitation");
        setStatus("error");
        return;
      }

      setResult({ teamName: data.teamName, role: data.role });
      setStatus("done");

      await fetch("/api/teams/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: data.teamId }),
      });
    } catch {
      setError("An unexpected error occurred");
      setStatus("error");
    }
  }

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">Loading...</div>;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle compact />
      </div>

      <div className="w-full max-w-md animate-enter">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow-[var(--shadow-sm)]">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-[var(--text)]">AuthLab</span>
        </div>

        <Card>
          {status === "done" && result ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-500">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="mb-2 text-xl font-semibold text-[var(--text)]">
                You&apos;ve joined {result.teamName}
              </h1>
              <p className="mb-4 text-sm text-[var(--muted)]">
                You&apos;ve been added as {result.role.toLowerCase()}.
              </p>
              <Button onClick={() => router.push("/")}>Go to Dashboard</Button>
            </div>
          ) : (
            <>
              <h1 className="mb-4 text-center text-xl font-semibold text-[var(--text)]">Team Invitation</h1>

              {error && (
                <div className="mb-4 rounded-xl border border-red-300/50 bg-red-100/40 p-3 text-sm text-red-600 dark:border-red-600/40 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}

              <p className="mb-6 text-center text-sm text-[var(--muted)]">
                You&apos;ve been invited to join a team on AuthLab.
              </p>

              <div className="flex justify-center gap-3">
                <Button variant="secondary" onClick={() => router.push("/")}>
                  Decline
                </Button>
                <Button onClick={handleAccept} loading={status === "accepting"}>
                  Accept Invitation
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
