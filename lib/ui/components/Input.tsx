import { InputHTMLAttributes, CSSProperties } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "style"> {
  fullWidth?: boolean;
  style?: CSSProperties;
}

export function Input({ fullWidth = false, className = "", style, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={className}
      style={{
        width: fullWidth ? "100%" : "auto",
        padding: "10px 14px",
        fontSize: "15px",
        fontFamily: "var(--font-sans)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        outline: "none",
        transition: "all var(--transition-base)",
        ...style,
      }}
      onFocus={(e) => {
        e.target.style.borderColor = "var(--color-primary)";
        e.target.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "var(--color-border)";
        e.target.style.boxShadow = "none";
      }}
    />
  );
}
