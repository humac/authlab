interface BadgeProps {
  variant: "oidc" | "saml";
  className?: string;
}

const variants = {
  oidc: "bg-blue-100 text-blue-800",
  saml: "bg-green-100 text-green-800",
};

export function Badge({ variant, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {variant.toUpperCase()}
    </span>
  );
}
