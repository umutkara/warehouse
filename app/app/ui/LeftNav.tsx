"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Simple SVG Icons (iOS style, black and white)
const Icons = {
  Menu: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h14M3 10h14M3 14h14" />
    </svg>
  ),
  Receiving: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v14M3 10l7-7 7 7" />
    </svg>
  ),
  Putaway: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="14" height="9" rx="1" />
      <path d="M7 8V5a2 2 0 012-2h2a2 2 0 012 2v3" />
    </svg>
  ),
  Picking: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10h8M6 14h4M4 4h12v12H4z" />
    </svg>
  ),
  Shipping: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h11l3 3v5a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" />
      <circle cx="7" cy="16" r="1.5" />
      <circle cx="14" cy="16" r="1.5" />
    </svg>
  ),
  TSD: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="10" height="16" rx="2" />
      <path d="M9 5h2" />
    </svg>
  ),
  Tasks: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10l2 2 6-6" />
      <rect x="3" y="3" width="14" height="14" rx="2" />
    </svg>
  ),
  Alert: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4M10 13h.01" />
    </svg>
  ),
  Truck: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8h10l3 3v4a1 1 0 01-1 1H3a1 1 0 01-1-1V9a1 1 0 011-1z" />
      <circle cx="6" cy="15" r="1" />
      <circle cx="13" cy="15" r="1" />
    </svg>
  ),
  Out: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17V3M3 10l7 7 7-7" />
    </svg>
  ),
  Map: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6l4-2 6 2 4-2v10l-4 2-6-2-4 2V6z" />
    </svg>
  ),
  Label: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l7-4 7 4v6l-7 4-7-4V7z" />
      <path d="M3 7l7 4M10 11v6M17 7l-7 4" />
    </svg>
  ),
  Inventory: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12v12H4z" />
      <path d="M8 8h4M8 12h4" />
    </svg>
  ),
  Archive: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M3 8h14M8 11h4" />
    </svg>
  ),
  Units: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="12" height="10" rx="1" />
      <path d="M7 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  ),
  Duplicates: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="9" height="12" rx="1" />
      <rect x="8" y="2" width="9" height="12" rx="1" />
      <path d="M8 6h4M8 9h3" />
    </svg>
  ),
  SLA: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </svg>
  ),
  Docs: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h8l3 3v11a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M9 8h4M9 12h4M9 16h2" />
    </svg>
  ),
  Hub: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2l6 3v4l-6 3-6-3V5l6-3z" />
      <path d="M4 9l6 3v6l-6-3V9zM10 12l6 3v3l-6-3v-3z" />
    </svg>
  ),
  Surplus: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="14" height="10" rx="1" />
      <path d="M7 6V4M13 6V4M7 10h6M7 13h4" />
      <circle cx="15" cy="8" r="2" fill="currentColor" />
    </svg>
  ),
};

interface NavButtonProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isCollapsed: boolean;
}

function NavButton({ href, icon, children, isCollapsed }: NavButtonProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      title={isCollapsed ? String(children) : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        borderRadius: "8px",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: "14px",
        color: isActive ? "#ffffff" : "#374151",
        background: isActive ? "#2563eb" : "transparent",
        transition: "all 0.2s ease",
        whiteSpace: "nowrap",
        justifyContent: isCollapsed ? "center" : "flex-start",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "#f3f4f6";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        {icon}
      </span>
      {!isCollapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>}
    </Link>
  );
}

interface SectionTitleProps {
  children: React.ReactNode;
  isCollapsed: boolean;
}

function SectionTitle({ children, isCollapsed }: SectionTitleProps) {
  if (isCollapsed) {
    return (
      <div
        style={{
          height: "1px",
          background: "#e5e7eb",
          margin: "12px 8px",
        }}
      />
    );
  }

  return (
    <div
      style={{
        marginTop: "16px",
        marginBottom: "8px",
        fontSize: "11px",
        color: "#9ca3af",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        paddingLeft: "12px",
      }}
    >
      {children}
    </div>
  );
}

export default function LeftNav({ role }: { role: string }) {
  const [isCollapsed, setIsCollapsed] = useState(true); // По умолчанию закрыта
  const [isHovering, setIsHovering] = useState(false);

  const canWork = ["worker", "manager", "head", "admin"].includes(role);
  const canOps = ["ops", "manager", "head", "admin"].includes(role);
  const canViewTasks = ["worker", "ops", "manager", "head", "admin"].includes(role);
  const canLogistics = ["logistics", "admin", "head"].includes(role);
  const isLogisticsOnly = role === "logistics";

  const shouldExpand = !isCollapsed || isHovering;

  return (
    <aside
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{
        borderRight: "1px solid #e5e7eb",
        background: "#ffffff",
        padding: "16px 12px",
        width: shouldExpand ? "240px" : "72px",
        position: "fixed",
        left: 0,
        top: "60px", // Высота TopBar
        bottom: 0,
        zIndex: 100,
        overflow: "hidden",
        transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        display: "flex",
        flexDirection: "column",
        boxShadow: shouldExpand ? "4px 0 12px rgba(0,0,0,0.1)" : "none",
      }}
    >
      {/* Header with hamburger — не сжимается, прокручивается только nav */}
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          justifyContent: shouldExpand ? "space-between" : "center",
          flexShrink: 0,
        }}
      >
        {shouldExpand && (
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: "18px",
                color: "#111827",
                marginBottom: "2px",
                whiteSpace: "nowrap",
              }}
            >
              WMS
            </div>
            <div style={{ fontSize: "11px", color: "#9ca3af", whiteSpace: "nowrap" }}>
              {role}
            </div>
          </div>
        )}
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: "transparent",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#6b7280",
            transition: "all 0.2s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f3f4f6";
            e.currentTarget.style.borderColor = "#d1d5db";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "#e5e7eb";
          }}
          title={isCollapsed ? "Раскрыть меню" : "Свернуть меню"}
        >
          <Icons.Menu />
        </button>
      </div>

      {/* Navigation: minHeight 0 allows flex child to shrink; overflowY auto scrolls long list */}
      <nav style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minHeight: 0, overflowY: "auto" }}>
        {/* Status-based pages (hidden for logistics-only) */}
        {canWork && !isLogisticsOnly && (
          <>
            <SectionTitle isCollapsed={!shouldExpand}>СТАТУСЫ ЗАКАЗОВ</SectionTitle>
            <NavButton href="/app/status/bin" icon={<Icons.Receiving />} isCollapsed={!shouldExpand}>
              BIN
            </NavButton>
            <NavButton href="/app/status/stored" icon={<Icons.Putaway />} isCollapsed={!shouldExpand}>
              Stored
            </NavButton>
            <NavButton href="/app/status/shipping" icon={<Icons.Shipping />} isCollapsed={!shouldExpand}>
              Shipping
            </NavButton>
            <NavButton href="/app/status/picking" icon={<Icons.Picking />} isCollapsed={!shouldExpand}>
              Picking
            </NavButton>
            <NavButton href="/app/status/out" icon={<Icons.Out />} isCollapsed={!shouldExpand}>
              OUT
            </NavButton>
          </>
        )}
        
        {canViewTasks && !isLogisticsOnly && (
          <NavButton href="/app/tsd" icon={<Icons.TSD />} isCollapsed={!shouldExpand}>
            ТСД
          </NavButton>
        )}

        {/* Ops section (ops, logistics, manager, head, admin) */}
        {(canOps || canLogistics) && (
          <>
            <SectionTitle isCollapsed={!shouldExpand}>OPS</SectionTitle>
            <NavButton href="/app/ops-shipping" icon={<Icons.Tasks />} isCollapsed={!shouldExpand}>
              Создать задания
            </NavButton>
            <NavButton href="/app/ops-shipping-beta" icon={<Icons.Tasks />} isCollapsed={!shouldExpand}>
              Создать задания BETA
            </NavButton>
            <NavButton href="/app/ops/merchant-rejections" icon={<Icons.Alert />} isCollapsed={!shouldExpand}>
              Мерчант не принял
            </NavButton>
          </>
        )}

        {/* Logistics section (only for logistics, admin, head) */}
        {canLogistics && (
          <>
            <SectionTitle isCollapsed={!shouldExpand}>ЛОГИСТИКА</SectionTitle>
            <NavButton href="/app/logistics" icon={<Icons.Truck />} isCollapsed={!shouldExpand}>
              Отправка заказов
            </NavButton>
            <NavButton href="/app/outbound" icon={<Icons.Out />} isCollapsed={!shouldExpand}>
              OUT (В доставке)
            </NavButton>
          </>
        )}

        {/* Common section */}
        <SectionTitle isCollapsed={!shouldExpand}>ОБЩЕЕ</SectionTitle>
        <NavButton href="/app/duplicates" icon={<Icons.Duplicates />} isCollapsed={!shouldExpand}>
          Дубли
        </NavButton>
        {canWork && !isLogisticsOnly && (
          <NavButton href="/app/cells/labels" icon={<Icons.Label />} isCollapsed={!shouldExpand}>
            Этикетки ячеек
          </NavButton>
        )}
        <NavButton href="/app/inventory" icon={<Icons.Inventory />} isCollapsed={!shouldExpand}>
          Инвентаризация
        </NavButton>
        <NavButton href="/app/surplus" icon={<Icons.Surplus />} isCollapsed={!shouldExpand}>
          Излишки
        </NavButton>

        <SectionTitle isCollapsed={!shouldExpand}>Демо</SectionTitle>
        <NavButton href="/app/demo-hubs" icon={<Icons.Hub />} isCollapsed={!shouldExpand}>
          Хабы
        </NavButton>
      </nav>
    </aside>
  );
}
