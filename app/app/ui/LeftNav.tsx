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
        display: "block",
        background: "#111",
        color: "#fff",
        fontWeight: 600,
        padding: "10px 12px",
        borderRadius: 10,
        textDecoration: "none",
        transition: "all 0.2s ease",
        outline: isActive ? "2px solid #444" : "none",
        transform: "translateY(0)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#2b2b2b";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#111";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {children}
    </Link>
  );
}

export default function LeftNav({ role }: { role: string }) {
  const canWork = ["worker", "manager", "head", "admin"].includes(role);

  return (
    <aside style={{ borderRight: "1px solid #ddd", background: "#fff", padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>WMS</div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Роль: {role}</div>

      <nav style={{ display: "grid", gap: 8 }}>
        {canWork && <NavButton href="/app/receiving">Приёмка</NavButton>}
        {canWork && <NavButton href="/app/putaway">Размещение</NavButton>}
        {canWork && <NavButton href="/app/picking">Сборка</NavButton>}
        {canWork && <NavButton href="/app/shipping">Отгрузка</NavButton>}
        {canWork && <NavButton href="/app/tsd">ТСД</NavButton>}

        {/* guest/read-only future */}
        <NavButton href="/app/warehouse-map">Карта склада</NavButton>
        {canWork && <NavButton href="/app/cells/labels">Этикетки ячеек</NavButton>}
      </nav>
    </aside>
  );
}