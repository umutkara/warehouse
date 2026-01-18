"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavButton({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-sm)",
        padding: "var(--spacing-md) var(--spacing-md)",
        borderRadius: "var(--radius-md)",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: "14px",
        color: isActive ? "#ffffff" : "var(--color-text)",
        background: isActive ? "var(--color-primary)" : "transparent",
        transition: "all var(--transition-base)",
        border: isActive ? "none" : "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "var(--color-bg-tertiary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {children}
    </Link>
  );
}

export default function LeftNav({ role }: { role: string }) {
  const canWork = ["worker", "manager", "head", "admin"].includes(role);
  const canOps = ["ops", "manager", "head", "admin"].includes(role);
  const canViewTasks = ["worker", "ops", "manager", "head", "admin"].includes(role);
  const canLogistics = ["logistics", "admin", "head"].includes(role);
  const isLogisticsOnly = role === "logistics";

  return (
    <aside
      style={{
        borderRight: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        padding: "var(--spacing-lg)",
        minWidth: 240,
        maxWidth: 240,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div style={{ marginBottom: "var(--spacing-lg)" }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "18px",
            color: "var(--color-text)",
            marginBottom: "var(--spacing-xs)",
          }}
        >
          WMS
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Роль: {role}</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
        {/* Worker section (hidden for logistics-only) */}
        {canWork && !isLogisticsOnly && <NavButton href="/app/receiving">Приёмка</NavButton>}
        {canWork && !isLogisticsOnly && <NavButton href="/app/putaway">Размещение</NavButton>}
        {canWork && !isLogisticsOnly && <NavButton href="/app/picking">Сборка</NavButton>}
        {canWork && !isLogisticsOnly && <NavButton href="/app/shipping">Отгрузка</NavButton>}
        {canViewTasks && !isLogisticsOnly && <NavButton href="/app/tsd">ТСД</NavButton>}

        {/* Ops section (hidden for logistics) */}
        {canOps && !isLogisticsOnly && (
          <>
            <div style={{ marginTop: "var(--spacing-md)", marginBottom: "var(--spacing-xs)", fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
              OPS
            </div>
            <NavButton href="/app/ops-shipping">Создать задания</NavButton>
          </>
        )}

        {/* Logistics section (only for logistics, admin, head) */}
        {canLogistics && (
          <>
            <div style={{ marginTop: "var(--spacing-md)", marginBottom: "var(--spacing-xs)", fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
              ЛОГИСТИКА
            </div>
            <NavButton href="/app/logistics">Отправка заказов</NavButton>
            <NavButton href="/app/out">OUT (В доставке)</NavButton>
          </>
        )}

        {/* Common section */}
        <div style={{ marginTop: "var(--spacing-md)", marginBottom: "var(--spacing-xs)", fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
          ОБЩЕЕ
        </div>
        <NavButton href="/app/warehouse-map">Карта склада</NavButton>
        {canWork && !isLogisticsOnly && <NavButton href="/app/cells/labels">Этикетки ячеек</NavButton>}
        <NavButton href="/app/inventory">Инвентаризация</NavButton>
        <NavButton href="/app/archive">Архив</NavButton>
      </nav>
    </aside>
  );
}
