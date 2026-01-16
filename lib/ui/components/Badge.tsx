import { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "danger" | "warning" | "info";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  style?: React.CSSProperties;
}

export function Badge({ children, variant = "default", className = "", style }: BadgeProps) {
  const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
    default: {
      background: "var(--color-bg-tertiary)",
      color: "var(--color-text)",
    },
    success: {
      background: "var(--color-success-light)",
      color: "var(--color-success)",
    },
    danger: {
      background: "var(--color-danger-light)",
      color: "var(--color-danger)",
    },
    warning: {
      background: "var(--color-warning-light)",
      color: "var(--color-warning)",
    },
    info: {
      background: "var(--color-info-light)",
      color: "var(--color-info)",
    },
  };

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: "var(--radius-full)",
        fontSize: "12px",
        fontWeight: 600,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
