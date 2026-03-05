import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          <div>
            <p className="text-2xl font-bold tracking-tight text-[var(--text)]">AuthLab</p>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Secure Sandbox</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
