"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

function getSafeRedirect(redirect: string | null): string {
  if (!redirect) return "/";
  if (!redirect.startsWith("/")) return "/";
  if (redirect.startsWith("//")) return "/";
  return redirect;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = useMemo(
    () => getSafeRedirect(searchParams.get("redirect")),
    [searchParams],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      if (data.mfaRequired) {
        setMfaRequired(true);
        setInfo("Enter your 6-digit authenticator code to continue.");
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/login/mfa/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "MFA verification failed");
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyLogin() {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const optionsRes = await fetch("/api/user/passkeys/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || undefined }),
      });

      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        setError(options.error || "Failed to start passkey login");
        return;
      }

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/user/passkeys/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: authResponse }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error || "Passkey login failed");
        return;
      }

      if (verifyData.mfaRequired) {
        setMfaRequired(true);
        setInfo("Passkey accepted. Enter your 6-digit authenticator code.");
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError("Passkey login was cancelled or failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="animate-enter">
      <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-[var(--text)]">
        Sign in
      </h1>
      <p className="mb-6 text-center text-sm text-[var(--muted)]">
        Continue to your authentication workspace
      </p>

      {error && (
        <div className="alert-danger mb-4 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}
      {info && (
        <div className="alert-success mb-4 rounded-xl p-3 text-sm">
          {info}
        </div>
      )}

      {!mfaRequired ? (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Button type="submit" className="w-full" loading={loading}>
              Sign In
            </Button>
          </form>

          <div className="my-4 text-center text-xs text-[var(--muted)]">OR</div>

          <Button
            type="button"
            className="w-full"
            variant="secondary"
            onClick={handlePasskeyLogin}
            loading={loading}
          >
            Sign In With Passkey
          </Button>

          <p className="mt-4 text-center text-sm text-[var(--muted)]">
            <Link href="/forgot-password" className="font-medium text-[var(--primary)] hover:underline">
              Forgot password?
            </Link>
          </p>
        </>
      ) : (
        <form onSubmit={handleTotpSubmit} className="space-y-4">
          <Input
            label="Authenticator Code"
            type="text"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            required
            minLength={6}
            maxLength={6}
            inputMode="numeric"
            pattern="[0-9]{6}"
          />
          <Button type="submit" className="w-full" loading={loading}>
            Verify Code
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              setMfaRequired(false);
              setTotpCode("");
              setError("");
              setInfo("");
            }}
          >
            Back
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-[var(--muted)]">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-[var(--primary)] hover:underline">
          Register
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
