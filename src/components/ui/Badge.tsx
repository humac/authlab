interface BadgeProps {
  variant: "oidc" | "saml" | "blue" | "green" | "gray";
  children?: React.ReactNode;
  className?: string;
}

const variants = {
  oidc: "bg-blue-100 text-blue-800",
  saml: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
  gray: "bg-gray-100 text-gray-800",
};

const defaultLabels: Record<string, string> = {
  oidc: "OIDC",
  saml: "SAML",
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children || defaultLabels[variant] || variant.toUpperCase()}
    </span>
  );
}
