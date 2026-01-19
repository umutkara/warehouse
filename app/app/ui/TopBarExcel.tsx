"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function TopBarExcel() {
  const router = useRouter();
  const [activeTasks, setActiveTasks] = useState<number>(0);

  async function loadActiveTasks() {
    const r = await fetch("/api/stats/active-tasks", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) setActiveTasks(j.count || 0);
  }

  useEffect(() => {
    loadActiveTasks();
    const t = setInterval(loadActiveTasks, 30000);
    return () => clearInterval(t);
  }, []);

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

      {/* Active Tasks Counter */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 16px",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <span style={{ fontSize: "14px", color: "#6b7280", fontWeight: 600 }}>
          Активные задачи на отгрузку:
        </span>
        <span
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: activeTasks > 0 ? "#2563eb" : "#9ca3af",
            minWidth: "24px",
            textAlign: "center",
          }}
        >
          {activeTasks}
        </span>
      </div>

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
