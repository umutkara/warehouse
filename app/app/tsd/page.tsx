"use client";

import { useState, useEffect, useRef } from "react";
import { getCellColor } from "@/lib/ui/cellColors";

type CellInfo = {
  id: string;
  code: string;
  cell_type: string;
  meta?: any;
};

type UnitInfo = {
  id: string;
  barcode: string;
};

type Mode = "receiving" | "moving";

export default function TsdPage() {
  const [mode, setMode] = useState<Mode>("receiving");
  const [scanValue, setScanValue] = useState("");
  
  // Для режима Приемка
  const [binCell, setBinCell] = useState<CellInfo | null>(null);
  const [lastReceivedUnit, setLastReceivedUnit] = useState<{ barcode: string; binCode: string } | null>(null);
  
  // Для режима Перемещение
  const [fromCell, setFromCell] = useState<CellInfo | null>(null);
  const [unit, setUnit] = useState<UnitInfo | null>(null);
  const [toCell, setToCell] = useState<CellInfo | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Автофокус на input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [binCell, fromCell, unit, toCell, error, success, mode]);

  // Обработка Enter/CR
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Return") {
      e.preventDefault();
      if (mode === "receiving") {
        handleReceivingScan();
      } else {
        handleMovingScan();
      }
    }
  }

  // Распознавание скана
  function parseScan(value: string): { type: "cell" | "unit"; code: string } | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Если начинается с "CELL:" => это ячейка
    if (trimmed.startsWith("CELL:") || trimmed.toUpperCase().startsWith("CELL:")) {
      const code = trimmed.substring(5).trim();
      if (code) return { type: "cell", code };
    }

    // Иначе это barcode unit (только цифры)
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 3) {
      return { type: "unit", code: digits };
    }

    return null;
  }

  // Загрузка информации о ячейке
  async function loadCellInfo(code: string): Promise<CellInfo | null> {
    try {
      const res = await fetch(`/api/cells/list`, { cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      const cell = (json.cells || []).find((c: any) => c.code.toUpperCase() === code.toUpperCase());
      if (cell) {
        return {
          id: cell.id,
          code: cell.code,
          cell_type: cell.cell_type,
          meta: cell.meta,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // Загрузка информации о unit
  async function loadUnitInfo(barcode: string): Promise<UnitInfo | null> {
    try {
      const res = await fetch(`/api/units/by-barcode?barcode=${encodeURIComponent(barcode)}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.unit) {
        return {
          id: json.unit.id,
          barcode: json.unit.barcode,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // ============================================
  // РЕЖИМ ПРИЕМКА
  // ============================================
  async function handleReceivingScan() {
    const parsed = parseScan(scanValue);
    if (!parsed) {
      setError("Некорректный скан");
      setScanValue("");
      return;
    }

    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      if (parsed.type === "cell") {
        // Это BIN-ячейка
        const cellInfo = await loadCellInfo(parsed.code);
        if (!cellInfo) {
          setError(`Ячейка "${parsed.code}" не найдена`);
          setScanValue("");
          return;
        }

        // Проверяем, что это BIN
        if (cellInfo.cell_type !== "bin") {
          setError(`Ячейка "${parsed.code}" не является BIN. Приемка только в BIN-ячейки.`);
          setScanValue("");
          return;
        }

        setBinCell(cellInfo);
        setSuccess(`BIN: ${cellInfo.code}`);
        setScanValue("");
      } else {
        // Это штрихкод unit
        if (!binCell) {
          setError("Сначала отсканируйте BIN-ячейку");
          setScanValue("");
          return;
        }

        // Вызываем API приёмки
        const res = await fetch("/api/receiving/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cellCode: binCell.code,
            unitBarcode: parsed.code,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Ошибка приёмки");
        }

        // Успех
        setSuccess(`${parsed.code} -> ${binCell.code} OK`);
        setLastReceivedUnit({ barcode: parsed.code, binCode: binCell.code });
        setScanValue("");
        // BIN оставляем выбранным для приёма пачки
      }
    } catch (e: any) {
      setError(e.message || "Ошибка обработки скана");
      setScanValue("");
    } finally {
      setBusy(false);
    }
  }

  // ============================================
  // РЕЖИМ ПЕРЕМЕЩЕНИЕ
  // ============================================
  async function handleMovingScan() {
    const parsed = parseScan(scanValue);
    if (!parsed) {
      setError("Некорректный скан");
      setScanValue("");
      return;
    }

    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      if (parsed.type === "cell") {
        // Это ячейка
        const cellInfo = await loadCellInfo(parsed.code);
        if (!cellInfo) {
          setError(`Ячейка "${parsed.code}" не найдена`);
          setScanValue("");
          return;
        }

        // Определяем, куда записать (FROM или TO)
        if (!fromCell) {
          // Первый скан - FROM
          setFromCell(cellInfo);
          setSuccess(`FROM: ${cellInfo.code} (${cellInfo.cell_type})`);
        } else if (!unit) {
          // Ещё нет unit - ошибка
          setError("Сначала отсканируйте unit");
          setScanValue("");
          return;
        } else {
          // Третий скан - TO
          setToCell(cellInfo);
          setSuccess(`TO: ${cellInfo.code} (${cellInfo.cell_type})`);

          // Автоматически выполняем перемещение
          setTimeout(() => executeMove(), 100);
        }
      } else {
        // Это unit barcode
        if (!fromCell) {
          setError("Сначала отсканируйте FROM ячейку");
          setScanValue("");
          return;
        }

        const unitInfo = await loadUnitInfo(parsed.code);
        if (!unitInfo) {
          setError(`Unit "${parsed.code}" не найден`);
          setScanValue("");
          return;
        }

        setUnit(unitInfo);
        setSuccess(`UNIT: ${unitInfo.barcode}`);
      }
    } catch (e: any) {
      setError(e.message || "Ошибка обработки скана");
    } finally {
      setBusy(false);
      setScanValue("");
    }
  }

  // Выполнение перемещения
  async function executeMove() {
    if (!fromCell || !unit || !toCell) {
      setError("Не все данные заполнены");
      return;
    }

    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const res = await fetch("/api/units/move-by-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromCellCode: fromCell.code,
          toCellCode: toCell.code,
          unitBarcode: unit.barcode,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Ошибка перемещения");
      }

      setSuccess(`✓ Перемещено: ${unit.barcode} из ${fromCell.code} в ${toCell.code}`);

      // Сброс состояния после успеха
      setTimeout(() => {
        setFromCell(null);
        setUnit(null);
        setToCell(null);
        setSuccess(null);
      }, 2000);
    } catch (e: any) {
      setError(e.message || "Ошибка перемещения");
    } finally {
      setBusy(false);
    }
  }

  // Сброс состояния
  function handleReset() {
    if (mode === "receiving") {
      setBinCell(null);
      setLastReceivedUnit(null);
    } else {
      setFromCell(null);
      setUnit(null);
      setToCell(null);
    }
    setError(null);
    setSuccess(null);
    setScanValue("");
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }

  // При смене режима сбрасываем состояние
  function handleModeChange(newMode: Mode) {
    if (newMode !== mode) {
      setMode(newMode);
      handleReset();
    }
  }

  const canMove = fromCell && unit && toCell && !busy;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 24px 0", fontSize: 28 }}>ТСД</h1>

      {/* Переключатель режимов */}
      <div style={{ marginBottom: 24, display: "flex", gap: 12 }}>
        <button
          onClick={() => handleModeChange("receiving")}
          style={{
            flex: 1,
            padding: "12px",
            fontSize: "16px",
            fontWeight: 600,
            background: mode === "receiving" ? "#2563eb" : "#f3f4f6",
            color: mode === "receiving" ? "#fff" : "#111",
            border: mode === "receiving" ? "2px solid #2563eb" : "2px solid #ddd",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Приемка
        </button>
        <button
          onClick={() => handleModeChange("moving")}
          style={{
            flex: 1,
            padding: "12px",
            fontSize: "16px",
            fontWeight: 600,
            background: mode === "moving" ? "#2563eb" : "#f3f4f6",
            color: mode === "moving" ? "#fff" : "#111",
            border: mode === "moving" ? "2px solid #2563eb" : "2px solid #ddd",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Перемещение
        </button>
      </div>

      {/* Главный input для сканирования */}
      <div style={{ marginBottom: 24 }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Сканируй здесь"
          value={scanValue}
          onChange={(e) => setScanValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          style={{
            width: "100%",
            padding: "20px",
            fontSize: "24px",
            border: "2px solid #2563eb",
            borderRadius: "8px",
            outline: "none",
            fontWeight: 600,
          }}
          autoFocus
        />
        {error && (
          <div style={{ marginTop: 12, padding: 12, background: "#fee", color: "#c00", borderRadius: 6, fontSize: 16 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ marginTop: 12, padding: 12, background: "#efe", color: "#060", borderRadius: 6, fontSize: 16 }}>
            {success}
          </div>
        )}
      </div>

      {/* Режим ПРИЕМКА */}
      {mode === "receiving" && (
        <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
          {/* BIN */}
          <div
            style={{
              padding: 20,
              background: binCell ? "#fff8e1" : "#f5f5f5",
              borderRadius: 8,
              border: "2px solid",
              borderColor: binCell ? "#ffc107" : "#ddd",
            }}
          >
            <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>BIN (ячейка приёмки)</div>
            {binCell ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: getCellColor(binCell.cell_type, binCell.meta),
                    border: "1px solid #ccc",
                    borderRadius: 4,
                  }}
                />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{binCell.code}</div>
                  <div style={{ fontSize: 14, color: "#666" }}>{binCell.cell_type}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 18, color: "#999" }}>—</div>
            )}
          </div>

          {/* Последний принятый */}
          {lastReceivedUnit && (
            <div
              style={{
                padding: 16,
                background: "#e8f5e9",
                borderRadius: 8,
                border: "2px solid #4caf50",
              }}
            >
              <div style={{ fontSize: 14, color: "#666", marginBottom: 4 }}>Последний принятый:</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {lastReceivedUnit.barcode} → {lastReceivedUnit.binCode}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Режим ПЕРЕМЕЩЕНИЕ */}
      {mode === "moving" && (
        <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
          {/* FROM */}
          <div
            style={{
              padding: 20,
              background: fromCell ? "#e3f2fd" : "#f5f5f5",
              borderRadius: 8,
              border: "2px solid",
              borderColor: fromCell ? "#2196f3" : "#ddd",
            }}
          >
            <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>FROM (откуда)</div>
            {fromCell ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: getCellColor(fromCell.cell_type, fromCell.meta),
                    border: "1px solid #ccc",
                    borderRadius: 4,
                  }}
                />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{fromCell.code}</div>
                  <div style={{ fontSize: 14, color: "#666" }}>{fromCell.cell_type}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 18, color: "#999" }}>—</div>
            )}
          </div>

          {/* UNIT */}
          <div
            style={{
              padding: 20,
              background: unit ? "#fff8e1" : "#f5f5f5",
              borderRadius: 8,
              border: "2px solid",
              borderColor: unit ? "#ffc107" : "#ddd",
            }}
          >
            <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>UNIT (что перемещаем)</div>
            {unit ? (
              <div style={{ fontSize: 20, fontWeight: 700 }}>{unit.barcode}</div>
            ) : (
              <div style={{ fontSize: 18, color: "#999" }}>—</div>
            )}
          </div>

          {/* TO */}
          <div
            style={{
              padding: 20,
              background: toCell ? "#e8f5e9" : "#f5f5f5",
              borderRadius: 8,
              border: "2px solid",
              borderColor: toCell ? "#4caf50" : "#ddd",
            }}
          >
            <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>TO (куда)</div>
            {toCell ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: getCellColor(toCell.cell_type, toCell.meta),
                    border: "1px solid #ccc",
                    borderRadius: 4,
                  }}
                />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{toCell.code}</div>
                  <div style={{ fontSize: 14, color: "#666" }}>{toCell.cell_type}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 18, color: "#999" }}>—</div>
            )}
          </div>
        </div>
      )}

      {/* Кнопки */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={handleReset}
          disabled={busy}
          style={{
            flex: 1,
            padding: "16px",
            fontSize: "18px",
            fontWeight: 600,
            background: "#f3f4f6",
            color: "#111",
            border: "1px solid #ddd",
            borderRadius: 8,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Сброс
        </button>
        {mode === "moving" && (
          <button
            onClick={executeMove}
            disabled={!canMove}
            style={{
              flex: 1,
              padding: "16px",
              fontSize: "18px",
              fontWeight: 600,
              background: canMove ? "#16a34a" : "#ccc",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: canMove ? "pointer" : "not-allowed",
            }}
          >
            Переместить
          </button>
        )}
      </div>

      {/* Инструкция */}
      <div style={{ marginTop: 24, padding: 16, background: "#f9fafb", borderRadius: 8, fontSize: 14, color: "#666" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Инструкция:</div>
        {mode === "receiving" ? (
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Отсканируйте BIN-ячейку (или введите код)</li>
            <li>Отсканируйте штрихкод заказа</li>
            <li>Заказ будет создан (если нового нет) и размещён в BIN</li>
            <li>BIN останется выбранным для приёма пачки заказов</li>
          </ol>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Отсканируйте FROM ячейку (или введите код)</li>
            <li>Отсканируйте UNIT (штрихкод заказа)</li>
            <li>Отсканируйте TO ячейку (или введите код)</li>
            <li>Перемещение выполнится автоматически</li>
          </ol>
        )}
      </div>
    </div>
  );
}
