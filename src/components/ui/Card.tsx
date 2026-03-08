import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: boolean;
  tone?: "default" | "subtle" | "inverse";
  interactive?: boolean;
}

const tones = {
  default:
    "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] shadow-[var(--shadow-sm)]",
  subtle:
    "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text)]",
  inverse:
    "bg-[var(--surface-inverse)] border-transparent text-[#0f2238]",
};

export function Card({
  children,
  className = "",
  padding = true,
  tone = "default",
  interactive = false,
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-xl border ${tones[tone]} ${
        interactive
          ? "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]"
          : ""
      } ${padding ? "p-4" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
