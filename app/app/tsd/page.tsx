"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { getCellColor } from "@/lib/ui/cellColors";
import { Alert, Button } from "@/lib/ui/components";

// ⚡ Force dynamic for real-time TSD operations
export const dynamic = 'force-dynamic';

type CellInfo = {
  id: string;
  code: string;
  cell_type: string;
  meta?: any;
};

type UnitInfo = {
  id: string;
  barcode: string;
  cell_id?: string;
  cell?: {
    id: string;
    code: string;
    cell_type: string;
  };
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
  const [units, setUnits] = useState<UnitInfo[]>([]); // Массив отсканированных заказов
  const [toCell, setToCell] = useState<CellInfo | null>(null);
  
  // Для режима Инвентаризация
  const [inventoryTasks, setInventoryTasks] = useState<any[]>([]);
  const [currentInventoryTask, setCurrentInventoryTask] = useState<any | null>(null);
  const [inventoryCell, setInventoryCell] = useState<CellInfo | null>(null);
  const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);
  const [inventoryActive, setInventoryActive] = useState<boolean | null>(null);
  const [scanResult, setScanResult] = useState<{
    diff: { missing: string[]; extra: string[]; unknown: string[] };
    expected: { count: number };
    scanned: { count: number };
  } | null>(null);
  const [loadingInventoryTasks, setLoadingInventoryTasks] = useState(false);
  
  // Для режима Отгрузка (Shipping Tasks)
  const [shippingTasks, setShippingTasks] = useState<any[]>([]);
  const [currentTask, setCurrentTask] = useState<any | null>(null);
  const [shippingFromCell, setShippingFromCell] = useState<CellInfo | null>(null);
  const [shippingUnits, setShippingUnits] = useState<UnitInfo[]>([]); // Массив отсканированных заказов
  const [shippingToCell, setShippingToCell] = useState<CellInfo | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Проверка статуса инвентаризации и загрузка заданий
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
              loadInventoryTasks(); // Загрузить задания
            }
          }
        } catch (e: any) {
          console.error("Failed to check inventory status:", e);
        }
      } else {
        setInventoryActive(null);
        setInventoryError(null);
        setInventoryTasks([]);
        setCurrentInventoryTask(null);
      }
    }
    checkInventoryStatus();
  }, [mode]);

  // Автофокус на input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [binCell, fromCell, units, toCell, error, success, mode, inventoryCell, scannedBarcodes, shippingFromCell, shippingUnits, shippingToCell]);
  
  // Load shipping tasks when mode is shipping
  useEffect(() => {
    if (mode === "shipping") {
      loadShippingTasks();
    }
  }, [mode]);
  
  // Auto-load next task after completion
  useEffect(() => {
    if (mode === "shipping") {
      // If current task is done/canceled, remove it
      if (currentTask && !shippingTasks.find((t: any) => t.id === currentTask.id)) {
        // Current task no longer in list (completed/canceled)
        setCurrentTask(null);
        setShippingFromCell(null);
        setShippingUnits([]);
        setShippingToCell(null);
      }
    }
  }, [mode, currentTask, shippingTasks]);

  // Select task handler
  function handleSelectTask(task: any) {
    setCurrentTask(task);
    setShippingFromCell(null);
    setShippingUnits([]);
    setShippingToCell(null);
    setError(null);
    setSuccess(null);
  }
  
  async function loadShippingTasks() {
    setLoadingTasks(true);
    try {
      const res = await fetch("/api/tsd/shipping-tasks/list", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setShippingTasks(json.tasks || []);
        // Пользователь сам выбирает задачу из списка (не автовыбор)
      }
    } catch (e) {
      console.error("Failed to load shipping tasks:", e);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function loadInventoryTasks() {
    setLoadingInventoryTasks(true);
    try {
      const res = await fetch("/api/tsd/inventory-tasks/list", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setInventoryTasks(json.tasks || []);
      }
    } catch (e) {
      console.error("Failed to load inventory tasks:", e);
    } finally {
      setLoadingInventoryTasks(false);
    }
  }

  async function handleSelectInventoryTask(task: any) {
    setError(null);
    setBusy(true);
    
    try {
      // Блокируем задание для текущего пользователя
      const res = await fetch("/api/tsd/inventory-tasks/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "Ошибка выбора задания");
        return;
      }

      const json = await res.json();
      
      // Устанавливаем текущее задание и ячейку
      setCurrentInventoryTask(task);
      setInventoryCell({
        id: json.cellId,
        code: json.cellCode,
        cell_type: json.cellType,
      });
      setSuccess(`Задание взято: ${json.cellCode}`);
      
      // Очищаем сообщение через 3 секунды
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Ошибка выбора задания");
    } finally {
      setBusy(false);
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
          cell_id: json.unit.cell_id,
          cell: json.cell ? {
            id: json.cell.id,
            code: json.cell.code,
            cell_type: json.cell.cell_type,
          } : undefined,
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
          // ⭐ НОВАЯ ПРОВЕРКА: FROM может быть только bin, storage, shipping
          const allowedFromTypes = ['bin', 'storage', 'shipping'];
          if (!allowedFromTypes.includes(cellInfo.cell_type)) {
            setError(`Перемещение из ячейки типа "${cellInfo.cell_type.toUpperCase()}" не разрешено. Доступны: BIN, STORAGE, SHIPPING`);
            setScanValue("");
            return;
          }

          setFromCell(cellInfo);
          setSuccess(`FROM: ${cellInfo.code} (${cellInfo.cell_type})`);
        } else {
          // Второй скан ячейки - TO
          // Должен быть хотя бы один отсканированный заказ
          if (units.length === 0) {
            setError("Сначала отсканируйте хотя бы один заказ");
            setScanValue("");
            return;
          }

          // ⭐ НОВАЯ ПРОВЕРКА: проверяем матрицу разрешенных перемещений
          const isValidMove = validateMove(fromCell.cell_type, cellInfo.cell_type);
          if (!isValidMove.valid) {
            setError(isValidMove.error || "Перемещение запрещено");
            setScanValue("");
            return;
          }

          setToCell(cellInfo);
          setSuccess(`TO: ${cellInfo.code} (${cellInfo.cell_type})`);

          // Автоматически выполняем массовое перемещение (передаем toCell напрямую)
          executeMove(cellInfo);
        }
      } else {
        // Это unit barcode
        if (!fromCell) {
          setError("Сначала отсканируйте FROM ячейку");
          setScanValue("");
          return;
        }

        // Проверяем, не отсканирован ли уже этот заказ (дубликат)
        if (units.some(u => u.barcode === parsed.code)) {
          setError(`Заказ ${parsed.code} уже отсканирован (дубликат)`);
          setScanValue("");
          return;
        }

        const unitInfo = await loadUnitInfo(parsed.code);
        if (!unitInfo) {
          setError(`Заказ "${parsed.code}" не найден в системе`);
          setScanValue("");
          return;
        }

        // ⭐ НОВЫЕ ПРОВЕРКИ для FROM = BIN
        if (fromCell.cell_type === 'bin') {
          // Проверка 1: заказ должен быть в конкретной FROM ячейке
          if (!unitInfo.cell || unitInfo.cell.id !== fromCell.id) {
            setError(`Заказ ${parsed.code} не находится в ячейке ${fromCell.code}`);
            setScanValue("");
            return;
          }

          // Проверка 2: заказ НЕ должен быть в storage/shipping/picking
          const forbiddenTypes = ['storage', 'shipping', 'picking'];
          if (unitInfo.cell && forbiddenTypes.includes(unitInfo.cell.cell_type)) {
            setError(`Заказ ${parsed.code} находится в ячейке типа ${unitInfo.cell.cell_type.toUpperCase()}. Можно перемещать только из BIN`);
            setScanValue("");
            return;
          }
        }

        // Добавляем в массив
        setUnits([...units, unitInfo]);
        setSuccess(`✓ Добавлен: ${unitInfo.barcode} (всего: ${units.length + 1})`);
      }
    } catch (e: any) {
      setError(e.message || "Ошибка обработки скана");
    } finally {
      setBusy(false);
      setScanValue("");
    }
  }

  // ⭐ НОВАЯ ФУНКЦИЯ: проверка матрицы разрешенных перемещений
  function validateMove(fromType: string, toType: string): { valid: boolean; error?: string } {
    // Матрица разрешенных перемещений:
    // BIN → STORAGE ✅
    // BIN → SHIPPING ✅
    // STORAGE → SHIPPING ✅
    // STORAGE → STORAGE ✅ (обратная совместимость)
    // SHIPPING → STORAGE ✅
    // SHIPPING → SHIPPING ✅ (обратная совместимость)
    // Всё остальное ❌

    if (fromType === 'bin') {
      if (toType === 'storage' || toType === 'shipping') {
        return { valid: true };
      }
      return { 
        valid: false, 
        error: `Из BIN можно переместить только в STORAGE или SHIPPING. Выбрано: ${toType.toUpperCase()}` 
      };
    }

    if (fromType === 'storage') {
      if (toType === 'shipping' || toType === 'storage') {
        return { valid: true };
      }
      return { 
        valid: false, 
        error: `Из STORAGE можно переместить только в SHIPPING или другую STORAGE. Выбрано: ${toType.toUpperCase()}` 
      };
    }

    if (fromType === 'shipping') {
      if (toType === 'storage' || toType === 'shipping') {
        return { valid: true };
      }
      return { 
        valid: false, 
        error: `Из SHIPPING можно переместить только в STORAGE или другую SHIPPING. Выбрано: ${toType.toUpperCase()}` 
      };
    }

    // Другие типы не поддерживаются
    return { 
      valid: false, 
      error: `Перемещение из ${fromType.toUpperCase()} не поддерживается` 
    };
  }

  // Выполнение перемещения (массовое)
  // toCellOverride: используется при автоматическом вызове после setToCell для избежания race condition
  async function executeMove(toCellOverride?: CellInfo) {
    const effectiveToCell = toCellOverride || toCell;
    
    if (!fromCell || units.length === 0 || !effectiveToCell) {
      setError("Не все данные заполнены");
      return;
    }

    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      let successCount = 0;
      let failedUnits: string[] = [];

      // Перемещаем каждый unit последовательно
      for (const unit of units) {
        try {
          const res = await fetch("/api/units/move-by-scan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fromCellCode: fromCell.code,
              toCellCode: effectiveToCell.code,
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
            failedUnits.push(`${unit.barcode}: ${json?.error || rawText || "ошибка"}`);
          } else {
            successCount++;
          }
        } catch (e: any) {
          failedUnits.push(`${unit.barcode}: ${e.message}`);
        }
      }

      // Формируем сообщение о результате
      if (failedUnits.length === 0) {
        setSuccess(`✓ Успешно перемещено ${successCount} заказов из ${fromCell.code} в ${effectiveToCell.code}`);
      } else {
        setError(`Перемещено: ${successCount}, Ошибок: ${failedUnits.length}. ${failedUnits.slice(0, 3).join(", ")}${failedUnits.length > 3 ? "..." : ""}`);
      }

      // Сброс состояния после успеха
      setTimeout(() => {
        setFromCell(null);
        setUnits([]);
        setToCell(null);
        if (failedUnits.length === 0) {
          setSuccess(null);
        }
      }, 3000);
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

    if (!inventoryCell || !currentInventoryTask) {
      setError("Сначала выберите ячейку из списка заданий");
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

    // Только сканирование unit barcode (ячейка уже выбрана из списка)
    const barcode = parsed.code;
    if (scannedBarcodes.includes(barcode)) {
      setError(`Штрихкод "${barcode}" уже добавлен`);
      setScanValue("");
      return;
    }

    setScannedBarcodes([...scannedBarcodes, barcode]);
    setSuccess(`Добавлен: ${barcode} (всего: ${scannedBarcodes.length + 1})`);
    setScanValue("");
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
    setCurrentInventoryTask(null);
    setInventoryCell(null);
    setScannedBarcodes([]);
    setScanResult(null);
    setSuccess(null);
    setError(null);
    loadInventoryTasks(); // Перезагрузить список заданий
  }

  // Обработка сканирования для режима Shipping (как режим Перемещение)
  async function handleShippingScan() {
    if (!scanValue.trim()) return;

    // Проверка наличия активной задачи
    if (!currentTask) {
      setError("Сначала выберите задание из списка");
      setScanValue("");
      return;
    }

    const parsed = parseScan(scanValue.trim());
    if (!parsed) {
      setError("Не удалось распознать сканирование");
      setScanValue("");
      return;
    }

    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      if (parsed.type === "cell") {
        // Сканируем ячейку
        const cellInfo = await loadCellInfo(parsed.code);
        if (!cellInfo) {
          setError(`Ячейка "${parsed.code}" не найдена`);
          setScanValue("");
          return;
        }

        // Определяем FROM или TO
        if (!shippingFromCell) {
          // Первая ячейка - FROM
          // Должна быть storage или shipping
          if (cellInfo.cell_type !== "storage" && cellInfo.cell_type !== "shipping") {
            setError(`FROM ячейка должна быть storage или shipping, а не ${cellInfo.cell_type}`);
            setScanValue("");
            return;
          }
          
          // Взять задачу в работу (in_progress) - блокирует для других пользователей
          try {
            const startRes = await fetch("/api/tsd/shipping-tasks/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: currentTask.id }),
            });

            if (!startRes.ok) {
              const startJson = await startRes.json().catch(() => ({}));
              throw new Error(startJson.error || "Не удалось взять задачу в работу");
            }
          } catch (e: any) {
            setError(`Ошибка: ${e.message}`);
            setScanValue("");
            return;
          }
          
          setShippingFromCell(cellInfo);
          setSuccess(`✓ Задача в работе! FROM: ${cellInfo.code} (${cellInfo.cell_type})`);
        } else {
          // Вторая ячейка - TO
          // Должен быть хотя бы один unit
          if (shippingUnits.length === 0) {
            setError("Сначала отсканируйте хотя бы один заказ");
            setScanValue("");
            return;
          }

          // TO ячейка должна совпадать с targetCell задачи
          if (!currentTask.targetCell) {
            setError("Целевая ячейка не найдена в задаче");
            setScanValue("");
            return;
          }

          if (cellInfo.id !== currentTask.targetCell.id) {
            setError(`TO ячейка должна быть ${currentTask.targetCell.code} (из задания)`);
            setScanValue("");
            return;
          }

          // Verify target cell is picking type
          if (cellInfo.cell_type !== "picking") {
            setError(`TO ячейка должна быть picking, а не ${cellInfo.cell_type}`);
            setScanValue("");
            return;
          }

          setShippingToCell(cellInfo);
          setSuccess(`TO: ${cellInfo.code} (${cellInfo.cell_type})`);
          
          // Автоматически выполняем перемещение (передаем toCell напрямую)
          handleCompleteShippingTask(cellInfo);
        }
      } else {
        // Сканируем unit barcode
        if (!shippingFromCell) {
          setError("Сначала отсканируйте FROM ячейку");
          setScanValue("");
          return;
        }

        // Проверяем что unit не отсканирован уже
        if (shippingUnits.some(u => u.barcode === parsed.code)) {
          setError(`Заказ ${parsed.code} уже отсканирован`);
          setScanValue("");
          return;
        }

        // Проверяем что unit принадлежит текущей задаче
        const unitInTask = currentTask.units?.find((u: any) => u.barcode === parsed.code);
        if (!unitInTask) {
          setError(`Заказ ${parsed.code} не принадлежит текущему заданию`);
          setScanValue("");
          return;
        }

        const unitInfo = await loadUnitInfo(parsed.code);
        if (!unitInfo) {
          setError(`Unit "${parsed.code}" не найден`);
          setScanValue("");
          return;
        }

        // Добавляем в массив
        setShippingUnits([...shippingUnits, unitInfo]);
        setSuccess(`✓ Добавлен: ${unitInfo.barcode} (всего: ${shippingUnits.length + 1}/${currentTask.unitCount})`);
      }
    } catch (e: any) {
      setError(e.message || "Ошибка обработки скана");
    } finally {
      setBusy(false);
      setScanValue("");
    }
  }

  // Выполнение задачи shipping (массовое перемещение)
  // toCell: optional override (used when called immediately after setState to avoid async race condition)
  async function handleCompleteShippingTask(toCell?: { id: string; code: string; cell_type: string }) {
    const effectiveToCell = toCell || shippingToCell;
    
    if (!currentTask || !shippingFromCell || shippingUnits.length === 0 || !effectiveToCell) {
      setError("Не все данные заполнены");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      let successCount = 0;
      let failedUnits: string[] = [];
      const movedUnitIds: string[] = [];

      // Перемещаем каждый unit последовательно
      for (const unit of shippingUnits) {
        try {
          const res = await fetch("/api/units/move-by-scan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fromCellCode: shippingFromCell.code,
              toCellCode: effectiveToCell.code,
              unitBarcode: unit.barcode,
            }),
          });

          const rawText = await res.text().catch(() => '');
          let json: any = null;
          try {
            json = rawText ? JSON.parse(rawText) : null;
          } catch {}
          
          if (res.status === 423) {
            // Inventory active
            setInventoryError("⚠️ ИНВЕНТАРИЗАЦИЯ АКТИВНА. ПЕРЕМЕЩЕНИЯ ЗАБЛОКИРОВАНЫ.");
            throw new Error("Инвентаризация активна");
          }

          if (!res.ok) {
            failedUnits.push(`${unit.barcode}: ${json?.error || rawText || "ошибка"}`);
          } else {
            successCount++;
            movedUnitIds.push(unit.id);
          }
        } catch (e: any) {
          if (e.message === "Инвентаризация активна") {
            throw e; // Re-throw inventory errors
          }
          failedUnits.push(`${unit.barcode}: ${e.message}`);
        }
      }

      // Complete/update task
      if (successCount > 0) {
        try {
          const completeRes = await fetch("/api/tsd/shipping-tasks/complete-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              taskId: currentTask.id,
              movedUnitIds,
            }),
          });

          const completeJson = await completeRes.json().catch(() => ({}));
          
          if (completeRes.ok && completeJson.taskCompleted) {
            setSuccess(`✓ Задание завершено! Перемещено ${successCount} заказов из ${shippingFromCell.code} в ${effectiveToCell.code}`);
          } else {
            setSuccess(`✓ Перемещено ${successCount}/${currentTask.unitCount} заказов. ${failedUnits.length > 0 ? `Ошибок: ${failedUnits.length}` : ""}`);
          }
        } catch (e: any) {
          // Task completion failed, but units were moved
          setSuccess(`✓ Перемещено ${successCount} заказов (ошибка обновления задания)`);
        }
      }

      if (failedUnits.length > 0 && successCount === 0) {
        setError(`Ошибка: ${failedUnits.slice(0, 3).join(", ")}${failedUnits.length > 3 ? "..." : ""}`);
      }

      // Сброс состояния после успеха
      setTimeout(() => {
        setShippingFromCell(null);
        setShippingUnits([]);
        setShippingToCell(null);
        if (failedUnits.length === 0) {
          setSuccess(null);
        }
        // Reload tasks
        loadShippingTasks();
      }, 3000);
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

  // Сброс состояния
  function handleReset() {
    if (mode === "receiving") {
      setBinCell(null);
      setLastReceivedUnit(null);
    } else if (mode === "moving") {
      setFromCell(null);
      setUnits([]);
      setToCell(null);
    } else if (mode === "inventory") {
      setCurrentInventoryTask(null);
      setInventoryCell(null);
      setScannedBarcodes([]);
      setScanResult(null);
      loadInventoryTasks(); // Перезагрузить список заданий
    } else if (mode === "shipping") {
      setShippingFromCell(null);
      setShippingUnits([]);
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
            {/* Список заданий (ячеек) - если ячейка НЕ выбрана */}
            {!currentInventoryTask && (
              <div>
                {loadingInventoryTasks ? (
                  <div style={{ padding: 16, textAlign: "center", color: "#666" }}>Загрузка заданий...</div>
                ) : inventoryTasks.length === 0 ? (
                  <div style={{ padding: 16, background: "#f5f5f5", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: "18px", color: "#666" }}>Все ячейки отсканированы</div>
                    <div style={{ fontSize: "14px", color: "#999", marginTop: 4 }}>Инвентаризация завершена</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: 12, color: "#374151" }}>
                      Выберите ячейку ({inventoryTasks.length}):
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
                      {inventoryTasks.map((task) => (
                        <div
                          key={task.id}
                          onClick={() => !busy && handleSelectInventoryTask(task)}
                          style={{
                            padding: 16,
                            background: getCellColor(task.cellType, {}),
                            borderRadius: 8,
                            border: "2px solid #d1d5db",
                            cursor: busy ? "not-allowed" : "pointer",
                            opacity: busy ? 0.6 : 1,
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            if (!busy) e.currentTarget.style.transform = "scale(1.02)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                background: getCellColor(task.cellType, {}),
                                border: "2px solid #9ca3af",
                                borderRadius: 8,
                                flexShrink: 0,
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111" }}>
                                {task.cellCode}
                              </div>
                              <div style={{ fontSize: "14px", color: "#666" }}>{task.cellType}</div>
                            </div>
                            <div style={{ fontSize: "24px" }}>→</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Текущее задание (ячейка) - если выбрано */}
            {currentInventoryTask && inventoryCell && (
              <div
                style={{
                  padding: 16,
                  background: getCellColor(inventoryCell.cell_type, inventoryCell.meta),
                  borderRadius: 8,
                  border: "2px solid #2563eb",
                }}
              >
                <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>Текущая ячейка:</div>
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
              </div>
            )}

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
            ) : shippingTasks.length === 0 ? (
              <div style={{ padding: 16, background: "#f5f5f5", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: "18px", color: "#666" }}>Нет активных задач</div>
                <div style={{ fontSize: "14px", color: "#999", marginTop: 8 }}>Создайте задачу в разделе Ops</div>
              </div>
            ) : !currentTask ? (
              /* Список задач для выбора */
              <div style={{ padding: 16 }}>
                <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: 16 }}>
                  Доступные задачи ({shippingTasks.length})
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {shippingTasks.map((task: any) => (
                    <div
                      key={task.id}
                      style={{
                        padding: 16,
                        background: "#fff",
                        borderRadius: 8,
                        border: "2px solid #e0e0e0",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onClick={() => handleSelectTask(task)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#2196f3";
                        e.currentTarget.style.background = "#f5f5f5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#e0e0e0";
                        e.currentTarget.style.background = "#fff";
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: 4 }}>
                            📦 {task.unitCount || 0} заказов
                          </div>
                          {task.created_by_name && (
                            <div style={{ fontSize: "12px", color: "#666", marginBottom: 4 }}>
                              👤 Создал: {task.created_by_name}
                            </div>
                          )}
                          {task.status === "in_progress" && (
                            <div style={{ 
                              display: "inline-block",
                              padding: "4px 8px",
                              background: "#fff3e0",
                              color: "#e65100",
                              borderRadius: 4,
                              fontSize: "12px",
                              fontWeight: 600,
                              marginTop: 4
                            }}>
                              В РАБОТЕ
                            </div>
                          )}
                        </div>
                        <div style={{
                          padding: "8px 16px",
                          background: "#2196f3",
                          color: "#fff",
                          borderRadius: 6,
                          fontSize: "14px",
                          fontWeight: 600,
                        }}>
                          Выбрать →
                        </div>
                      </div>
                      {task.scenario && (
                        <div style={{ fontSize: "13px", color: "#666", marginBottom: 4 }}>
                          🎯 {task.scenario}
                        </div>
                      )}
                      <div style={{ fontSize: "13px", color: "#666" }}>
                        {task.targetCell && `→ TO: ${task.targetCell.code} (picking)`}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={loadShippingTasks}
                    disabled={loadingTasks}
                    style={{
                      width: "100%",
                      padding: "12px",
                      background: "#fff",
                      border: "2px solid #e0e0e0",
                      borderRadius: 8,
                      fontSize: "16px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {loadingTasks ? "Загрузка..." : "🔄 Обновить список"}
                  </button>
                </div>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: "14px", color: "#666" }}>Текущая задача</div>
                    <button
                      onClick={() => {
                        setCurrentTask(null);
                        setShippingFromCell(null);
                        setShippingUnits([]);
                        setShippingToCell(null);
                        setError(null);
                        setSuccess(null);
                      }}
                      style={{
                        padding: "6px 12px",
                        background: "#fff",
                        border: "1px solid #2196f3",
                        borderRadius: 6,
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        color: "#2196f3",
                      }}
                    >
                      ← Назад к списку
                    </button>
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: 4 }}>
                    📦 Задание: {currentTask.unitCount || 0} заказов
                  </div>
                  {currentTask.created_by_name && (
                    <div style={{ fontSize: "14px", color: "#666", marginTop: 4 }}>👤 Создал: {currentTask.created_by_name}</div>
                  )}
                  {currentTask.scenario && (
                    <div style={{ fontSize: "14px", color: "#666", marginTop: 4 }}>🎯 Сценарий: {currentTask.scenario}</div>
                  )}
                  {currentTask.targetCell && (
                    <div style={{ fontSize: "14px", color: "#666", marginTop: 4 }}>
                      → TO: {currentTask.targetCell.code} (picking)
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

                {/* UNITS (список отсканированных заказов) */}
                <div
                  style={{
                    padding: 16,
                    background: shippingUnits.length > 0 ? "#fff8e1" : "#f5f5f5",
                    borderRadius: 8,
                    border: "2px solid",
                    borderColor: shippingUnits.length > 0 ? "#ffc107" : "#ddd",
                  }}
                >
                  <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>
                    ЗАКАЗЫ (отсканировано: {shippingUnits.length}/{currentTask.unitCount})
                  </div>
                  {shippingUnits.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                      {shippingUnits.map((u, idx) => (
                        <div 
                          key={u.id} 
                          style={{ 
                            fontSize: "16px", 
                            fontWeight: 600, 
                            padding: "8px 12px",
                            background: "#fff",
                            borderRadius: 6,
                            border: "1px solid #ffc107",
                            display: "flex",
                            alignItems: "center",
                            gap: 8
                          }}
                        >
                          <span style={{ 
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: "#ffc107",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 700,
                            flexShrink: 0
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ flex: 1 }}>{u.barcode}</span>
                        </div>
                      ))}
                    </div>
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
                        Отсканируйте <strong>FROM</strong> ячейку (откуда)
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
                        background: shippingUnits.length > 0 ? "#4caf50" : "#e0e0e0",
                        color: shippingUnits.length > 0 ? "#fff" : "#666",
                        fontWeight: 700,
                        fontSize: 12
                      }}>2</span>
                      <span style={{ flex: 1 }}>
                        Отсканируйте <strong>заказы из задания</strong> (от 1 до {currentTask.unitCount})
                      </span>
                      {shippingUnits.length > 0 && <span style={{ color: "#4caf50", fontWeight: 600 }}>✓</span>}
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
                        Отсканируйте <strong>TO</strong> ячейку ({currentTask.targetCell?.code || "picking"})
                      </span>
                      {shippingToCell && <span style={{ color: "#4caf50", fontWeight: 600 }}>✓</span>}
                    </div>
                  </div>
                  <div style={{ marginTop: 12, padding: 8, background: "#e8f5e9", borderRadius: 6, color: "#2e7d32", fontWeight: 600, fontSize: 13 }}>
                    ✓ Задача берется в работу при скане FROM (блокируется для других)
                  </div>
                  <div style={{ marginTop: 8, padding: 8, background: "#e3f2fd", borderRadius: 6, color: "#1565c0", fontWeight: 600, fontSize: 13 }}>
                    ✓ Все заказы переместятся автоматически после сканирования TO
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

            {/* UNITS (список отсканированных заказов) */}
            <div
              style={{
                padding: 16,
                background: units.length > 0 ? "#fff8e1" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: units.length > 0 ? "#ffc107" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>
                ЗАКАЗЫ (отсканировано: {units.length})
              </div>
              {units.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  {units.map((u, idx) => (
                    <div 
                      key={u.id} 
                      style={{ 
                        fontSize: "16px", 
                        fontWeight: 600, 
                        padding: "8px 12px",
                        background: "#fff",
                        borderRadius: 6,
                        border: "1px solid #ffc107",
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <span style={{ 
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#ffc107",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        {idx + 1}
                      </span>
                      <span style={{ flex: 1 }}>{u.barcode}</span>
                    </div>
                  ))}
                </div>
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
              {!currentInventoryTask && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadInventoryTasks}
                  disabled={loadingInventoryTasks || busy}
                  fullWidth
                >
                  Обновить список заданий
                </Button>
              )}
            </>
          )}
          <Button variant="secondary" size="lg" onClick={handleReset} disabled={busy} fullWidth>
            Сброс
          </Button>
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
              <li>Отсканируйте FROM ячейку (откуда): BIN, STORAGE или SHIPPING</li>
              <li>Отсканируйте заказы один за другим (от 1 до бесконечности)</li>
              <li>Отсканируйте TO ячейку (куда) - все заказы переместятся автоматически</li>
              <li style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                📌 Разрешено: BIN→STORAGE/SHIPPING, STORAGE↔SHIPPING/STORAGE, SHIPPING↔STORAGE/SHIPPING
              </li>
            </ol>
          ) : mode === "inventory" ? (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Выберите ячейку</strong> из списка заданий (нажмите на неё)</li>
              <li>Отсканируйте штрихкоды всех заказов в этой ячейке</li>
              <li>Нажмите <strong>"Сохранить ячейку"</strong> - результаты отправятся на сервер</li>
              <li>Проверьте результат: ОК или расхождение (недостача/излишки)</li>
              <li>Нажмите <strong>"Сбросить"</strong> и выберите следующую ячейку</li>
            </ol>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Выберите задание из списка (нажмите на него)</li>
              <li>Отсканируйте FROM ячейку (откуда)</li>
              <li>Отсканируйте заказы один за другим</li>
              <li>Отсканируйте TO ячейку (picking) - заказы переместятся автоматически</li>
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
