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
        border: "1px solid #e6e6e6",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        background: active ? "#111" : "#fafafa",
        color: active ? "#fff" : "#111",
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: active ? 1 : 0.7 }}>{label}</span>
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
        height: 160, // еще увеличена для размещения всех элементов внизу
        width: "100%",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateRows: "44px 116px", // Row 1: pills, Row 2: all tools in one row
        borderBottom: "1px solid #ddd",
        background: "#fff",
      }}
    >
      {/* ROW 1 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 12px", width: "100%" }}>
        <div style={{ fontWeight: 700 }}>Control Panel</div>

        <div style={{ display: "flex", gap: 8, overflow: "auto", minWidth: 0, flex: 1 }}>
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
          gap: 10,
          padding: "0 12px 10px 12px",
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
            height: 38,
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: "0 10px",
            outline: "none",
          }}
        />

        {/* Buttons */}
        <button
          onClick={copyDigits}
          disabled={!sanitized}
          style={{
            height: 38,
            padding: "0 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: sanitized ? "#111" : "#f3f3f3",
            color: sanitized ? "#fff" : "#777",
            cursor: sanitized ? "pointer" : "not-allowed",
          }}
        >
          Copy
        </button>

        <button
          onClick={printBarcode}
          disabled={!sanitized}
          style={{
            height: 38,
            padding: "0 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: sanitized ? "#fff" : "#f3f3f3",
            color: sanitized ? "#111" : "#777",
            cursor: sanitized ? "pointer" : "not-allowed",
          }}
        >
          Print
        </button>

        {/* Barcode preview */}
        <div
          style={{
            width: 300,
            height: 86,
            border: "1px solid #e6e6e6",
            borderRadius: 12,
            padding: "8px 10px",
            background: "#fff",
            display: "grid",
            alignItems: "center",
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
            border: "1px solid #e6e6e6",
            borderRadius: 12,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 11, color: "#999", textAlign: "center" }}>
            QR<br />(скоро)
          </div>
        </div>
      </div>
    </header>
  );
}
