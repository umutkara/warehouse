"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import JsBarcode from "jsbarcode";
import { getCellColor } from "@/lib/ui/cellColors";

// ⚡ Force dynamic for real-time cell data
export const dynamic = 'force-dynamic';

type Cell = {
  id: string;
  code: string;
  cell_type: string;
  meta?: any;
};

type PrintMode = "small" | "a4";

function CellLabel({ cell, onPrint, printMode = "small" }: { 
  cell: Cell; 
  onPrint: () => void;
  printMode?: PrintMode;
}) {
  const barcodeRef = useRef<SVGSVGElement | null>(null);
  const barcodeRefA4 = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    // Для маленьких этикеток
    if (barcodeRef.current && printMode === "small") {
      const barcodeValue = `CELL:${cell.code}`;
      try {
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
    }

    // Для A4 этикеток (большой штрихкод)
    if (barcodeRefA4.current && printMode === "a4") {
      const barcodeValue = `CELL:${cell.code}`;
      try {
        while (barcodeRefA4.current.firstChild) {
          barcodeRefA4.current.removeChild(barcodeRefA4.current.firstChild);
        }
        JsBarcode(barcodeRefA4.current, barcodeValue, {
          format: "CODE128",
          displayValue: true,
          margin: 10,
          height: 80,
          width: 2.5,
          background: "#ffffff",
          fontSize: 20,
          textMargin: 6,
        });
      } catch (e) {
        console.error("Ошибка генерации штрихкода A4:", e);
      }
    }
  }, [cell.code, printMode]);

  const cellColor = getCellColor(cell.cell_type, cell.meta);

  // Если режим A4 - возвращаем другой layout
  if (printMode === "a4") {
    return (
      <div
        className="label-container label-container-a4"
        data-cell-id={cell.id}
        style={{
          display: "inline-block",
          margin: "16px",
        }}
      >
        <div
          className="label-content label-content-a4"
          style={{
            width: "297mm",
            height: "210mm",
            border: "0",
            borderRadius: "0",
            outline: "none",
            padding: "20mm",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: "30mm",
            background: "#ffffff",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {/* Левая часть: Штрихкод */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10mm",
              flex: 1,
            }}
          >
            <svg 
              ref={barcodeRefA4} 
              style={{ 
                width: "100%", 
                maxWidth: "200mm",
                height: "auto",
              }} 
            />
          </div>

          {/* Правая часть: Информация о ячейке */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "15mm",
              flex: 1,
            }}
          >
            <div
              style={{
                width: "50mm",
                height: "50mm",
                backgroundColor: cellColor,
                border: "3px solid #000",
                borderRadius: "10mm",
                boxShadow: `0 4px 12px ${cellColor}60`,
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "5mm",
              }}
            >
              <div
                style={{
                  fontSize: "56px",
                  fontWeight: 900,
                  color: "#000",
                  letterSpacing: "2px",
                  textAlign: "center",
                }}
              >
                {cell.code}
              </div>
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 600,
                  color: "#666",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  textAlign: "center",
                }}
              >
                {cell.cell_type}
              </div>
            </div>
          </div>
        </div>

        {/* Кнопка печати */}
        <button
          className="label-print-btn"
          onClick={onPrint}
          style={{
            marginTop: "10px",
            padding: "8px 16px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
            width: "100%",
            boxShadow: "0 2px 6px rgba(102, 126, 234, 0.3)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 4px 10px rgba(102, 126, 234, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 2px 6px rgba(102, 126, 234, 0.3)";
          }}
        >
          🖨️ Печать A4
        </button>
      </div>
    );
  }

  // Оригинальный код для маленьких этикеток
  return (
    <div
      className="label-container"
      data-cell-id={cell.id}
      style={{
        display: "inline-block",
        margin: "16px",
      }}
    >
      <div
        className="label-content"
        style={{
          width: "58mm",
          height: "30mm",
          border: "0",
          borderRadius: "12px",
          outline: "none",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)",
          padding: "4mm",
          display: "flex",
          alignItems: "center",
          gap: "3mm",
          background: "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)",
          boxSizing: "border-box",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 20px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)";
        }}
      >
        {/* Декоративный фон */}
        <div style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "50%",
          height: "100%",
          background: `linear-gradient(135deg, transparent 0%, ${cellColor}10 100%)`,
          opacity: 0.3,
          pointerEvents: "none",
        }} />
        {/* Левая часть: штрихкод */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <svg ref={barcodeRef} style={{ width: "100%", height: "34px" }} />
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textAlign: "center",
              color: "#111",
              letterSpacing: "0.5px",
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
            gap: "4px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "22px",
              height: "22px",
              backgroundColor: cellColor,
              border: "2px solid #fff",
              borderRadius: "6px",
              boxShadow: `0 2px 6px ${cellColor}40, 0 0 0 1px ${cellColor}20`,
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1px",
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: 800,
                color: "#111",
                letterSpacing: "-0.02em",
              }}
            >
              {cell.code}
            </div>
            <div
              style={{
                fontSize: "9px",
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                padding: "1px 4px",
                background: "#f3f4f6",
                borderRadius: "3px",
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
          marginTop: "10px",
          padding: "8px 16px",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 600,
          width: "100%",
          boxShadow: "0 2px 6px rgba(102, 126, 234, 0.3)",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 10px rgba(102, 126, 234, 0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 2px 6px rgba(102, 126, 234, 0.3)";
        }}
      >
        🖨️ Печать
      </button>
    </div>
  );
}

export default function CellLabelsPage() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printCellId, setPrintCellId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>("small");

  // ⚡ OPTIMIZATION: Memoized load function
  const loadCells = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cells/list", { 
        next: { revalidate: 60 } // ⚡ Cache for 1 minute
      });
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
  }, []);

  useEffect(() => {
    loadCells();
  }, [loadCells]);

  // Сброс printCellId после печати
  useEffect(() => {
    const onAfterPrint = () => setPrintCellId(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  // ⚡ OPTIMIZATION: Memoized print function
  const printAll = useCallback(() => {
    setPrintCellId(null);
    setTimeout(() => window.print(), 50);
  }, []);

  // ⚡ Modern skeleton loader
  if (loading) {
    return (
      <div style={{ 
        padding: "40px 24px",
        maxWidth: 1400,
        margin: "0 auto",
      }}>
        {/* Header skeleton */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 16, 
          marginBottom: 32 
        }}>
          <div style={{
            width: 200,
            height: 36,
            background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
            borderRadius: 8,
          }} />
          <div style={{
            width: 120,
            height: 40,
            background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
            borderRadius: 8,
          }} />
        </div>

        {/* Labels skeleton */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} style={{
              width: "58mm",
              height: "30mm",
              background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
              borderRadius: 12,
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
        </div>

        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: "80px 24px",
        textAlign: "center",
        maxWidth: 600,
        margin: "0 auto",
      }}>
        <div style={{
          fontSize: 64,
          marginBottom: 16,
        }}>⚠️</div>
        <h2 style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#dc2626",
          marginBottom: 8,
        }}>
          Ошибка загрузки
        </h2>
        <div style={{ 
          color: "#6b7280",
          marginBottom: 24,
          fontSize: 14,
        }}>
          {error}
        </div>
        <button 
          onClick={loadCells}
          style={{ 
            padding: "12px 24px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(102, 126, 234, 0.3)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(102, 126, 234, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.3)";
          }}
        >
          🔄 Повторить
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @page { 
          size: ${printMode === "a4" ? "A4 landscape" : "58mm 30mm"}; 
          margin: 0; 
        }
        @media print {
          body { margin: 0 !important; }
          body * { visibility: hidden; }
          .labels-print-root, .labels-print-root * { visibility: visible; }
          .label-print-btn, button, h1, p { display: none !important; }
          
          /* Для маленьких этикеток */
          .label-container:not(.label-container-a4) { 
            margin: 0 !important; 
            page-break-after: always; 
            break-after: page; 
          }
          
          /* Для A4 этикеток */
          .label-container-a4 {
            margin: 0 !important;
            page-break-after: always;
            break-after: page;
          }
          
          .label-content {
            border-radius: 0 !important;
            box-shadow: none !important;
            background: white !important;
            outline: 0.2mm solid #ddd !important;
          }

          .label-content-a4 {
            outline: none !important;
          }

          .labels-print-root[data-print-one="1"] .label-container { display: none !important; }
          .labels-print-root[data-print-one="1"] .label-container[data-cell-id="${printCellId ?? ""}"] {
            display: inline-block !important;
          }
        }
      `}</style>

      <div style={{ 
        padding: "32px 24px",
        maxWidth: 1400,
        margin: "0 auto",
      }}>
        {/* Modern Header */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginBottom: 32,
          flexWrap: "wrap",
          gap: 16,
        }}>
          <div>
            <h1 style={{ 
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "-0.02em",
              marginBottom: 8,
            }}>
              🏷️ Этикетки ячеек
            </h1>
            <p style={{
              margin: 0,
              fontSize: 14,
              color: "#6b7280",
              fontWeight: 500,
            }}>
              Печать этикеток для всех ячеек склада ({cells.length} шт.)
            </p>
          </div>
          
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* Переключатель режима печати */}
            <div style={{
              display: "flex",
              background: "#f3f4f6",
              borderRadius: 10,
              padding: 4,
              gap: 4,
            }}>
              <button
                onClick={() => setPrintMode("small")}
                style={{
                  padding: "8px 16px",
                  background: printMode === "small" ? "#667eea" : "transparent",
                  color: printMode === "small" ? "#fff" : "#374151",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
              >
                📏 Маленькие (58×30mm)
              </button>
              <button
                onClick={() => setPrintMode("a4")}
                style={{
                  padding: "8px 16px",
                  background: printMode === "a4" ? "#667eea" : "transparent",
                  color: printMode === "a4" ? "#fff" : "#374151",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
              >
                📄 A4 (большой штрихкод)
              </button>
            </div>

            <button
              onClick={printAll}
              style={{
                padding: "12px 24px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "white",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(16, 185, 129, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.3)";
              }}
            >
              <span>🖨️</span>
              <span>Печать всех</span>
            </button>
            <button
              onClick={loadCells}
              style={{
                padding: "12px 20px",
                background: "#ffffff",
                color: "#374151",
                border: "2px solid #e5e7eb",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                transition: "all 0.2s",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#667eea";
                e.currentTarget.style.background = "#f9fafb";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.background = "#ffffff";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              🔄 Обновить
            </button>
          </div>
        </div>

        <div
          className="labels-print-root"
          data-print-one={printCellId ? "1" : "0"}
        >
          {cells.map((cell) => (
            <CellLabel
              key={cell.id}
              cell={cell}
              printMode={printMode}
              onPrint={() => {
                setPrintCellId(cell.id);
                setTimeout(() => window.print(), 50);
              }}
            />
          ))}
        </div>

        {cells.length === 0 && (
          <div style={{ 
            padding: "80px 24px",
            textAlign: "center",
            background: "#ffffff",
            borderRadius: 16,
            border: "2px dashed #e5e7eb",
          }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📦</div>
            <h3 style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#374151",
              marginBottom: 8,
            }}>
              Нет ячеек
            </h3>
            <p style={{ color: "#9ca3af", fontSize: 14 }}>
              Создайте ячейки на карте склада, чтобы напечатать этикетки
            </p>
          </div>
        )}
      </div>
    </>
  );
}
