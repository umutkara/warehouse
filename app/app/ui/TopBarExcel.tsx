"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { useUIStore } from "@/lib/ui/store";

type Zone = "receiving" | "bin" | "storage" | "shipping" | "transfer";

function StatPill({
  label,
  value,
  onClick,
  active,
}: {
  label: string;
  value?: number;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "none" : "1px solid var(--color-border)",
        borderRadius: "var(--radius-full)",
        padding: "6px 12px",
        fontSize: "12px",
        fontWeight: 600,
        background: active ? "var(--color-primary)" : "var(--color-bg-secondary)",
        color: active ? "#ffffff" : "var(--color-text)",
        display: "inline-flex",
        gap: "6px",
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
        whiteSpace: "nowrap",
        transition: "all var(--transition-base)",
        boxShadow: active ? "var(--shadow-sm)" : "none",
      }}
      onMouseEnter={(e) => {
        if (onClick && !active) {
          e.currentTarget.style.background = "var(--color-bg-tertiary)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick && !active) {
          e.currentTarget.style.background = "var(--color-bg-secondary)";
        }
      }}
    >
      <span style={{ opacity: active ? 1 : 0.8 }}>{label}</span>
      <b>{typeof value === "number" ? value : "-"}</b>
    </button>
  );
}

export default function TopBarExcel() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [digits, setDigits] = useState("");
  const sanitized = useMemo(() => digits.replace(/\D/g, ""), [digits]);

  // zones
  const zoneFilters = useUIStore((s) => s.zoneFilters);
  const setOnlyZone = useUIStore((s) => s.setOnlyZone);
  const resetZones = useUIStore((s) => s.resetZones);

  const [zoneStats, setZoneStats] = useState<any>(null);

  async function loadZoneStats() {
    const r = await fetch("/api/stats/zones", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setZoneStats(j);
  }

  useEffect(() => {
    loadZoneStats();
    // Увеличиваем интервал до 30 секунд, чтобы значительно уменьшить нагрузку
    const t = setInterval(loadZoneStats, 30000);
    return () => clearInterval(t);
  }, []);

  // barcode render
  useEffect(() => {
    if (!svgRef.current) return;

    if (!sanitized) {
      // чистим SVG
      while (svgRef.current.firstChild) svgRef.current.removeChild(svgRef.current.firstChild);
      return;
    }

    try {
      JsBarcode(svgRef.current, sanitized, {
        format: "CODE128",
        displayValue: true,
        text: `RETURN - ${sanitized}`,
        fontSize: 14,
        textMargin: 6,
        margin: 6,
        height: 52, // ключевое: стабильная высота полосок
      });

      // делаем svg "резиновым"
      svgRef.current.setAttribute("width", "100%");
      svgRef.current.setAttribute("height", "70"); // вместе с текстом
      svgRef.current.setAttribute("preserveAspectRatio", "xMidYMid meet");
    } catch (e) {
      // если вдруг формат не поддержал строку
      while (svgRef.current.firstChild) svgRef.current.removeChild(svgRef.current.firstChild);
    }
  }, [sanitized]);

  function copyDigits() {
    if (!sanitized) return;
    navigator.clipboard?.writeText(sanitized);
  }

  function printBarcode() {
    if (!svgRef.current || !sanitized) return;
    const svg = svgRef.current.outerHTML;

    const w = window.open("", "_blank");
    if (!w) return;

    const LABEL_W_MM = 58;
    const LABEL_H_MM = 40;

    w.document.write(`
      <html>
        <head>
          <title>PRINT ${sanitized}</title>
          <style>
            @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
            html, body { width: ${LABEL_W_MM}mm; height: ${LABEL_H_MM}mm; margin: 0; padding: 0; }
            .wrap { width: 100%; height: 100%; display: grid; place-items: center; }
            svg { width: 54mm; height: auto; }
          </style>
        </head>
        <body>
          <div class="wrap">${svg}</div>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <header
      style={{
        height: 160,
        width: "100%",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateRows: "48px 112px",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* ROW 1 */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-md)", padding: "0 var(--spacing-lg)", width: "100%" }}>
        <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--color-text)" }}>Control Panel</div>

        <div style={{ display: "flex", gap: "var(--spacing-sm)", overflow: "auto", minWidth: 0, flex: 1, padding: "var(--spacing-xs) 0" }}>
          <StatPill label="Все" value={zoneStats?.total} onClick={() => resetZones()} active={Object.values(zoneFilters).every(Boolean)} />
          <StatPill label="Приёмка" value={zoneStats?.counts?.receiving} onClick={() => setOnlyZone("receiving")} active={zoneFilters.receiving} />
          <StatPill label="Сортировка" value={zoneStats?.counts?.bin} onClick={() => setOnlyZone("bin")} active={zoneFilters.bin} />
          <StatPill label="Хранение" value={zoneStats?.counts?.storage} onClick={() => setOnlyZone("storage")} active={zoneFilters.storage} />
          <StatPill label="Отгрузка" value={zoneStats?.counts?.shipping} onClick={() => setOnlyZone("shipping")} active={zoneFilters.shipping} />
          <StatPill label="Передача" value={zoneStats?.counts?.transfer} onClick={() => setOnlyZone("transfer")} active={zoneFilters.transfer} />
          <StatPill label="Не размещено" value={zoneStats?.unplaced} />
        </div>
      </div>

      {/* ROW 2: All tools in one row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-md)",
          padding: "0 var(--spacing-lg) var(--spacing-md) var(--spacing-lg)",
          width: "100%",
          flexWrap: "nowrap",
          minWidth: 0,
        }}
      >
        {/* Input */}
        <input
          placeholder="Введите цифры"
          value={digits}
          onChange={(e) => setDigits(e.target.value)}
          style={{
            width: 200,
            height: 40,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "0 var(--spacing-md)",
            outline: "none",
            fontSize: "14px",
            fontFamily: "var(--font-sans)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            transition: "all var(--transition-base)",
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

        {/* Buttons */}
        <button
          onClick={copyDigits}
          disabled={!sanitized}
          style={{
            height: 40,
            padding: "0 var(--spacing-md)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: sanitized ? "var(--color-primary)" : "var(--color-bg-tertiary)",
            color: sanitized ? "#ffffff" : "var(--color-text-tertiary)",
            cursor: sanitized ? "pointer" : "not-allowed",
            fontSize: "14px",
            fontWeight: 600,
            transition: "all var(--transition-base)",
            opacity: sanitized ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (sanitized) {
              e.currentTarget.style.background = "var(--color-primary-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (sanitized) {
              e.currentTarget.style.background = "var(--color-primary)";
            }
          }}
        >
          Copy
        </button>

        <button
          onClick={printBarcode}
          disabled={!sanitized}
          style={{
            height: 40,
            padding: "0 var(--spacing-md)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: sanitized ? "var(--color-bg)" : "var(--color-bg-tertiary)",
            color: sanitized ? "var(--color-text)" : "var(--color-text-tertiary)",
            cursor: sanitized ? "pointer" : "not-allowed",
            fontSize: "14px",
            fontWeight: 600,
            transition: "all var(--transition-base)",
            opacity: sanitized ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (sanitized) {
              e.currentTarget.style.background = "var(--color-bg-tertiary)";
            }
          }}
          onMouseLeave={(e) => {
            if (sanitized) {
              e.currentTarget.style.background = "var(--color-bg)";
            }
          }}
        >
          Print
        </button>

        {/* Barcode preview */}
        <div
          style={{
            width: 300,
            height: 86,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-sm) var(--spacing-md)",
            background: "var(--color-bg)",
            display: "grid",
            alignItems: "center",
            boxShadow: "var(--shadow-sm)",
          }}
          title={sanitized ? `CODE128: ${sanitized}` : "Нет штрихкода"}
        >
          <svg ref={svgRef} />
        </div>

        {/* QR placeholder */}
        <div
          style={{
            width: 70,
            height: 86,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", textAlign: "center", lineHeight: 1.4 }}>
            QR<br />(скоро)
          </div>
        </div>
      </div>
    </header>
  );
}
