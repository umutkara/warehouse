"use client";

import { useEffect, useState, useRef } from "react";
import JsBarcode from "jsbarcode";
import { getCellColor } from "@/lib/ui/cellColors";

type Cell = {
  id: string;
  code: string;
  cell_type: string;
  meta?: any;
};

function CellLabel({ cell, onPrint }: { cell: Cell; onPrint: () => void }) {
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!barcodeRef.current) return;

    // Кодируем строку вида "CELL:<CODE>"
    const barcodeValue = `CELL:${cell.code}`;

    try {
      // Очищаем предыдущий штрихкод
      while (barcodeRef.current.firstChild) {
        barcodeRef.current.removeChild(barcodeRef.current.firstChild);
      }

      JsBarcode(barcodeRef.current, barcodeValue, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 34,
        width: 1.2,
        background: "#ffffff",
      });
    } catch (e) {
      console.error("Ошибка генерации штрихкода:", e);
    }
  }, [cell.code]);

  const cellColor = getCellColor(cell.cell_type, cell.meta);

  return (
    <div
      className="label-container"
      data-cell-id={cell.id}
      style={{
        display: "inline-block",
        margin: "12px",
      }}
    >
      <div
        className="label-content"
        style={{
          width: "58mm",
          height: "30mm",
          border: "0",
          borderRadius: "0",
          outline: "0.2mm solid #ddd",
          padding: "4mm",
          display: "flex",
          alignItems: "center",
          gap: "3mm",
          background: "white",
          boxSizing: "border-box",
        }}
      >
        {/* Левая часть: штрихкод */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
          }}
        >
          <svg ref={barcodeRef} style={{ width: "100%", height: "34px" }} />
          <div
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textAlign: "center",
              color: "#000",
            }}
          >
            {cell.code}
          </div>
        </div>

        {/* Правая часть: цветной квадрат + текст */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3px",
          }}
        >
          <div
            style={{
              width: "18px",
              height: "18px",
              backgroundColor: cellColor,
              border: "1px solid #ccc",
              borderRadius: "2px",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2px",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "#000",
              }}
            >
              {cell.code}
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "#666",
                textTransform: "lowercase",
              }}
            >
              {cell.cell_type}
            </div>
          </div>
        </div>
      </div>

      {/* Кнопка печати (скрывается при печати) */}
      <button
        className="label-print-btn"
        onClick={onPrint}
        style={{
          marginTop: "8px",
          padding: "6px 12px",
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "12px",
        }}
      >
        Печать
      </button>
    </div>
  );
}

export default function CellLabelsPage() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printCellId, setPrintCellId] = useState<string | null>(null);

  async function loadCells() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cells/list", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Ошибка загрузки ячеек");
      }
      const json = await res.json();
      setCells(json.cells || []);
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCells();
  }, []);

  // Сброс printCellId после печати
  useEffect(() => {
    const onAfterPrint = () => setPrintCellId(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  function printAll() {
    setPrintCellId(null);
    setTimeout(() => window.print(), 50);
  }

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <div>Загрузка ячеек...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <div style={{ color: "crimson" }}>{error}</div>
        <button onClick={loadCells} style={{ marginTop: 12, padding: "8px 16px" }}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @page { size: 58mm 30mm; margin: 0; }
        @media print {
          body { margin: 0 !important; }
          body * { visibility: hidden; }
          .labels-print-root, .labels-print-root * { visibility: visible; }
          .label-print-btn, button, h1 { display: none !important; }
          .label-container { margin: 0 !important; page-break-after: always; break-after: page; }

          .labels-print-root[data-print-one="1"] .label-container { display: none !important; }
          .labels-print-root[data-print-one="1"] .label-container[data-cell-id="${printCellId ?? ""}"] {
            display: inline-block !important;
          }
        }
      `}</style>

      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>Этикетки ячеек</h1>
          <button
            onClick={printAll}
            style={{
              padding: "10px 20px",
              background: "#16a34a",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Печать всех
          </button>
          <button
            onClick={loadCells}
            style={{
              padding: "10px 20px",
              background: "#f3f4f6",
              color: "#111",
              border: "1px solid #ddd",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Обновить
          </button>
        </div>

        <div
          className="labels-print-root"
          data-print-one={printCellId ? "1" : "0"}
        >
          {cells.map((cell) => (
            <CellLabel
              key={cell.id}
              cell={cell}
              onPrint={() => {
                setPrintCellId(cell.id);
                // даём React применить state
                setTimeout(() => window.print(), 50);
              }}
            />
          ))}
        </div>

        {cells.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
            Нет ячеек для печати
          </div>
        )}
      </div>
    </>
  );
}
