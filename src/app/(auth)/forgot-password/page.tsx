"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/user/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      setSuccess(
        data.message ||
          "If an account exists, a password reset email has been sent.",
      );
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-enter">
      <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-[var(--text)]">
        Forgot Password
      </h1>
      <p className="mb-6 text-center text-sm text-[var(--muted)]">
        Request a password reset link
      </p>

      {error && <div className="alert-danger mb-4 rounded-xl p-3 text-sm">{error}</div>}
      {success && <div className="alert-success mb-4 rounded-xl p-3 text-sm">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" loading={loading}>
          Send Reset Link
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-[var(--muted)]">
        <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">
          Back to login
        </Link>
      </p>
    </Card>
  );
}
