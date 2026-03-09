"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewTeamPage() {
  const user = useUser();
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (autoSlug || !slug.trim()) {
      setSlug(toSlug(value));
      setAutoSlug(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create team");
        return;
      }

      const team = await res.json();

      await fetch("/api/teams/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id }),
      });

      router.push("/");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (!user.isSystemAdmin) {
    return (
      <div className="mx-auto max-w-lg animate-enter">
        <Card>
          <h1 className="text-xl font-semibold text-[var(--text)]">Team Creation Restricted</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Only system admins can create teams. You can request access from the Teams page.
          </p>
          <div className="mt-4">
            <Button onClick={() => router.push("/teams")}>Go to Teams</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 animate-enter">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Create Team</h1>
        <p className="text-sm text-[var(--muted)]">Set up a shared workspace for apps and members.</p>
      </div>

      <Card>
        {error && (
          <div className="alert-danger mb-4 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Team Name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            placeholder="My Team"
          />
          <Input
            label="Slug"
            value={slug}
            onChange={(e) => {
              const nextSlug = toSlug(e.target.value);
              setSlug(nextSlug);
              setAutoSlug(nextSlug.length === 0);
            }}
            required
            placeholder="my-team"
            helperText="URL-friendly identifier (lowercase, hyphens only)"
          />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create Team
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
