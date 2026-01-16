"use client";

import { usePathname } from "next/navigation";
import LeftNav from "./LeftNav";
import TopBarExcel from "./TopBarExcel";

export default function ConditionalLayout({
  children,
  role,
}: {
  children: React.ReactNode;
  role: string;
}) {
  const pathname = usePathname();
  const isKioskMode = pathname === "/app/tsd";

  if (isKioskMode) {
    // Киоск-режим: только children, без меню
    return <div style={{ height: "100vh", overflow: "auto" }}>{children}</div>;
  }

  // Стандартный layout с меню
  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "160px 1fr" }}>
      <TopBarExcel />
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: 0 }}>
        <LeftNav role={role} />
        <main style={{ background: "#f5f6f7", padding: 16, overflow: "auto" }}>{children}</main>
      </div>
    </div>
  );
}
