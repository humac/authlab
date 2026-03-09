interface BadgeProps {
  variant: "oidc" | "saml" | "blue" | "green" | "gray" | "red";
  children?: React.ReactNode;
  className?: string;
}

const variants = {
  oidc:
    "border border-[color-mix(in_oklab,#3b82f6_44%,var(--border))] bg-[color-mix(in_oklab,#3b82f6_24%,transparent)] text-[color-mix(in_oklab,#1d4ed8_52%,var(--text))]",
  saml:
    "border border-[color-mix(in_oklab,#14b8a6_44%,var(--border))] bg-[color-mix(in_oklab,#14b8a6_24%,transparent)] text-[color-mix(in_oklab,#0f766e_52%,var(--text))]",
  blue:
    "border border-[color-mix(in_oklab,#3b82f6_44%,var(--border))] bg-[color-mix(in_oklab,#3b82f6_24%,transparent)] text-[color-mix(in_oklab,#1d4ed8_52%,var(--text))]",
  green:
    "border border-[color-mix(in_oklab,#10b981_44%,var(--border))] bg-[color-mix(in_oklab,#10b981_24%,transparent)] text-[color-mix(in_oklab,#047857_52%,var(--text))]",
  red:
    "border border-[color-mix(in_oklab,#ef4444_44%,var(--border))] bg-[color-mix(in_oklab,#ef4444_18%,transparent)] text-[color-mix(in_oklab,#b91c1c_58%,var(--text))]",
  gray:
    "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]",
};

const defaultLabels: Record<string, string> = {
  oidc: "OIDC",
  saml: "SAML",
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex h-5 items-center whitespace-nowrap rounded-md px-2 text-[11px] font-semibold tracking-[0.06em] ${variants[variant]} ${className}`}
    >
      {children || defaultLabels[variant] || variant.toUpperCase()}
    </span>
  );
}
