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
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBarExcel />
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <LeftNav role={role} />
        <main style={{ 
          flex: 1, 
          background: "#f5f6f7", 
          padding: 16, 
          overflow: "auto",
          marginLeft: "72px", // Отступ для collapsed sidebar
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
