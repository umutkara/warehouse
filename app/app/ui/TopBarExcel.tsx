"use client";

import { useRouter } from "next/navigation";

export default function TopBarExcel() {
  const router = useRouter();

  return (
    <header
      style={{
        height: 60,
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        boxShadow: "var(--shadow-sm)",
        padding: "0 var(--spacing-lg)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--color-text)" }}>WMS Возвратного потока</div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Units List Button */}
      <button
        onClick={() => router.push("/app/units")}
        style={{
          padding: "8px 16px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "all var(--transition-base)",
          boxShadow: "var(--shadow-sm)",
          marginLeft: "var(--spacing-md)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-primary)";
          e.currentTarget.style.color = "#ffffff";
          e.currentTarget.style.borderColor = "var(--color-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-bg)";
          e.currentTarget.style.color = "var(--color-text)";
          e.currentTarget.style.borderColor = "var(--color-border)";
        }}
      >
        📦 Список заказов
      </button>

      {/* SLA Button */}
      <button
        onClick={() => router.push("/app/sla")}
        style={{
          padding: "8px 16px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "all var(--transition-base)",
          boxShadow: "var(--shadow-sm)",
          marginLeft: "var(--spacing-sm)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-primary)";
          e.currentTarget.style.color = "#ffffff";
          e.currentTarget.style.borderColor = "var(--color-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-bg)";
          e.currentTarget.style.color = "var(--color-text)";
          e.currentTarget.style.borderColor = "var(--color-border)";
        }}
      >
        📊 SLA
      </button>

      {/* Documentation Button */}
      <button
        onClick={() => router.push("/app/docs")}
        style={{
          padding: "8px 16px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "all var(--transition-base)",
          boxShadow: "var(--shadow-sm)",
          marginLeft: "var(--spacing-sm)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-primary)";
          e.currentTarget.style.color = "#ffffff";
          e.currentTarget.style.borderColor = "var(--color-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-bg)";
          e.currentTarget.style.color = "var(--color-text)";
          e.currentTarget.style.borderColor = "var(--color-border)";
        }}
      >
        📖 Справочник
      </button>
    </header>
  );
}
