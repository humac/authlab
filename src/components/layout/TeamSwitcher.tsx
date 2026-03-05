"use client";

import { useState, useRef, useEffect } from "react";
import { useUser, type TeamInfo } from "@/components/providers/UserProvider";

export function TeamSwitcher() {
  const { activeTeamId, teams } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const displayName = activeTeam?.isPersonal
    ? "Personal"
    : activeTeam?.name || "Select Workspace";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function switchTeam(team: TeamInfo) {
    setOpen(false);
    if (team.id === activeTeamId) return;

    const res = await fetch("/api/teams/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: team.id }),
    });

    if (!res.ok) {
      return;
    }

    window.location.assign("/");
  }

  return (
    <div ref={ref} className="relative border-b border-[var(--border)] px-3 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="focus-ring flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)]"
      >
        <svg className="h-4 w-4 shrink-0 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span className="flex-1 truncate text-left">{displayName}</span>
        <svg className={`h-4 w-4 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-md)]">
          {teams.map((team) => {
            const active = team.id === activeTeamId;
            return (
              <button
                key={team.id}
                onClick={() => switchTeam(team)}
                className={`focus-ring flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[color-mix(in_oklab,var(--primary)_15%,transparent)] text-[var(--primary)]"
                    : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="truncate">
                  {team.isPersonal ? "Personal" : team.name}
                </span>
                {active && (
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
