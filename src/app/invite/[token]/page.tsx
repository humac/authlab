"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ teamName: string; role: string } | null>(null);

  useEffect(() => {
    // Check if user is authenticated
    fetch("/api/user/me")
      .then((res) => {
        if (!res.ok) {
          // Redirect to login with return to this page
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

      // Switch to the new team
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
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
          <span className="text-2xl font-bold text-gray-900">AuthLab</span>
        </div>

        <Card>
          {status === "done" && result ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                You&apos;ve joined {result.teamName}!
              </h1>
              <p className="text-sm text-gray-500 mb-4">
                You&apos;ve been added as {result.role.toLowerCase()}.
              </p>
              <Button onClick={() => router.push("/")}>Go to Dashboard</Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-4 text-center">
                Team Invitation
              </h1>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                  {error}
                </div>
              )}

              <p className="text-sm text-gray-600 mb-6 text-center">
                You&apos;ve been invited to join a team on AuthLab.
              </p>

              <div className="flex gap-3 justify-center">
                <Button
                  variant="secondary"
                  onClick={() => router.push("/")}
                >
                  Decline
                </Button>
                <Button
                  onClick={handleAccept}
                  loading={status === "accepting"}
                >
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
