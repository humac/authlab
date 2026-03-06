"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@/components/providers/UserProvider";

export function UserMenu() {
  const { name, email, hasProfileImage, isSystemAdmin } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    await fetch("/api/user/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative border-t border-[var(--border)] px-3 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-2)]"
      >
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] text-xs font-bold text-[var(--primary)]">
          <span>{initials}</span>
          {hasProfileImage && (
            <Image
              src="/api/user/profile-image"
              alt={`${name} profile`}
              width={32}
              height={32}
              unoptimized
              className="absolute inset-0 h-8 w-8 rounded-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate font-medium text-[var(--text)]">{name}</div>
          <div className="truncate text-xs text-[var(--muted)]">{email}</div>
        </div>
      </button>

      {open && (
        <div className="absolute bottom-full left-3 right-3 z-50 mb-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-md)]">
          <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]">
            Profile
          </Link>
          <Link href="/teams/new" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]">
            Create Team
          </Link>
          {isSystemAdmin && (
            <Link href="/admin/settings" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]">
              Admin Settings
            </Link>
          )}
          <div className="my-1 border-t border-[var(--border)]" />
          <button onClick={handleLogout} className="focus-ring w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]">
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
