import { ReactNode } from "react";

type AlertVariant = "success" | "error" | "info" | "warning";

interface AlertProps {
  children: ReactNode;
  variant: AlertVariant;
  className?: string;
  style?: React.CSSProperties;
}

export function Alert({ children, variant, className = "", style }: AlertProps) {
  const variantStyles: Record<AlertVariant, React.CSSProperties> = {
    success: {
      background: "var(--color-success-light)",
      color: "var(--color-success)",
      borderColor: "var(--color-success)",
    },
    error: {
      background: "var(--color-danger-light)",
      color: "var(--color-danger)",
      borderColor: "var(--color-danger)",
    },
    info: {
      background: "var(--color-info-light)",
      color: "var(--color-info)",
      borderColor: "var(--color-info)",
    },
    warning: {
      background: "var(--color-warning-light)",
      color: "var(--color-warning)",
      borderColor: "var(--color-warning)",
    },
  };

  return (
    <div
      className={className}
      style={{
        padding: "var(--spacing-md)",
        borderRadius: "var(--radius-md)",
        border: "1px solid",
        fontSize: "14px",
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
