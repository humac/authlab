"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    async function verify() {
      if (!token) {
        setStatus("error");
        setMessage("Missing verification token.");
        return;
      }

      try {
        const res = await fetch(`/api/user/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "Verification failed");
          return;
        }

        setStatus("success");
        setMessage("Email verified. You can now sign in.");
      } catch {
        setStatus("error");
        setMessage("An unexpected error occurred");
      }
    }

    verify();
  }, [token]);

  return (
    <Card className="animate-enter">
      <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-[var(--text)]">
        Verify Email
      </h1>
      <p className="mb-6 text-center text-sm text-[var(--muted)]">{message}</p>

      <div
        className={`rounded-xl p-3 text-sm ${
          status === "success" ? "alert-success" : status === "error" ? "alert-danger" : "bg-[var(--surface-2)] text-[var(--muted)]"
        }`}
      >
        {status === "loading" && "Please wait while we verify your account."}
        {status === "success" && "Verification complete."}
        {status === "error" && "Verification could not be completed."}
      </div>

      <p className="mt-5 text-center text-sm text-[var(--muted)]">
        <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">
          Go to login
        </Link>
      </p>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
