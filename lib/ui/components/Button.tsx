import { ButtonHTMLAttributes, ReactNode, CSSProperties } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  fullWidth?: boolean;
  style?: CSSProperties;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const baseStyles = {
    fontFamily: "var(--font-sans)",
    fontWeight: 600,
    borderRadius: "var(--radius-md)",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all var(--transition-base)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-sm)",
    width: fullWidth ? "100%" : "auto",
    opacity: disabled ? 0.6 : 1,
  };

  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: disabled ? "var(--color-bg-tertiary)" : "var(--color-primary)",
      color: disabled ? "var(--color-text-tertiary)" : "#ffffff",
      boxShadow: disabled ? "none" : "var(--shadow-sm)",
    },
    secondary: {
      background: disabled ? "var(--color-bg-tertiary)" : "var(--color-bg-secondary)",
      color: disabled ? "var(--color-text-tertiary)" : "var(--color-text)",
      border: "1px solid var(--color-border)",
    },
    ghost: {
      background: "transparent",
      color: disabled ? "var(--color-text-tertiary)" : "var(--color-text)",
      border: "1px solid transparent",
    },
    danger: {
      background: disabled ? "var(--color-bg-tertiary)" : "var(--color-danger)",
      color: disabled ? "var(--color-text-tertiary)" : "#ffffff",
    },
  };

  const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
    sm: {
      padding: "6px 12px",
      fontSize: "14px",
      minHeight: "32px",
    },
    md: {
      padding: "10px 16px",
      fontSize: "15px",
      minHeight: "40px",
    },
    lg: {
      padding: "14px 20px",
      fontSize: "16px",
      minHeight: "48px",
    },
  };

  const hoverStyles = disabled
    ? {}
    : variant === "primary"
      ? { background: "var(--color-primary-hover)", transform: "translateY(-1px)", boxShadow: "var(--shadow-md)" }
      : variant === "ghost"
        ? { background: "var(--color-bg-tertiary)" }
        : variant === "danger"
          ? { background: "#b91c1c", transform: "translateY(-1px)", boxShadow: "var(--shadow-md)" }
          : { background: "var(--color-bg-tertiary)", borderColor: "var(--color-text-tertiary)" };

  return (
    <button
      {...props}
      disabled={disabled}
      className={className}
      style={{
        ...baseStyles,
        ...variantStyles[variant],
        ...sizeStyles[size],
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          Object.assign(e.currentTarget.style, hoverStyles);
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = variantStyles[variant].background as string;
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = (variantStyles[variant].boxShadow as string) || "none";
          e.currentTarget.style.borderColor = (variantStyles[variant].border as string) || "transparent";
        }
      }}
      onMouseDown={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(0)";
        }
      }}
    >
      {children}
    </button>
  );
}
