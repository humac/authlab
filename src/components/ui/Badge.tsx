interface BadgeProps {
  variant: "oidc" | "saml" | "blue" | "green" | "gray";
  children?: React.ReactNode;
  className?: string;
}

const variants = {
  oidc:
    "border border-blue-300/60 bg-blue-100/70 text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-100",
  saml:
    "border border-teal-300/60 bg-teal-100/70 text-teal-900 dark:border-teal-500/40 dark:bg-teal-500/15 dark:text-teal-100",
  blue:
    "border border-blue-300/60 bg-blue-100/70 text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-100",
  green:
    "border border-emerald-300/60 bg-emerald-100/70 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100",
  gray:
    "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
};

const defaultLabels: Record<string, string> = {
  oidc: "OIDC",
  saml: "SAML",
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${variants[variant]} ${className}`}
    >
      {children || defaultLabels[variant] || variant.toUpperCase()}
    </span>
  );
}
