"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

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
        📦 Список заказов
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
          🛠️ Админ панель
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
          📊 SLA
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
        📖 Справочник
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
        🗺️ Карта склада
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
        🚪 Выход
      </button>
    </header>
  );
}
