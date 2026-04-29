"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const TopIcons = {
  Units: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="12" height="10" rx="1" />
      <path d="M7 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  ),
  Admin: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4M10 13h.01" />
      <path d="M4.5 15.5l2.2-2.2M15.5 15.5l-2.2-2.2" />
    </svg>
  ),
  SLA: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </svg>
  ),
  Statistics: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16V9M10 16V5M16 16V11" />
      <path d="M3 16h14" />
    </svg>
  ),
  Docs: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h8l3 3v11a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M9 8h4M9 12h4M9 16h2" />
    </svg>
  ),
  Map: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6l4-2 6 2 4-2v10l-4 2-6-2-4 2V6z" />
    </svg>
  ),
  Logout: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a1 1 0 00-1 1v12a1 1 0 001 1h3" />
      <path d="M12 7l4 3-4 3" />
      <path d="M16 10H8" />
    </svg>
  ),
};

export default function TopBarExcel() {
  const router = useRouter();
  const [role, setRole] = useState<string>("guest");

  useEffect(() => {
    async function loadRole() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.role) {
          setRole(json.role);
        }
      } catch {
        setRole("guest");
      }
    }
    loadRole();
  }, []);

  async function handleLogout() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
  }

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
        <TopIcons.Units /> Список заказов
      </button>

      {role === "admin" && (
        <button
          onClick={() => router.push("/app/outbound/admin")}
          style={{
            padding: "8px 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid #111827",
            background: "#111827",
            color: "#ffffff",
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
            e.currentTarget.style.background = "#1f2937";
            e.currentTarget.style.borderColor = "#1f2937";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#111827";
            e.currentTarget.style.borderColor = "#111827";
          }}
        >
          <TopIcons.Admin /> Админ панель
        </button>
      )}

      {/* SLA Button */}
      {role !== "hub_worker" && (
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
          <TopIcons.SLA /> SLA
        </button>
      )}

      {role !== "hub_worker" && (
        <button
          onClick={() => router.push("/app/statistics")}
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
          <TopIcons.Statistics /> Статистика
        </button>
      )}

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
        <TopIcons.Docs /> Справочник
      </button>

      {/* Warehouse Map Button */}
      <button
        onClick={() => router.push("/app/warehouse-map")}
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
        <TopIcons.Map /> Карта склада
      </button>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        style={{
          padding: "8px 16px",
          borderRadius: "var(--radius-md)",
          border: "1px solid #dc2626",
          background: "var(--color-bg)",
          color: "#dc2626",
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
          e.currentTarget.style.background = "#dc2626";
          e.currentTarget.style.color = "#ffffff";
          e.currentTarget.style.borderColor = "#dc2626";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-bg)";
          e.currentTarget.style.color = "#dc2626";
          e.currentTarget.style.borderColor = "#dc2626";
        }}
      >
        <TopIcons.Logout /> Выход
      </button>
    </header>
  );
}
