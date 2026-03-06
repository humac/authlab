"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Missing reset token");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
          totpCode: totpCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reset failed");
        return;
      }
      setSuccess("Password updated. You can now sign in.");
      setNewPassword("");
      setConfirmPassword("");
      setTotpCode("");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-enter">
      <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-[var(--text)]">
        Reset Password
      </h1>
      <p className="mb-6 text-center text-sm text-[var(--muted)]">
        Enter your new password and TOTP code if MFA is enabled
      </p>

      {error && <div className="alert-danger mb-4 rounded-xl p-3 text-sm">{error}</div>}
      {success && <div className="alert-success mb-4 rounded-xl p-3 text-sm">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="New Password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
        />
        <Input
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />
        <Input
          label="Authenticator Code (if enabled)"
          type="text"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
          inputMode="numeric"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
        />
        <Button type="submit" className="w-full" loading={loading}>
          Reset Password
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
