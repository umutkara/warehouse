import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  padding?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ children, padding = "md", className = "", style }: CardProps) {
  const paddingStyles = {
    sm: "var(--spacing-md)",
    md: "var(--spacing-lg)",
    lg: "var(--spacing-xl)",
  };

  return (
    <div
      className={className}
      style={{
        background: "var(--color-bg)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border)",
        padding: paddingStyles[padding],
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
