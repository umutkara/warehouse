"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getCellColor } from "@/lib/ui/cellColors";
import { Alert, Button } from "@/lib/ui/components";

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

type Mode = "receiving" | "moving" | "inventory" | "shipping";

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
  
  // Для режима Инвентаризация
  const [inventoryCell, setInventoryCell] = useState<CellInfo | null>(null);
  const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);
  const [inventoryActive, setInventoryActive] = useState<boolean | null>(null);
  const [scanResult, setScanResult] = useState<{
    diff: { missing: string[]; extra: string[]; unknown: string[] };
    expected: { count: number };
    scanned: { count: number };
  } | null>(null);
  
  // Для режима Отгрузка (Shipping Tasks)
  const [shippingTasks, setShippingTasks] = useState<any[]>([]);
  const [currentTask, setCurrentTask] = useState<any | null>(null);
  const [shippingFromCell, setShippingFromCell] = useState<CellInfo | null>(null);
  const [shippingUnit, setShippingUnit] = useState<UnitInfo | null>(null);
  const [shippingToCell, setShippingToCell] = useState<CellInfo | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Проверка статуса инвентаризации при загрузке и смене режима
  useEffect(() => {
    async function checkInventoryStatus() {
      if (mode === "inventory") {
        try {
          const res = await fetch("/api/inventory/status", { cache: "no-store" });
          
          if (res.ok) {
            const json = await res.json();
            setInventoryActive(json.active || false);
            if (!json.active) {
              setInventoryError("Инвентаризация не активна. Обратитесь к менеджеру.");
            } else {
              setInventoryError(null);
            }
          }
        } catch (e: any) {
          console.error("Failed to check inventory status:", e);
        }
      } else {
        setInventoryActive(null);
        setInventoryError(null);
      }
    }
    checkInventoryStatus();
  }, [mode]);

  // Автофокус на input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [binCell, fromCell, unit, toCell, error, success, mode, inventoryCell, scannedBarcodes, shippingFromCell, shippingUnit, shippingToCell]);
  
  // Load shipping tasks when mode is shipping
  useEffect(() => {
    if (mode === "shipping") {
      loadShippingTasks();
    }
  }, [mode]);
  
  // Auto-load next task after completion or when tasks change
  useEffect(() => {
    if (mode === "shipping") {
      // If no current task and tasks available, take first
      if (!currentTask && shippingTasks.length > 0) {
        setCurrentTask(shippingTasks[0]);
        setShippingFromCell(null);
        setShippingUnit(null);
        setShippingToCell(null);
      }
      // If current task is done/canceled, remove it and take next
      if (currentTask && !shippingTasks.find((t: any) => t.id === currentTask.id)) {
        // Current task no longer in list (completed/canceled), take next
        if (shippingTasks.length > 0) {
          setCurrentTask(shippingTasks[0]);
          setShippingFromCell(null);
          setShippingUnit(null);
          setShippingToCell(null);
        } else {
          setCurrentTask(null);
          setShippingFromCell(null);
          setShippingUnit(null);
          setShippingToCell(null);
        }
      }
    }
  }, [mode, currentTask, shippingTasks]);
  
  async function loadShippingTasks() {
    setLoadingTasks(true);
    try {
      const res = await fetch("/api/tsd/shipping-tasks/list", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setShippingTasks(json.tasks || []);
        if (json.tasks && json.tasks.length > 0 && !currentTask) {
          setCurrentTask(json.tasks[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load shipping tasks:", e);
    } finally {
      setLoadingTasks(false);
    }
  }

  // Обработка Enter/CR
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Return") {
      e.preventDefault();
      if (mode === "receiving") {
        handleReceivingScan();
      } else if (mode === "moving") {
        handleMovingScan();
      } else if (mode === "inventory") {
        handleInventoryScan();
      } else if (mode === "shipping") {
        handleShippingScan();
      }
    }
  }

  // Распознавание скана (поддерживает CELL:CODE и CODE, case-insensitive)
  function parseScan(value: string): { type: "cell" | "unit"; code: string } | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Если начинается с "CELL:" => это ячейка
    if (trimmed.startsWith("CELL:") || trimmed.toUpperCase().startsWith("CELL:")) {
      const code = trimmed.substring(5).trim();
      if (code) return { type: "cell", code };
    }

    // Для режима инвентаризации: если нет активной ячейки, попробуем распознать код ячейки
    if (mode === "inventory" && !inventoryCell) {
      // Код ячейки: буквы+цифры, длина 2-10
      const cellPattern = /^[A-Z0-9]{2,10}$/i;
      if (cellPattern.test(trimmed)) {
        return { type: "cell", code: trimmed.toUpperCase() };
      }
    }

    // Иначе это barcode unit (только цифры)
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 1) {
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

        const rawText = await res.text().catch(() => '');
        let json: any = null;
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {}
        
        if (!res.ok) {
          throw new Error(json?.error || rawText || "Ошибка приёмки");
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

      const rawText = await res.text().catch(() => '');
      let json: any = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch {}
      
      if (!res.ok) {
        // Проверка на ошибку инвентаризации (423 Locked)
        if (res.status === 423 && json?.error) {
          setInventoryError(json.error);
          throw new Error(json.error);
        }
        throw new Error(json?.error || rawText || "Ошибка перемещения");
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
      // Если ошибка инвентаризации - очищаем через 5 секунд
      if (inventoryError) {
        setTimeout(() => setInventoryError(null), 5000);
      }
    } finally {
      setBusy(false);
    }
  }

  // Обработка скана в режиме инвентаризации
  async function handleInventoryScan() {
    if (!inventoryActive) {
      setError("Инвентаризация не активна");
      setScanValue("");
      return;
    }

    const parsed = parseScan(scanValue);
    if (!parsed) {
      setError("Некорректный скан");
      setScanValue("");
      return;
    }

    setError(null);
    setSuccess(null);

    if (parsed.type === "cell") {
      // Сканирование ячейки
      const cellInfo = await loadCellInfo(parsed.code);
      if (!cellInfo) {
        setError(`Ячейка "${parsed.code}" не найдена`);
        setScanValue("");
        return;
      }

      setInventoryCell(cellInfo);
      setScannedBarcodes([]);
      setScanResult(null);
      setSuccess(`Ячейка: ${cellInfo.code} (${cellInfo.cell_type})`);
      setScanValue("");
    } else {
      // Сканирование unit barcode
      if (!inventoryCell) {
        setError("Сначала отсканируйте ячейку");
        setScanValue("");
        return;
      }

      const barcode = parsed.code;
      if (scannedBarcodes.includes(barcode)) {
        setError(`Штрихкод "${barcode}" уже добавлен`);
        setScanValue("");
        return;
      }

      setScannedBarcodes([...scannedBarcodes, barcode].slice(-10)); // Последние 10
      setSuccess(`Добавлен: ${barcode} (всего: ${scannedBarcodes.length + 1})`);
      setScanValue("");
    }
  }

  // Сохранение результатов сканирования ячейки
  async function handleSaveCell() {
    if (!inventoryCell || !inventoryActive) {
      setError("Выберите ячейку и убедитесь что инвентаризация активна");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/inventory/cell-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cellCode: inventoryCell.code,
          unitBarcodes: scannedBarcodes,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const rawText = await res.text();
      let json: any = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch (parseError: any) {
        // Ignore parse errors
      }
      
      if (!res.ok) {
        throw new Error(json?.error || rawText || "Ошибка сохранения");
      }

      setScanResult(json);
      const hasDiff = json?.diff?.missing?.length > 0 || json?.diff?.extra?.length > 0 || json?.diff?.unknown?.length > 0;

      if (hasDiff) {
        setError(
          `Расхождение: missing=${json.diff.missing.length}, extra=${json.diff.extra.length}, unknown=${json.diff.unknown.length}`
        );
      } else {
        setSuccess(`✓ ОК: отсканировано ${json.scanned.count}, ожидалось ${json.expected.count}`);
      }

      // Очистить список после сохранения
      setScannedBarcodes([]);
    } catch (e: any) {
      setError(e.message || "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  // Очистить список штрихкодов
  function handleClearBarcodes() {
    setScannedBarcodes([]);
    setSuccess(null);
    setError(null);
  }

  // Сменить ячейку (сброс)
  function handleChangeCell() {
    setInventoryCell(null);
    setScannedBarcodes([]);
    setScanResult(null);
    setSuccess(null);
    setError(null);
  }

  // Обработка сканирования для режима Shipping
  async function handleShippingScan() {
    if (!scanValue.trim()) return;

    const parsed = parseScan(scanValue.trim());
    if (!parsed) {
      setError("Не удалось распознать сканирование");
      setScanValue("");
      return;
    }

    // Шаг 1: Сканирование FROM cell
    if (!shippingFromCell) {
      if (parsed.type === "cell") {
        // Normalize cell code: remove "CELL:" prefix, uppercase, trim
        const normalizedCode = parsed.code.replace(/^CELL:/i, "").trim().toUpperCase();
        
        // Найти ячейку
        const res = await fetch(`/api/cells/list`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok) {
          const cell = (json.cells || []).find((c: CellInfo) => 
            c.code.toUpperCase() === normalizedCode
          );
          if (cell) {
            // Verify cell is storage or shipping (not bin, not picking)
            if (cell.cell_type !== "storage" && cell.cell_type !== "shipping") {
              setError(`Ячейка "${cell.code}" имеет тип "${cell.cell_type}". FROM должна быть storage или shipping.`);
              setScanValue("");
              return;
            }
            
            setShippingFromCell(cell);
            setSuccess(`FROM: ${cell.code} (${cell.cell_type})`);
            setScanValue("");
          } else {
            setError(`Ячейка "${normalizedCode}" не найдена`);
            setScanValue("");
          }
        } else {
          setError("Ошибка загрузки ячеек");
          setScanValue("");
        }
      } else {
        setError("Сначала отсканируйте FROM ячейку (storage/shipping)");
        setScanValue("");
      }
      return;
    }

    // Шаг 2: Сканирование UNIT
    if (!shippingUnit) {
      if (parsed.type === "unit") {
        // Проверить, что unit совпадает с текущей задачей
        if (!currentTask) {
          setError("Нет активной задачи");
          setScanValue("");
          return;
        }

        if (currentTask.unit.barcode !== parsed.code) {
          setError(`Штрихкод не совпадает с задачей. Ожидается: ${currentTask.unit.barcode}`);
          setScanValue("");
          return;
        }

        setShippingUnit({ id: currentTask.unit.id, barcode: parsed.code });
        setSuccess(`UNIT: ${parsed.code}`);
        setScanValue("");
      } else {
        setError("Отсканируйте штрихкод заказа");
        setScanValue("");
      }
      return;
    }

    // Шаг 3: Сканирование TO cell
    if (!shippingToCell) {
      if (parsed.type === "cell") {
        // Normalize cell code: remove "CELL:" prefix, uppercase, trim
        const normalizedCode = parsed.code.replace(/^CELL:/i, "").trim().toUpperCase();
        
        // Проверить, что toCell совпадает с target cell задачи
        if (!currentTask) {
          setError("Нет активной задачи");
          setScanValue("");
          return;
        }

        if (!currentTask.targetCell) {
          setError("Целевая ячейка не найдена в задаче");
          setScanValue("");
          return;
        }

        if (currentTask.targetCell.code.toUpperCase() !== normalizedCode) {
          setError(`Ячейка не совпадает с задачей. Ожидается: ${currentTask.targetCell.code}`);
          setScanValue("");
          return;
        }

        // Verify target cell is picking type
        if (currentTask.targetCell.cell_type !== "picking") {
          setError(`Ячейка "${currentTask.targetCell.code}" имеет тип "${currentTask.targetCell.cell_type}". TO должна быть picking.`);
          setScanValue("");
          return;
        }

        setShippingToCell({
          id: currentTask.targetCell.id,
          code: currentTask.targetCell.code, // Use original code from task
          cell_type: currentTask.targetCell.cell_type,
        });
        setSuccess(`TO: ${currentTask.targetCell.code} (${currentTask.targetCell.cell_type})`);
        setScanValue("");

        // Автоматически выполняем задачу
        handleCompleteShippingTask();
      } else {
        setError("Отсканируйте целевую ячейку picking");
        setScanValue("");
      }
      return;
    }
  }

  // Выполнение задачи shipping
  async function handleCompleteShippingTask() {
    if (!currentTask || !shippingFromCell || !shippingUnit || !shippingToCell) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/tsd/shipping-tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: currentTask.id,
          fromCellCode: shippingFromCell.code,
          toCellCode: shippingToCell.code,
          unitBarcode: shippingUnit.barcode,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const rawText = await res.text();
      let json: any = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch (parseError: any) {
        // Ignore parse errors
      }

      if (res.status === 423) {
        // Inventory active - show prominent error notification
        setError("⚠️ ИНВЕНТАРИЗАЦИЯ АКТИВНА. ПЕРЕМЕЩЕНИЯ ЗАБЛОКИРОВАНЫ.");
        // Don't clear scan state - user might want to retry after inventory ends
        // Task status will remain open (rolled back in API if was updated to in_progress)
        setBusy(false);
        return;
      }

      if (!res.ok) {
        throw new Error(json?.error || rawText || "Ошибка выполнения задачи");
      }

      setSuccess(`✓ Задача выполнена: ${shippingUnit.barcode} → ${shippingToCell.code}`);

      // Сброс состояния сканирования
      setShippingFromCell(null);
      setShippingUnit(null);
      setShippingToCell(null);

      // Перезагрузить задачи (useEffect автоматически выберет следующую)
      await loadShippingTasks();
    } catch (e: any) {
      setError(e.message || "Ошибка выполнения задачи");
    } finally {
      setBusy(false);
    }
  }

  // Сброс состояния
  function handleReset() {
    if (mode === "receiving") {
      setBinCell(null);
      setLastReceivedUnit(null);
    } else if (mode === "moving") {
      setFromCell(null);
      setUnit(null);
      setToCell(null);
    } else if (mode === "inventory") {
      setInventoryCell(null);
      setScannedBarcodes([]);
      setScanResult(null);
    } else if (mode === "shipping") {
      setShippingFromCell(null);
      setShippingUnit(null);
      setShippingToCell(null);
      // Не сбрасываем currentTask - он загружается автоматически
    }
    setError(null);
    setSuccess(null);
    if (mode !== "inventory") {
      setInventoryError(null);
    }
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
    <>
      {/* Sticky header с кнопкой возврата */}
      <header
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: "var(--color-bg)",
            borderBottom: "1px solid var(--color-border)",
            padding: "var(--spacing-md) var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
      >
        <Link
          href="/app/warehouse-map"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--spacing-sm)",
            padding: "var(--spacing-sm) var(--spacing-lg)",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--color-primary)",
            textDecoration: "none",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-primary)",
            background: "var(--color-bg)",
            transition: "all var(--transition-base)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-primary-light)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--color-bg)";
          }}
        >
          ← Вернуться
        </Link>
      </header>

      {inventoryError && (
        <div
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 200,
            padding: "var(--spacing-xl)",
            fontSize: "20px",
            fontWeight: 700,
            textAlign: "center",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <Alert variant="error" style={{ fontSize: "18px", padding: "var(--spacing-lg)" }}>
            {inventoryError}
          </Alert>
        </div>
      )}

      {/* Prominent 423 error for shipping tasks */}
      {mode === "shipping" && error && error.includes("ИНВЕНТАРИЗАЦИЯ АКТИВНА") && (
        <div
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 200,
            padding: "var(--spacing-xl)",
            fontSize: "24px",
            fontWeight: 700,
            textAlign: "center",
            boxShadow: "var(--shadow-lg)",
            background: "#fff",
          }}
        >
          <Alert
            variant="error"
            style={{
              fontSize: "20px",
              padding: "var(--spacing-xl)",
              background: "#ffebee",
              border: "3px solid #f44336",
            }}
          >
            {error}
          </Alert>
        </div>
      )}

      <div
        style={{
          padding: "var(--spacing-lg)",
          maxWidth: 560,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ margin: "0 0 var(--spacing-xl) 0", fontSize: "24px", fontWeight: 700, color: "var(--color-text)" }}>
          ТСД
        </h1>

        {/* Переключатель режимов */}
        <div style={{ marginBottom: "var(--spacing-lg)", display: "flex", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
          <Button
            variant={mode === "receiving" ? "primary" : "secondary"}
            size="lg"
            onClick={() => handleModeChange("receiving")}
            fullWidth
            style={{ flex: 1, minWidth: 100 }}
          >
            Приемка
          </Button>
          <Button
            variant={mode === "moving" ? "primary" : "secondary"}
            size="lg"
            onClick={() => handleModeChange("moving")}
            fullWidth
            style={{ flex: 1, minWidth: 100 }}
          >
            Перемещение
          </Button>
          <Button
            variant={mode === "inventory" ? "primary" : "secondary"}
            size="lg"
            onClick={() => handleModeChange("inventory")}
            fullWidth
            style={{ flex: 1, minWidth: 100 }}
          >
            Инвентаризация
          </Button>
          <Button
            variant={mode === "shipping" ? "primary" : "secondary"}
            size="lg"
            onClick={() => handleModeChange("shipping")}
            fullWidth
            style={{ flex: 1, minWidth: 100 }}
          >
            Отгрузка
          </Button>
        </div>

        {/* Главный input для сканирования */}
        <div style={{ marginBottom: 16 }}>
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
              padding: "var(--spacing-lg)",
              minHeight: 56,
              fontSize: "20px",
              border: "2px solid var(--color-primary)",
              borderRadius: "var(--radius-md)",
              outline: "none",
              fontWeight: 600,
              boxSizing: "border-box",
              background: "var(--color-bg)",
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
              transition: "all var(--transition-base)",
            }}
            autoFocus
          />
          {error && (
            <div style={{ marginTop: "var(--spacing-sm)" }}>
              <Alert variant="error">{error}</Alert>
            </div>
          )}
          {success && (
            <div style={{ marginTop: "var(--spacing-sm)" }}>
              <Alert variant="success">{success}</Alert>
            </div>
          )}
        </div>

        {/* Режим ПРИЕМКА */}
        {mode === "receiving" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            {/* BIN */}
            <div
              style={{
                padding: 16,
                background: binCell ? "#fff8e1" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: binCell ? "#ffc107" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>BIN (ячейка приёмки)</div>
              {binCell ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: getCellColor(binCell.cell_type, binCell.meta),
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700 }}>{binCell.code}</div>
                    <div style={{ fontSize: "14px", color: "#666" }}>{binCell.cell_type}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "18px", color: "#999" }}>—</div>
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
                <div style={{ fontSize: "14px", color: "#666", marginBottom: 4 }}>Последний принятый:</div>
                <div style={{ fontSize: "18px", fontWeight: 700 }}>
                  {lastReceivedUnit.barcode} → {lastReceivedUnit.binCode}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Режим ИНВЕНТАРИЗАЦИЯ */}
        {mode === "inventory" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            {/* Ячейка */}
            <div
              style={{
                padding: 16,
                background: inventoryCell ? getCellColor(inventoryCell.cell_type, inventoryCell.meta) : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: inventoryCell ? "#2563eb" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>Ячейка</div>
              {inventoryCell ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: getCellColor(inventoryCell.cell_type, inventoryCell.meta),
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700 }}>{inventoryCell.code}</div>
                    <div style={{ fontSize: "14px", color: "#666" }}>{inventoryCell.cell_type}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "18px", color: "#999" }}>—</div>
              )}
            </div>

            {/* Список штрихкодов */}
            {scannedBarcodes.length > 0 && (
              <div
                style={{
                  padding: 16,
                  background: "#fff",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              >
                <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>
                  Отсканировано: {scannedBarcodes.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                  {scannedBarcodes.slice(-10).reverse().map((barcode: string, idx: number) => (
                    <div key={idx} style={{ fontSize: "16px", padding: "4px 8px", background: "#f9fafb", borderRadius: 4 }}>
                      {barcode}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Результат последнего сохранения */}
            {scanResult && (
              <div
                style={{
                  padding: 16,
                  background: scanResult.diff.missing.length > 0 || scanResult.diff.extra.length > 0 || scanResult.diff.unknown.length > 0
                    ? "#fee"
                    : "#efe",
                  borderRadius: 8,
                  border: "2px solid",
                  borderColor: scanResult.diff.missing.length > 0 || scanResult.diff.extra.length > 0 || scanResult.diff.unknown.length > 0
                    ? "#f00"
                    : "#0c0",
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: 8 }}>
                  {scanResult.diff.missing.length > 0 || scanResult.diff.extra.length > 0 || scanResult.diff.unknown.length > 0
                    ? "Расхождение"
                    : "ОК"}
                </div>
                <div style={{ fontSize: "14px", color: "#666" }}>
                  Ожидалось: {scanResult.expected.count}, Отсканировано: {scanResult.scanned.count}
                </div>
                {(scanResult.diff.missing.length > 0 || scanResult.diff.extra.length > 0 || scanResult.diff.unknown.length > 0) && (
                  <div style={{ fontSize: "12px", marginTop: 8, color: "#666" }}>
                    Missing: {scanResult.diff.missing.length}, Extra: {scanResult.diff.extra.length}, Unknown: {scanResult.diff.unknown.length}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Режим ОТГРУЗКА (Shipping Tasks) */}
        {mode === "shipping" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            {loadingTasks ? (
              <div style={{ padding: 16, textAlign: "center", color: "#666" }}>Загрузка задач...</div>
            ) : !currentTask ? (
              <div style={{ padding: 16, background: "#f5f5f5", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: "18px", color: "#666" }}>Нет активных задач</div>
                <div style={{ fontSize: "14px", color: "#999", marginTop: 8 }}>Создайте задачу в разделе Ops</div>
              </div>
            ) : (
              <>
                {/* Текущая задача */}
                <div
                  style={{
                    padding: 16,
                    background: "#e3f2fd",
                    borderRadius: 8,
                    border: "2px solid #2196f3",
                  }}
                >
                  <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>Задача</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: 4 }}>
                    Заказ: {currentTask.unit.barcode}
                  </div>
                  {currentTask.scenario && (
                    <div style={{ fontSize: "14px", color: "#666", marginTop: 4 }}>Сценарий: {currentTask.scenario}</div>
                  )}
                  {currentTask.fromCell && (
                    <div style={{ fontSize: "14px", color: "#666", marginTop: 4 }}>
                      FROM: {currentTask.fromCell.code} ({currentTask.fromCell.cell_type})
                    </div>
                  )}
                  {currentTask.targetCell && (
                    <div style={{ fontSize: "14px", color: "#666", marginTop: 4 }}>
                      TO: {currentTask.targetCell.code} ({currentTask.targetCell.cell_type})
                    </div>
                  )}
                </div>

                {/* FROM */}
                <div
                  style={{
                    padding: 16,
                    background: shippingFromCell ? "#e3f2fd" : "#f5f5f5",
                    borderRadius: 8,
                    border: "2px solid",
                    borderColor: shippingFromCell ? "#2196f3" : "#ddd",
                  }}
                >
                  <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>FROM (откуда)</div>
                  {shippingFromCell ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          backgroundColor: getCellColor(shippingFromCell.cell_type, shippingFromCell.meta),
                          border: "1px solid #ccc",
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div style={{ fontSize: "20px", fontWeight: 700 }}>{shippingFromCell.code}</div>
                        <div style={{ fontSize: "14px", color: "#666" }}>{shippingFromCell.cell_type}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "18px", color: "#999" }}>—</div>
                  )}
                </div>

                {/* UNIT */}
                <div
                  style={{
                    padding: 16,
                    background: shippingUnit ? "#fff8e1" : "#f5f5f5",
                    borderRadius: 8,
                    border: "2px solid",
                    borderColor: shippingUnit ? "#ffc107" : "#ddd",
                  }}
                >
                  <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>UNIT (заказ)</div>
                  {shippingUnit ? (
                    <div style={{ fontSize: "20px", fontWeight: 700 }}>{shippingUnit.barcode}</div>
                  ) : (
                    <div style={{ fontSize: "18px", color: "#999" }}>—</div>
                  )}
                </div>

                {/* TO */}
                <div
                  style={{
                    padding: 16,
                    background: shippingToCell ? "#e8f5e9" : "#f5f5f5",
                    borderRadius: 8,
                    border: "2px solid",
                    borderColor: shippingToCell ? "#4caf50" : "#ddd",
                  }}
                >
                  <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>TO (picking ячейка)</div>
                  {shippingToCell ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          backgroundColor: getCellColor(shippingToCell.cell_type, shippingToCell.meta),
                          border: "1px solid #ccc",
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div style={{ fontSize: "20px", fontWeight: 700 }}>{shippingToCell.code}</div>
                        <div style={{ fontSize: "14px", color: "#666" }}>{shippingToCell.cell_type}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "18px", color: "#999" }}>—</div>
                  )}
                </div>

                {/* Инструкции */}
                <div style={{ padding: 16, background: "#f9fafb", borderRadius: 8, fontSize: "14px", color: "#666", border: "2px solid #e0e0e0" }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, fontSize: "16px", color: "#333" }}>📋 Инструкция:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        width: 24, 
                        height: 24, 
                        borderRadius: "50%", 
                        background: shippingFromCell ? "#4caf50" : "#e0e0e0",
                        color: shippingFromCell ? "#fff" : "#666",
                        fontWeight: 700,
                        fontSize: 12
                      }}>1</span>
                      <span style={{ flex: 1 }}>
                        Отсканируйте <strong>FROM</strong> ячейку (storage/shipping)
                      </span>
                      {shippingFromCell && <span style={{ color: "#4caf50", fontWeight: 600 }}>✓</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        width: 24, 
                        height: 24, 
                        borderRadius: "50%", 
                        background: shippingUnit ? "#4caf50" : "#e0e0e0",
                        color: shippingUnit ? "#fff" : "#666",
                        fontWeight: 700,
                        fontSize: 12
                      }}>2</span>
                      <span style={{ flex: 1 }}>
                        Отсканируйте <strong>штрихкод заказа</strong>
                      </span>
                      {shippingUnit && <span style={{ color: "#4caf50", fontWeight: 600 }}>✓</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        width: 24, 
                        height: 24, 
                        borderRadius: "50%", 
                        background: shippingToCell ? "#4caf50" : "#e0e0e0",
                        color: shippingToCell ? "#fff" : "#666",
                        fontWeight: 700,
                        fontSize: 12
                      }}>3</span>
                      <span style={{ flex: 1 }}>
                        Отсканируйте <strong>TO</strong> (picking) ячейку
                      </span>
                      {shippingToCell && <span style={{ color: "#4caf50", fontWeight: 600 }}>✓</span>}
                    </div>
                  </div>
                  <div style={{ marginTop: 12, padding: 8, background: "#e8f5e9", borderRadius: 6, color: "#2e7d32", fontWeight: 600, fontSize: 13 }}>
                    ✓ Задача выполнится автоматически после 3-го скана
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Режим ПЕРЕМЕЩЕНИЕ */}
        {mode === "moving" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            {/* FROM */}
            <div
              style={{
                padding: 16,
                background: fromCell ? "#e3f2fd" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: fromCell ? "#2196f3" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>FROM (откуда)</div>
              {fromCell ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: getCellColor(fromCell.cell_type, fromCell.meta),
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700 }}>{fromCell.code}</div>
                    <div style={{ fontSize: "14px", color: "#666" }}>{fromCell.cell_type}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "18px", color: "#999" }}>—</div>
              )}
            </div>

            {/* UNIT */}
            <div
              style={{
                padding: 16,
                background: unit ? "#fff8e1" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: unit ? "#ffc107" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>UNIT (что перемещаем)</div>
              {unit ? (
                <div style={{ fontSize: "20px", fontWeight: 700 }}>{unit.barcode}</div>
              ) : (
                <div style={{ fontSize: "18px", color: "#999" }}>—</div>
              )}
            </div>

            {/* TO */}
            <div
              style={{
                padding: 16,
                background: toCell ? "#e8f5e9" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: toCell ? "#4caf50" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>TO (куда)</div>
              {toCell ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: getCellColor(toCell.cell_type, toCell.meta),
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700 }}>{toCell.code}</div>
                    <div style={{ fontSize: "14px", color: "#666" }}>{toCell.cell_type}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "18px", color: "#999" }}>—</div>
              )}
            </div>
          </div>
        )}

        {/* Кнопки */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "shipping" && (
            <>
              <Button
                variant="secondary"
                size="lg"
                onClick={handleReset}
                disabled={busy}
                fullWidth
              >
                Сброс
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadShippingTasks}
                disabled={loadingTasks || busy}
                fullWidth
              >
                Обновить список задач
              </Button>
            </>
          )}
              {mode === "inventory" && (
            <>
              <Button
                variant="primary"
                size="lg"
                onClick={handleSaveCell}
                disabled={busy || !inventoryCell || !inventoryActive}
                fullWidth
                style={{
                  background: inventoryCell && inventoryActive && !busy ? "var(--color-success)" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (inventoryCell && inventoryActive && !busy) {
                    e.currentTarget.style.background = "#15803d";
                  }
                }}
                onMouseLeave={(e) => {
                  if (inventoryCell && inventoryActive && !busy) {
                    e.currentTarget.style.background = "var(--color-success)";
                  }
                }}
              >
                Сохранить ячейку
              </Button>
              {scannedBarcodes.length > 0 && (
                <Button variant="secondary" size="lg" onClick={handleClearBarcodes} disabled={busy} fullWidth>
                  Очистить список
                </Button>
              )}
              {inventoryCell && (
                <Button variant="secondary" size="lg" onClick={handleChangeCell} disabled={busy} fullWidth>
                  Сменить ячейку
                </Button>
              )}
            </>
          )}
          <Button variant="secondary" size="lg" onClick={handleReset} disabled={busy} fullWidth>
            Сброс
          </Button>
          {mode === "moving" && (
            <Button
              variant="primary"
              size="lg"
              onClick={executeMove}
              disabled={!canMove}
              fullWidth
              style={{
                background: canMove ? "var(--color-success)" : undefined,
              }}
              onMouseEnter={(e) => {
                if (canMove) {
                  e.currentTarget.style.background = "#15803d";
                }
              }}
              onMouseLeave={(e) => {
                if (canMove) {
                  e.currentTarget.style.background = "var(--color-success)";
                }
              }}
            >
              Переместить
            </Button>
          )}
        </div>

        {/* Инструкция */}
        <div style={{ marginTop: 16, padding: 12, background: "#f9fafb", borderRadius: 8, fontSize: "13px", color: "#666" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Инструкция:</div>
          {mode === "receiving" ? (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Отсканируйте BIN-ячейку (или введите код)</li>
              <li>Отсканируйте штрихкод заказа</li>
              <li>Заказ будет создан (если нового нет) и размещён в BIN</li>
              <li>BIN останется выбранным для приёма пачки заказов</li>
            </ol>
          ) : mode === "moving" ? (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Отсканируйте FROM ячейку (или введите код)</li>
              <li>Отсканируйте UNIT (штрихкод заказа)</li>
              <li>Отсканируйте TO ячейку (или введите код)</li>
              <li>Перемещение выполнится автоматически</li>
            </ol>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Отсканируйте ячейку (или введите код)</li>
              <li>Отсканируйте штрихкоды unit'ов подряд (каждый Enter добавляет в список)</li>
              <li>Нажмите "Сохранить ячейку" для отправки результатов</li>
              <li>Проверьте результат: ОК или расхождение</li>
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
