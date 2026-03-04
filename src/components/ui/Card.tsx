import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: boolean;
}

export function Card({
  children,
  className = "",
  padding = true,
  ...props
}: CardProps) {
  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 shadow-sm ${padding ? "p-6" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
