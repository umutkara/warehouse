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
  from_cell_id?: string;
  cell?: {
    id: string;
    code: string;
    cell_type: string;
  };
  from_cell?: {
    id: string;
    code: string;
    cell_type: string;
  };
};

type Mode = "receiving" | "moving" | "inventory" | "shipping" | "shipping_new" | "shipping_fcutc" | "surplus";

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
  const [shippingSteps, setShippingSteps] = useState<any[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedFromCellStep, setSelectedFromCellStep] = useState<any | null>(null); // Выбранная ячейка для сбора
  
  // Для режима Отгрузка (НОВАЯ) - с группировкой по picking ячейкам
  const [shippingNewTasks, setShippingNewTasks] = useState<any[]>([]);
  const [shippingNewCells, setShippingNewCells] = useState<Map<string, { code: string; description?: string; meta?: any }>>(new Map());
  const [shippingNewGrouped, setShippingNewGrouped] = useState<Map<string, any[]>>(new Map());
  const [currentTaskNew, setCurrentTaskNew] = useState<any | null>(null); // Объединенная задача для picking ячейки
  const [loadingTasksNew, setLoadingTasksNew] = useState(false);
  
  // Состояния для работы с объединенной задачей
  const [shippingNewFromCells, setShippingNewFromCells] = useState<Array<{ id: string; code: string; cell_type: string; units: any[] }>>([]);
  const [shippingNewSelectedFromCell, setShippingNewSelectedFromCell] = useState<{ id: string; code: string; cell_type: string; units: any[] } | null>(null);
  const [shippingNewScannedUnits, setShippingNewScannedUnits] = useState<UnitInfo[]>([]); // Отсканированные заказы из текущей from-ячейки
  const [shippingNewToCell, setShippingNewToCell] = useState<CellInfo | null>(null); // TO ячейка (picking)
  const [shippingNewAllUnits, setShippingNewAllUnits] = useState<UnitInfo[]>([]); // Все заказы из всех задач
  
  // Для режима Отгрузка (FCUTC) - последовательное сканирование
  const [fcutcFromCell, setFcutcFromCell] = useState<CellInfo | null>(null);
  const [fcutcUnit, setFcutcUnit] = useState<UnitInfo | null>(null);
  const [fcutcTaskInfo, setFcutcTaskInfo] = useState<{
    taskId: string;
    toCell: { id: string; code: string; cell_type: string; description?: string };
  } | null>(null);
  const [fcutcToCell, setFcutcToCell] = useState<CellInfo | null>(null);
  
  // Для режима Излишки (Surplus)
  const [surplusCell, setSurplusCell] = useState<CellInfo | null>(null);
  const [surplusUnits, setSurplusUnits] = useState<UnitInfo[]>([]);
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
  }, [binCell, fromCell, units, toCell, error, success, mode, inventoryCell, scannedBarcodes, shippingFromCell, shippingUnits, shippingToCell, selectedFromCellStep, busy, fcutcFromCell, fcutcUnit, fcutcTaskInfo, fcutcToCell]);
  
  // Load shipping tasks when mode is shipping
  useEffect(() => {
    if (mode === "shipping") {
      loadShippingTasks();
    }
  }, [mode]);
  
  // Load shipping tasks (NEW) when mode is shipping_new
  useEffect(() => {
    if (mode === "shipping_new") {
      loadShippingNewTasks();
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
    setSelectedFromCellStep(null); // Сброс выбранной ячейки
    setError(null);
    setSuccess(null);
    
    // Группировка units по from_cell_id
    const unitsByFromCell = new Map<string, any[]>();
    (task.units || []).forEach((unit: any) => {
      const fromCellId = unit.from_cell_id || unit.cell_id;
      if (!fromCellId) return;
      
      if (!unitsByFromCell.has(fromCellId)) {
        unitsByFromCell.set(fromCellId, []);
      }
      unitsByFromCell.get(fromCellId)!.push(unit);
    });
    
    // Создание массива шагов
    const steps: any[] = [];
    
    // Шаги для каждой from-ячейки
    unitsByFromCell.forEach((units, fromCellId) => {
      const fromCell = units[0]?.from_cell; // Информация о ячейке из первого unit
      steps.push({
        type: 'from_cell',
        fromCellId,
        fromCell,
        units,
        scannedUnits: [],
        completed: false, // Статус завершения ячейки
        stepIndex: steps.length, // Добавляем stepIndex для удобства доступа
      });
    });
    
    // Финальный шаг - TO ячейка (picking)
    steps.push({
      type: 'to_cell',
      targetCell: task.targetCell,
    });
    
    setShippingSteps(steps);
    setCurrentStepIndex(0); // Не используется в новой логике, но оставим для совместимости
  }
  
  // Выбор объединенной задачи в новом режиме (по picking ячейке)
  async function handleSelectTaskNew(targetCellId: string, tasks: any[]) {
    setError(null);
    setSuccess(null);
    setBusy(true);
    
    try {
      // Объединяем все задачи для одной picking ячейки
      // Собираем все заказы из всех задач
      const allUnits: UnitInfo[] = [];
      const fromCellsMap = new Map<string, { id: string; code: string; cell_type: string; units: any[] }>();
      
      tasks.forEach((task: any) => {
        // Берем задачу в работу (если еще не взята)
        if (task.status === "open") {
          // Будем брать в работу при первом сканировании
        }
        
        // Собираем все units из задачи
        (task.units || []).forEach((unit: any) => {
          const fromCellId = unit.from_cell_id || unit.cell_id;
          if (!fromCellId) return;
          
          // Добавляем unit в общий список
          allUnits.push({
            id: unit.id,
            barcode: unit.barcode,
            cell_id: unit.cell_id,
            from_cell_id: unit.from_cell_id,
            cell: unit.cell,
            from_cell: unit.from_cell,
          });
          
          // Группируем по from-ячейкам
          if (!fromCellsMap.has(fromCellId)) {
            const fromCell = unit.from_cell || unit.cell;
            fromCellsMap.set(fromCellId, {
              id: fromCellId,
              code: fromCell?.code || "?",
              cell_type: fromCell?.cell_type || "?",
              units: [],
            });
          }
          fromCellsMap.get(fromCellId)!.units.push(unit);
        });
      });
      
      // Получаем информацию о TO ячейке (picking)
      const targetCellInfo = shippingNewCells.get(targetCellId);
      if (!targetCellInfo) {
        setError("Информация о picking ячейке не найдена");
        return;
      }
      
      // Создаем объединенную задачу
      const mergedTask = {
        targetCellId,
        targetCell: {
          id: targetCellId,
          code: targetCellInfo.code,
          cell_type: "picking",
        },
        tasks, // Все исходные задачи
        allUnits,
        fromCells: Array.from(fromCellsMap.values()),
        totalUnitCount: allUnits.length,
      };
      
      setCurrentTaskNew(mergedTask);
      setShippingNewAllUnits(allUnits);
      setShippingNewFromCells(Array.from(fromCellsMap.values()));
      setShippingNewSelectedFromCell(null);
      setShippingNewScannedUnits([]);
      setShippingNewToCell(null);
      
      setSuccess(`✓ Выбрана задача: ${targetCellInfo.code}${targetCellInfo.description ? ` (${targetCellInfo.description})` : ""} - ${tasks.length} ${tasks.length === 1 ? "задача" : "задач"}, ${allUnits.length} ${allUnits.length === 1 ? "заказ" : "заказов"}`);
    } catch (e: any) {
      setError(e.message || "Ошибка выбора задачи");
    } finally {
      setBusy(false);
    }
  }
  
  // Выбор from-ячейки для сбора заказов
  function handleSelectFromCellNew(fromCell: { id: string; code: string; cell_type: string; units: any[] }) {
    setError(null);
    setSuccess(null);
    
    // Берем первую задачу в работу при первом выборе from-ячейки
    if (currentTaskNew && currentTaskNew.tasks && currentTaskNew.tasks.length > 0) {
      const firstOpenTask = currentTaskNew.tasks.find((t: any) => t.status === "open");
      if (firstOpenTask) {
        // Берем задачу в работу асинхронно (не блокируем UI)
        fetch("/api/tsd/shipping-tasks/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: firstOpenTask.id }),
        }).catch(() => {});
      }
    }
    
    setShippingNewSelectedFromCell(fromCell);
    // НЕ сбрасываем shippingNewScannedUnits - сохраняем все отсканированные заказы
    setSuccess(`✓ Выбрана ячейка: ${fromCell.code}. Отсканируйте ${fromCell.units.length} ${fromCell.units.length === 1 ? "заказ" : "заказов"}`);
  }
  
  // Обработка сканирования в новом режиме
  async function handleShippingNewScan(scanValue: string) {
    if (!currentTaskNew) {
      setError("Сначала выберите задачу из списка");
      setScanValue("");
      return;
    }
    
    setError(null);
    setSuccess(null);
    setBusy(true);
    
    try {
      const parsed = parseScan(scanValue);
      if (!parsed) {
        setError("Некорректный скан");
        setScanValue("");
        return;
      }
      
      // Если сканируется ячейка - это TO ячейка (только если все from-ячейки завершены)
      if (parsed.type === "cell") {
        const cellCode = parsed.code;
        // Проверяем, что все from-ячейки завершены
        const allFromCellsCompleted = shippingNewFromCells.every((fc) => {
          const scannedCount = shippingNewScannedUnits.filter(
            (u) => u.from_cell_id === fc.id || (u.cell_id === fc.id && !u.from_cell_id)
          ).length;
          return scannedCount >= fc.units.length;
        });
        
        if (cellCode.toUpperCase() === currentTaskNew.targetCell.code.toUpperCase()) {
          if (!allFromCellsCompleted) {
            setError("Сначала завершите сбор из всех from-ячеек");
            setScanValue("");
            return;
          }
          
          // Сканирование TO ячейки - завершение задачи
          await handleCompleteShippingNewTask(cellCode);
          setScanValue("");
          return;
        } else {
          setError(`Ожидается ячейка ${currentTaskNew.targetCell.code}, отсканирована ${cellCode}`);
          setScanValue("");
          return;
        }
      }
      
      // Сканирование заказа - проверяем, что from-ячейка выбрана
      if (!shippingNewSelectedFromCell) {
        setError("Сначала выберите from-ячейку для сбора");
        setScanValue("");
        return;
      }
      
      const barcode = parsed.code;
      
      // Проверяем, что заказ из выбранной from-ячейки
      const unit = shippingNewSelectedFromCell.units.find((u: any) => u.barcode === barcode);
      if (!unit) {
        setError(`Заказ ${barcode} не найден в ячейке ${shippingNewSelectedFromCell.code}`);
        setScanValue("");
        return;
      }
      
      // Проверяем, не отсканирован ли уже
      if (shippingNewScannedUnits.some((u) => u.barcode === barcode)) {
        setError(`Заказ ${barcode} уже отсканирован`);
        setScanValue("");
        return;
      }
      
      // Добавляем в отсканированные
      const unitInfo: UnitInfo = {
        id: unit.id,
        barcode: unit.barcode,
        cell_id: unit.cell_id,
        from_cell_id: unit.from_cell_id,
        cell: unit.cell,
        from_cell: unit.from_cell,
      };
      
      const updatedScanned = [...shippingNewScannedUnits, unitInfo];
      setShippingNewScannedUnits(updatedScanned);
      
      // Проверяем, завершена ли текущая from-ячейка
      const scannedInThisCell = updatedScanned.filter(
        (u) => u.from_cell_id === shippingNewSelectedFromCell.id || (u.cell_id === shippingNewSelectedFromCell.id && !u.from_cell_id)
      ).length;
      
      if (scannedInThisCell >= shippingNewSelectedFromCell.units.length) {
        setSuccess(`✅ Ячейка ${shippingNewSelectedFromCell.code} завершена! (${scannedInThisCell}/${shippingNewSelectedFromCell.units.length})`);
        // Автоматически сбрасываем выбор from-ячейки для выбора следующей
        setTimeout(() => {
          setShippingNewSelectedFromCell(null);
        }, 2000);
      } else {
        setSuccess(`✓ ${barcode} (${scannedInThisCell}/${shippingNewSelectedFromCell.units.length} из ${shippingNewSelectedFromCell.code})`);
      }
      
      setScanValue("");
    } catch (e: any) {
      setError(e.message || "Ошибка обработки скана");
      setScanValue("");
    } finally {
      setBusy(false);
    }
  }
  
  // Завершение задачи (после сканирования TO ячейки)
  async function handleCompleteShippingNewTask(toCellCode: string) {
    if (!currentTaskNew) {
      setError("Нет активной задачи");
      return;
    }
    
    // Проверяем, что все заказы отсканированы
    if (shippingNewScannedUnits.length < shippingNewAllUnits.length) {
      setError(`Отсканировано ${shippingNewScannedUnits.length} из ${shippingNewAllUnits.length} заказов`);
      return;
    }
    
    setBusy(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Получаем информацию о TO ячейке
      const toCellInfo = await loadCellInfo(toCellCode);
      if (!toCellInfo || toCellInfo.cell_type !== "picking") {
        setError(`Ячейка ${toCellCode} не является picking ячейкой`);
        return;
      }
      
      // Перемещаем все отсканированные заказы в TO ячейку
      const movedUnitIds = shippingNewScannedUnits.map((u) => u.id);
      
      // Завершаем каждую задачу отдельно
      const taskResults = [];
      for (const task of currentTaskNew.tasks) {
        // Получаем заказы, которые относятся к этой задаче
        const taskUnitIds = (task.units || []).map((u: any) => u.id);
        const movedInThisTask = movedUnitIds.filter((id) => taskUnitIds.includes(id));
        
        if (movedInThisTask.length === 0) continue;
        
        // Перемещаем заказы в TO ячейку
        for (const unitId of movedInThisTask) {
          const moveRes = await fetch("/api/units/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unitId,
              toCellId: toCellInfo.id,
            }),
          });
          
          if (!moveRes.ok) {
            const json = await moveRes.json().catch(() => ({}));
            throw new Error(json.error || `Ошибка перемещения заказа ${unitId}`);
          }
        }
        
        // Завершаем задачу
        const completeRes = await fetch("/api/tsd/shipping-tasks/complete-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: task.id,
            movedUnitIds: movedInThisTask,
          }),
        });
        
        if (!completeRes.ok) {
          const json = await completeRes.json().catch(() => ({}));
          throw new Error(json.error || `Ошибка завершения задачи ${task.id}`);
        }
        
        taskResults.push({ taskId: task.id, movedCount: movedInThisTask.length });
      }
      
      setSuccess(`✅ Задача завершена! ${shippingNewScannedUnits.length} заказов перемещено в ${toCellCode}`);
      
      // Сброс состояния
      setTimeout(() => {
        setCurrentTaskNew(null);
        setShippingNewFromCells([]);
        setShippingNewSelectedFromCell(null);
        setShippingNewScannedUnits([]);
        setShippingNewToCell(null);
        setShippingNewAllUnits([]);
        loadShippingNewTasks(); // Обновить список задач
      }, 2000);
    } catch (e: any) {
      setError(e.message || "Ошибка завершения задачи");
    } finally {
      setBusy(false);
    }
  }

  // Выбор ячейки для сбора (по аналогии с инвентаризацией)
  async function handleSelectFromCell(step: any, stepIndex: number) {
    setError(null);
    setSuccess(null);
    
    // Берём задачу в работу при первом выборе ячейки
    if (!selectedFromCellStep && shippingUnits.length === 0) {
      try {
        const startRes = await fetch("/api/tsd/shipping-tasks/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: currentTask.id }),
        });

        if (!startRes.ok) {
          const startJson = await startRes.json().catch(() => ({}));
          setError(startJson.error || "Не удалось взять задачу в работу");
          return;
        }
      } catch (e: any) {
        setError(`Ошибка: ${e.message}`);
        return;
      }
    }
    
    setSelectedFromCellStep({ ...step, stepIndex });
    setCurrentStepIndex(stepIndex);
    setSuccess(`✓ Выбрана ячейка: ${step.fromCell?.code}. Отсканируйте ${step.units.length} заказов.`);
    setTimeout(() => setSuccess(null), 2000);
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
  
  // Загрузка задач для нового режима с группировкой по picking ячейкам
  async function loadShippingNewTasks() {
    setLoadingTasksNew(true);
    try {
      // Загружаем задачи
      const tasksRes = await fetch("/api/tsd/shipping-tasks/list", { cache: "no-store" });
      const tasksJson = await tasksRes.json();
      
      if (!tasksRes.ok) {
        setError("Ошибка загрузки задач");
        return;
      }
      
      const tasks = tasksJson.tasks || [];
      setShippingNewTasks(tasks);
      
      // Загружаем ячейки с описаниями
      const cellsRes = await fetch("/api/cells/list", { cache: "no-store" });
      const cellsJson = await cellsRes.json();
      
      if (cellsRes.ok) {
        const cells = cellsJson.cells || [];
        const cellsMap = new Map<string, { code: string; description?: string; meta?: any }>();
        
        cells.forEach((cell: any) => {
          if (cell.cell_type === "picking") {
            cellsMap.set(cell.id, {
              code: cell.code,
              description: cell.meta?.description,
              meta: cell.meta,
            });
          }
        });
        
        setShippingNewCells(cellsMap);
      }
      
      // Группируем задачи по targetCell.id
      const grouped = new Map<string, any[]>();
      
      tasks.forEach((task: any) => {
        if (task.targetCell?.id) {
          const cellId = task.targetCell.id;
          if (!grouped.has(cellId)) {
            grouped.set(cellId, []);
          }
          grouped.get(cellId)!.push(task);
        }
      });
      
      setShippingNewGrouped(grouped);
    } catch (e) {
      console.error("Failed to load shipping tasks (new):", e);
      setError("Ошибка загрузки задач");
    } finally {
      setLoadingTasksNew(false);
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
      } else if (mode === "shipping_new") {
        handleShippingNewScan(scanValue);
      } else if (mode === "shipping_fcutc") {
        handleFcutcScan();
      } else if (mode === "surplus") {
        handleSurplusScan();
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

  // Обработка сканирования для режима Shipping (логика с ручным выбором ячейки)
  async function handleShippingScan() {
    if (!scanValue.trim()) return;

    // Проверка наличия активной задачи
    if (!currentTask || shippingSteps.length === 0) {
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
      // Проверяем завершены ли все from-ячейки
      const allFromCellsCompleted = shippingSteps
        .filter((s: any) => s.type === 'from_cell')
        .every((s: any) => s.completed);
      
      if (allFromCellsCompleted) {
        // Все ячейки собраны - финальный шаг (TO ячейка)
        if (parsed.type === "cell") {
          const cellInfo = await loadCellInfo(parsed.code);
          if (!cellInfo) {
            setError(`Ячейка "${parsed.code}" не найдена`);
            setScanValue("");
            setBusy(false);
            return;
          }
          
          // Проверка что это целевая picking-ячейка
          if (!currentTask.targetCell || cellInfo.id !== currentTask.targetCell.id) {
            setError(`TO ячейка должна быть ${currentTask.targetCell?.code || 'picking из задания'}`);
            setScanValue("");
            setBusy(false);
            return;
          }
          
          if (cellInfo.cell_type !== "picking") {
            setError(`TO ячейка должна быть picking, а не ${cellInfo.cell_type}`);
            setScanValue("");
            setBusy(false);
            return;
          }
          
          setShippingToCell(cellInfo);
          setSuccess(`✓ Picking: ${cellInfo.code}. Перемещение всех заказов...`);
          
          // Выполняем массовое перемещение всех собранных заказов
          handleCompleteShippingTaskStepBased(cellInfo);
        } else {
          setError("Отсканируйте TO ячейку (picking). Все заказы собраны, осталось переместить их в picking.");
          setScanValue("");
          setBusy(false);
          return;
        }
      } else {
        // Сбор заказов из выбранной from-ячейки
        if (!selectedFromCellStep) {
          setError("Сначала выберите ячейку из списка");
          setScanValue("");
          setBusy(false);
          return;
        }
        
        if (parsed.type === "unit") {
          const barcode = parsed.code;
          
          // Проверка что unit принадлежит выбранной ячейке
          const unitInStep = selectedFromCellStep.units.find((u: any) => u.barcode === barcode);
          if (!unitInStep) {
            setError(`Заказ ${barcode} не из ячейки ${selectedFromCellStep.fromCell?.code}. Отсканируйте заказ только из этой ячейки.`);
            setScanValue("");
            setBusy(false);
            return;
          }
          
          // Проверка что unit не был уже отсканирован
          if (selectedFromCellStep.scannedUnits.some((u: any) => u.barcode === barcode)) {
            setError(`Заказ ${barcode} уже отсканирован`);
            setScanValue("");
            setBusy(false);
            return;
          }
          
          // Добавляем unit в отсканированные для текущей ячейки
          const updatedSteps = [...shippingSteps];
          const stepIdx = selectedFromCellStep.stepIndex;
          
          if (!updatedSteps[stepIdx]) {
            setError(`Ошибка: шаг ${stepIdx} не найден в списке. Попробуйте выбрать ячейку заново.`);
            setScanValue("");
            setBusy(false);
            return;
          }
          
          if (!updatedSteps[stepIdx].scannedUnits) {
            updatedSteps[stepIdx].scannedUnits = [];
          }
          
          updatedSteps[stepIdx] = {
            ...updatedSteps[stepIdx],
            scannedUnits: [...updatedSteps[stepIdx].scannedUnits, unitInStep],
            stepIndex: stepIdx, // Сохраняем stepIndex при обновлении
          };
          
          // Также добавляем в общий список shippingUnits
          setShippingUnits([...shippingUnits, unitInStep]);
          
          const scannedCount = updatedSteps[stepIdx].scannedUnits.length;
          const totalInCell = updatedSteps[stepIdx].units.length;
          
          // Если все заказы из ячейки собраны - помечаем ячейку завершённой
          if (scannedCount === totalInCell) {
            const completedCellCode = selectedFromCellStep.fromCell?.code; // Сохраняем до сброса
            updatedSteps[stepIdx].completed = true;
            setShippingSteps(updatedSteps);
            setSelectedFromCellStep(null); // Сброс выбранной ячейки
            setSuccess(`✅ Ячейка ${completedCellCode} завершена! (${scannedCount}/${totalInCell})`);
          } else {
            const updatedStep = { ...updatedSteps[stepIdx], stepIndex: stepIdx };
            setShippingSteps(updatedSteps);
            // Сохраняем stepIndex при обновлении selectedFromCellStep
            setSelectedFromCellStep(updatedStep);
            setSuccess(`✓ ${barcode} (${scannedCount}/${totalInCell} из ${updatedStep.fromCell?.code})`);
          }
        } else {
          setError("Отсканируйте заказ (не ячейку). Выберите ячейку из списка, затем сканируйте заказы.");
          setScanValue("");
          setBusy(false);
          return;
        }
      }
    } catch (e: any) {
      setError(e.message || "Ошибка обработки скана");
    } finally {
      setBusy(false);
      setScanValue("");
    }
  }

  // НОВАЯ функция для пошагового перемещения (из разных from-ячеек в одну TO)
  async function handleCompleteShippingTaskStepBased(toCell: { id: string; code: string; cell_type: string }) {
    if (!currentTask || shippingUnits.length === 0) {
      setError("Нет данных для перемещения");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      let successCount = 0;
      let failedUnits: string[] = [];
      const movedUnitIds: string[] = [];

      // Перемещаем каждый unit из его from-ячейки в TO ячейку
      for (const unit of shippingUnits) {
        try {
          // Определяем from-ячейку для каждого unit
          // Используем from_cell из структуры данных API (не cell, так как unit может уже быть перемещен)
          const fromCellCode = unit.from_cell?.code || unit.cell?.code;
          if (!fromCellCode) {
            failedUnits.push(`${unit.barcode}: нет исходной ячейки`);
            continue;
          }

          const res = await fetch("/api/units/move-by-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fromCellCode,
              toCellCode: toCell.code,
              unitBarcode: unit.barcode,
            }),
          });

          const rawText = await res.text().catch(() => '');
          let json: any = null;
          try {
            json = rawText ? JSON.parse(rawText) : null;
          } catch {}
          
          if (res.status === 423) {
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
            throw e;
          }
          failedUnits.push(`${unit.barcode}: ${e.message}`);
        }
      }

      // Обновляем задачу
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
            setSuccess(`✅ Задание завершено! Перемещено ${successCount} заказов в ${toCell.code}`);
          } else {
            setSuccess(`✓ Перемещено ${successCount}/${currentTask.unitCount} заказов. ${failedUnits.length > 0 ? `Ошибок: ${failedUnits.length}` : ""}`);
          }
        } catch (e: any) {
          setSuccess(`✓ Перемещено ${successCount} заказов (ошибка обновления задания)`);
        }
      }

      if (failedUnits.length > 0 && successCount === 0) {
        setError(`Ошибка: ${failedUnits.slice(0, 3).join(", ")}${failedUnits.length > 3 ? "..." : ""}`);
      }

      // Сброс после успеха
      setTimeout(() => {
        setShippingFromCell(null);
        setShippingUnits([]);
        setShippingToCell(null);
        setShippingSteps([]);
        setCurrentStepIndex(0);
        setCurrentTask(null);
        if (failedUnits.length === 0) {
          setSuccess(null);
        }
        loadShippingTasks();
      }, 3000);
    } catch (e: any) {
      setError(e.message || "Ошибка перемещения");
      if (inventoryError) {
        setTimeout(() => setInventoryError(null), 5000);
      }
    } finally {
      setBusy(false);
    }
  }

  // Выполнение задачи shipping (массовое перемещение) - СТАРАЯ ВЕРСИЯ (не используется в новой логике)
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
  // ============================================
  // РЕЖИМ ИЗЛИШКИ (SURPLUS)
  // ============================================
  async function handleSurplusScan() {
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
        // Сканируем ячейку surplus
        const cellInfo = await loadCellInfo(parsed.code);
        if (!cellInfo) {
          setError(`Ячейка "${parsed.code}" не найдена`);
          setScanValue("");
          return;
        }

        // Проверка: ячейка ДОЛЖНА быть типа surplus
        if (cellInfo.cell_type !== "surplus") {
          setError(`Ячейка должна быть типа SURPLUS, а не ${cellInfo.cell_type.toUpperCase()}`);
          setScanValue("");
          return;
        }

        setSurplusCell(cellInfo);
        setSuccess(`✓ Ячейка излишков: ${cellInfo.code}`);
      } else {
        // Сканируем unit barcode
        if (!surplusCell) {
          setError("Сначала отсканируйте ячейку SURPLUS");
          setScanValue("");
          return;
        }

        // Проверяем, не отсканирован ли уже этот заказ
        if (surplusUnits.some(u => u.barcode === parsed.code)) {
          setError(`Заказ ${parsed.code} уже отсканирован (дубликат)`);
          setScanValue("");
          return;
        }

        // Пытаемся загрузить unit (может не существовать - это нормально для излишков)
        const unitInfo = await loadUnitInfo(parsed.code);
        
        if (unitInfo) {
          // Unit существует - проверяем что он НЕ размещен где-то на складе
          if (unitInfo.cell_id && unitInfo.cell) {
            setError(`❌ Заказ ${parsed.code} уже размещен в ячейке ${unitInfo.cell.code} (${unitInfo.cell.cell_type.toUpperCase()})`);
            setScanValue("");
            return;
          }
          // Unit существует но не размещен - добавляем
          setSurplusUnits([...surplusUnits, unitInfo]);
          setSuccess(`✓ Добавлен: ${unitInfo.barcode} (всего: ${surplusUnits.length + 1})`);
        } else {
          // Unit НЕ существует - это нормально для излишков (товары без ТТНК)
          // Создаем временный объект, unit будет создан при подтверждении
          const newUnitInfo: UnitInfo = {
            id: '', // будет создан при подтверждении
            barcode: parsed.code,
          };
          setSurplusUnits([...surplusUnits, newUnitInfo]);
          setSuccess(`✓ Новый излишек: ${parsed.code} (всего: ${surplusUnits.length + 1})`);
        }
      }
    } catch (e: any) {
      setError(e.message || "Ошибка обработки скана");
    } finally {
      setBusy(false);
      setScanValue("");
    }
  }

  // Подтверждение приемки излишков (массовое размещение в surplus ячейку)
  async function handleConfirmSurplus() {
    if (!surplusCell || surplusUnits.length === 0) {
      setError("Нет данных для подтверждения");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      let successCount = 0;
      let failedUnits: string[] = [];

      // Принимаем каждый unit в surplus ячейку (создаем если не существует)
      for (const unit of surplusUnits) {
        try {
          const res = await fetch("/api/surplus/receive", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              unitBarcode: unit.barcode,
              cellCode: surplusCell.code,
            }),
          });

          const json = await res.json().catch(() => ({}));

          if (res.status === 423) {
            setInventoryError("⚠️ ИНВЕНТАРИЗАЦИЯ АКТИВНА. ПЕРЕМЕЩЕНИЯ ЗАБЛОКИРОВАНЫ.");
            throw new Error("Инвентаризация активна");
          }

          if (!res.ok) {
            failedUnits.push(`${unit.barcode}: ${json?.error || "ошибка"}`);
          } else {
            successCount++;
          }
        } catch (e: any) {
          if (e.message === "Инвентаризация активна") {
            throw e;
          }
          failedUnits.push(`${unit.barcode}: ${e.message}`);
        }
      }

      if (successCount > 0) {
        setSuccess(`✓ Принято ${successCount} излишков в ячейку ${surplusCell.code}${failedUnits.length > 0 ? ` (ошибок: ${failedUnits.length})` : ""}`);
      }

      if (failedUnits.length > 0 && successCount === 0) {
        setError(`Ошибка: ${failedUnits.slice(0, 3).join(", ")}${failedUnits.length > 3 ? "..." : ""}`);
      }

      // Сброс состояния после успеха
      if (successCount > 0) {
        setTimeout(() => {
          setSurplusCell(null);
          setSurplusUnits([]);
          if (failedUnits.length === 0) {
            setSuccess(null);
          }
        }, 3000);
      }
    } catch (e: any) {
      setError(e.message || "Ошибка приемки излишков");
      if (inventoryError) {
        setTimeout(() => setInventoryError(null), 5000);
      }
    } finally {
      setBusy(false);
    }
  }

  // ============================================
  // РЕЖИМ ОТГРУЗКА (FCUTC) - последовательное сканирование
  // ============================================
  async function handleFcutcScan() {
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
      // Шаг 1: Сканирование FROM cell
      if (!fcutcFromCell) {
        if (parsed.type !== "cell") {
          setError("Сначала отсканируйте FROM ячейку");
          setScanValue("");
          return;
        }

        const cellInfo = await loadCellInfo(parsed.code);
        if (!cellInfo) {
          setError(`Ячейка "${parsed.code}" не найдена`);
          setScanValue("");
          return;
        }

        setFcutcFromCell(cellInfo);
        setSuccess(`✓ FROM: ${cellInfo.code}`);
        setScanValue("");
        return;
      }

      // Шаг 2: Сканирование UNIT (если FROM уже есть, но UNIT еще нет)
      if (!fcutcUnit) {
        if (parsed.type !== "unit") {
          setError("Отсканируйте заказ (штрихкод)");
          setScanValue("");
          return;
        }

        const barcode = parsed.code;
        const unitInfo = await loadUnitInfo(barcode);
        if (!unitInfo) {
          setError(`Заказ "${barcode}" не найден в системе`);
          setScanValue("");
          return;
        }

        // Проверяем, что заказ находится в FROM ячейке
        if (!unitInfo.cell || unitInfo.cell.id !== fcutcFromCell.id) {
          setError(`Заказ ${barcode} не находится в ячейке ${fcutcFromCell.code}`);
          setScanValue("");
          return;
        }

        // Проверяем, есть ли заказ в задачах для этой FROM ячейки
        const checkRes = await fetch(
          `/api/tsd/shipping-tasks/check-unit?unitBarcode=${encodeURIComponent(barcode)}&fromCellId=${encodeURIComponent(fcutcFromCell.id)}`,
          { cache: "no-store" }
        );

        const checkJson = await checkRes.json();

        if (!checkRes.ok || !checkJson.found) {
          setError(checkJson.error || `Заказ ${barcode} не найден в задачах для ячейки ${fcutcFromCell.code}`);
          setScanValue("");
          return;
        }

        // Заказ найден в задаче - сохраняем информацию
        setFcutcUnit(unitInfo);
        setFcutcTaskInfo({
          taskId: checkJson.task.id,
          toCell: checkJson.toCell,
        });
        setSuccess(`✓ Заказ ${barcode} найден в задаче. TO ячейка: ${checkJson.toCell.code}${checkJson.toCell.description ? ` (${checkJson.toCell.description})` : ""}`);
        setScanValue("");
        return;
      }

      // Шаг 3: Сканирование TO cell (если FROM и UNIT уже есть)
      if (!fcutcTaskInfo) {
        setError("Ошибка: информация о задаче не найдена. Начните заново.");
        setScanValue("");
        return;
      }

      if (parsed.type !== "cell") {
        setError("Отсканируйте TO ячейку");
        setScanValue("");
        return;
      }

      const toCellInfo = await loadCellInfo(parsed.code);
      if (!toCellInfo) {
        setError(`Ячейка "${parsed.code}" не найдена`);
        setScanValue("");
        return;
      }

      // Валидация: TO ячейка должна совпадать с ожидаемой из задачи
      if (toCellInfo.id !== fcutcTaskInfo.toCell.id) {
        setError(`Ожидается ячейка ${fcutcTaskInfo.toCell.code}, отсканирована ${parsed.code}`);
        setScanValue("");
        return;
      }

      if (toCellInfo.cell_type !== "picking") {
        setError(`TO ячейка должна быть picking, а не ${toCellInfo.cell_type}`);
        setScanValue("");
        return;
      }

      setFcutcToCell(toCellInfo);

      // Выполняем перемещение
      await handleFcutcMove();
    } catch (e: any) {
      setError(e.message || "Ошибка обработки скана");
      setScanValue("");
    } finally {
      setBusy(false);
    }
  }

  // Перемещение заказа и обновление задачи
  async function handleFcutcMove() {
    if (!fcutcFromCell || !fcutcUnit || !fcutcToCell || !fcutcTaskInfo) {
      setError("Не все данные заполнены");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      // Перемещаем заказ
      const moveRes = await fetch("/api/units/move-by-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromCellCode: fcutcFromCell.code,
          toCellCode: fcutcToCell.code,
          unitBarcode: fcutcUnit.barcode,
        }),
      });

      const rawText = await moveRes.text().catch(() => "");
      let moveJson: any = null;
      try {
        moveJson = rawText ? JSON.parse(rawText) : null;
      } catch {}

      if (moveRes.status === 423) {
        setInventoryError("⚠️ ИНВЕНТАРИЗАЦИЯ АКТИВНА. ПЕРЕМЕЩЕНИЯ ЗАБЛОКИРОВАНЫ.");
        throw new Error("Инвентаризация активна");
      }

      if (!moveRes.ok) {
        throw new Error(moveJson?.error || rawText || "Ошибка перемещения");
      }

      // Обновляем задачу - завершаем заказ в задаче
      const completeRes = await fetch("/api/tsd/shipping-tasks/complete-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: fcutcTaskInfo.taskId,
          movedUnitIds: [fcutcUnit.id],
        }),
      });

      const completeJson = await completeRes.json().catch(() => ({}));

      if (completeRes.ok && completeJson.taskCompleted) {
        setSuccess(`✅ Заказ ${fcutcUnit.barcode} перемещен в ${fcutcToCell.code}. Задача завершена!`);
      } else {
        setSuccess(`✓ Заказ ${fcutcUnit.barcode} перемещен в ${fcutcToCell.code}`);
      }

      // Сброс состояния после успеха
      setTimeout(() => {
        setFcutcFromCell(null);
        setFcutcUnit(null);
        setFcutcTaskInfo(null);
        setFcutcToCell(null);
        if (!completeJson.taskCompleted) {
          setSuccess(null);
        }
      }, 3000);
    } catch (e: any) {
      setError(e.message || "Ошибка перемещения");
      if (inventoryError) {
        setTimeout(() => setInventoryError(null), 5000);
      }
    } finally {
      setBusy(false);
    }
  }

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
      setSelectedFromCellStep(null);
      setShippingSteps([]);
      // Не сбрасываем currentTask - он загружается автоматически
    } else if (mode === "shipping_new") {
      setCurrentTaskNew(null);
      setShippingNewTasks([]);
      setShippingNewGrouped(new Map());
      // Не сбрасываем shippingNewCells - они загружаются один раз
    } else if (mode === "shipping_fcutc") {
      setFcutcFromCell(null);
      setFcutcUnit(null);
      setFcutcTaskInfo(null);
      setFcutcToCell(null);
    } else if (mode === "surplus") {
      setSurplusCell(null);
      setSurplusUnits([]);
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
          <Button
            variant={mode === "shipping_new" ? "primary" : "secondary"}
            size="lg"
            onClick={() => handleModeChange("shipping_new")}
            fullWidth
            style={{ flex: 1, minWidth: 100 }}
          >
            Отгрузка (НОВАЯ)
          </Button>
          <Button
            variant={mode === "shipping_fcutc" ? "primary" : "secondary"}
            size="lg"
            onClick={() => handleModeChange("shipping_fcutc")}
            fullWidth
            style={{ flex: 1, minWidth: 100 }}
          >
            Отгрузка (FCUTC)
          </Button>
          <Button
            variant={mode === "surplus" ? "primary" : "secondary"}
            size="lg"
            onClick={() => handleModeChange("surplus")}
            fullWidth
            style={{ flex: 1, minWidth: 100 }}
          >
            Излишки
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
                        setSelectedFromCellStep(null);
                        setShippingSteps([]);
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

                {/* Список from-ячеек для выбора (если ячейка не выбрана) */}
                {!selectedFromCellStep && shippingSteps.filter((s: any) => s.type === 'from_cell' && !s.completed).length > 0 && (
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: 12, color: "#374151" }}>
                      Выберите ячейку для сбора ({shippingSteps.filter((s: any) => s.type === 'from_cell' && !s.completed).length} осталось):
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {shippingSteps.map((step: any, idx: number) => {
                        if (step.type !== 'from_cell' || step.completed) return null;
                        
                        return (
                          <div
                            key={idx}
                            onClick={() => handleSelectFromCell(step, idx)}
                            style={{
                              padding: 16,
                              background: getCellColor(step.fromCell?.cell_type || 'storage', {}),
                              borderRadius: 8,
                              border: "2px solid #d1d5db",
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "scale(1.02)";
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
                                  background: getCellColor(step.fromCell?.cell_type || 'storage', {}),
                                  border: "2px solid #9ca3af",
                                  borderRadius: 8,
                                  flexShrink: 0,
                                }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "18px", fontWeight: 700, color: "#111" }}>
                                  {step.fromCell?.code || 'Ячейка'}
                                </div>
                                <div style={{ fontSize: "14px", color: "#666" }}>
                                  {step.units.length} заказов ({step.scannedUnits.length} отсканировано)
                                </div>
                              </div>
                              <div style={{ fontSize: "24px" }}>→</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Текущая выбранная ячейка */}
                {selectedFromCellStep && (
                  <div
                    style={{
                      padding: 16,
                      background: getCellColor(selectedFromCellStep.fromCell?.cell_type || 'storage', {}),
                      borderRadius: 8,
                      border: "2px solid #2563eb",
                    }}
                  >
                    <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>Текущая ячейка:</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          backgroundColor: getCellColor(selectedFromCellStep.fromCell?.cell_type || 'storage', {}),
                          border: "1px solid #ccc",
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div style={{ fontSize: "20px", fontWeight: 700 }}>{selectedFromCellStep.fromCell?.code}</div>
                        <div style={{ fontSize: "14px", color: "#666" }}>
                          {selectedFromCellStep.scannedUnits.length} / {selectedFromCellStep.units.length} заказов
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedFromCellStep(null);
                        setSuccess(null);
                        setError(null);
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
                      ← Сменить ячейку
          </button>
                  </div>
                )}

                {/* Список заказов для сбора из выбранной ячейки */}
                {selectedFromCellStep && (
                  <div
                    style={{
                      padding: 16,
                      background: "#fff",
                      borderRadius: 8,
                      border: "2px solid #e0e0e0",
                    }}
                  >
                    <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: 12, color: "#333" }}>
                      📋 Заказы для сканирования из {selectedFromCellStep.fromCell?.code}:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                      {selectedFromCellStep.units.map((unit: any, idx: number) => {
                        const isScanned = selectedFromCellStep.scannedUnits.some((u: any) => u.id === unit.id);
                        
                        return (
                          <div 
                            key={unit.id} 
                            style={{ 
                              fontSize: "16px", 
                              fontWeight: 600, 
                              padding: "10px 12px",
                              background: isScanned ? "#e8f5e9" : "#fff",
                              borderRadius: 6,
                              border: isScanned ? "2px solid #4caf50" : "2px solid #e0e0e0",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              opacity: isScanned ? 0.7 : 1,
                            }}
                          >
                            <span style={{ 
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: isScanned ? "#4caf50" : "#e0e0e0",
                              color: isScanned ? "#fff" : "#666",
                              fontSize: 13,
                              fontWeight: 700,
                              flexShrink: 0
                            }}>
                              {isScanned ? '✓' : (idx + 1)}
                            </span>
                            <span style={{ flex: 1, color: isScanned ? "#666" : "#111" }}>
                              {unit.barcode}
                            </span>
                            {isScanned && (
                              <span style={{ fontSize: 12, color: "#4caf50", fontWeight: 600 }}>
                                Отсканирован
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
            </div>
          )}

                {/* Если все from-ячейки завершены */}
                {!selectedFromCellStep && shippingSteps.filter((s: any) => s.type === 'from_cell' && !s.completed).length === 0 && shippingSteps.filter((s: any) => s.type === 'from_cell').length > 0 && (
                  <div style={{ padding: 16, background: "#e8f5e9", borderRadius: 8, border: "2px solid #4caf50" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: 8, color: "#2e7d32" }}>
                      ✅ Все заказы собраны!
                    </div>
                    <div style={{ fontSize: "14px", color: "#666" }}>
                      Отсканируйте picking-ячейку: <strong>{currentTask.targetCell?.code}</strong>
                    </div>
        </div>
      )}

                {/* Отсканированные заказы из текущей ячейки */}
                {selectedFromCellStep && selectedFromCellStep.scannedUnits.length > 0 && (
                  <div
                    style={{
                      padding: 16,
                      background: "#e8f5e9",
                      borderRadius: 8,
                      border: "2px solid #4caf50",
                    }}
                  >
                    <div style={{ fontSize: "14px", color: "#2e7d32", fontWeight: 700, marginBottom: 8 }}>
                      ✓ Отсканировано из {selectedFromCellStep.fromCell?.code}: {selectedFromCellStep.scannedUnits.length}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
                      {selectedFromCellStep.scannedUnits.map((u: any, idx: number) => (
                        <div 
                          key={u.id} 
                          style={{ 
                            fontSize: "14px", 
                            fontWeight: 600, 
                            padding: "6px 10px",
                            background: "#fff",
                            borderRadius: 4,
                            border: "1px solid #4caf50",
                            display: "flex",
                            alignItems: "center",
                            gap: 8
                          }}
                        >
                          <span style={{ 
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#4caf50",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ flex: 1 }}>{u.barcode}</span>
                        </div>
                      ))}
          </div>
        </div>
      )}

                {/* Прогресс сбора */}
                {shippingSteps.filter((s: any) => s.type === 'from_cell').length > 0 && (
                  <div style={{ padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #e0e0e0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: "14px", color: "#666" }}>
                        Прогресс сбора:
    </div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#333" }}>
                        {shippingSteps.filter((s: any) => s.type === 'from_cell' && s.completed).length} / {shippingSteps.filter((s: any) => s.type === 'from_cell').length} ячеек
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", color: "#666", textAlign: "center" }}>
                      Собрано заказов: <strong>{shippingUnits.length} / {currentTask.unitCount}</strong>
                    </div>
                  </div>
                )}

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

        {/* Режим ИЗЛИШКИ (SURPLUS) */}
        {mode === "surplus" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            {/* Ячейка SURPLUS */}
            <div
              style={{
                padding: 16,
                background: surplusCell ? "#fff3e0" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: surplusCell ? "#ff9800" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>
                Ячейка излишков (SURPLUS)
              </div>
              {surplusCell ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: "#ff9800",
                      border: "1px solid #f57c00",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#e65100" }}>
                      {surplusCell.code}
                    </div>
                    <div style={{ fontSize: "12px", color: "#999" }}>
                      Тип: {surplusCell.cell_type.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ fontSize: "24px", color: "#4caf50" }}>✓</div>
                </div>
              ) : (
                <div style={{ color: "#999", fontSize: "14px" }}>
                  Отсканируйте ячейку типа SURPLUS
                </div>
              )}
            </div>

            {/* Список отсканированных излишков */}
            {surplusUnits.length > 0 && (
              <div
                style={{
                  padding: 16,
                  background: "#e8f5e9",
                  borderRadius: 8,
                  border: "2px solid #4caf50",
                }}
              >
                <div style={{ fontSize: "14px", color: "#2e7d32", fontWeight: 700, marginBottom: 12 }}>
                  Отсканировано излишков: {surplusUnits.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                  {surplusUnits.map((unit, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 12,
                        background: "white",
                        borderRadius: 6,
                        border: "1px solid #c8e6c9",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div style={{ 
                        minWidth: 28, 
                        height: 28, 
                        borderRadius: "50%", 
                        background: "#4caf50",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: "#1b5e20" }}>{unit.barcode}</div>
                      </div>
                      <div style={{ fontSize: "18px", color: "#4caf50" }}>✓</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Инструкции */}
            <div style={{ 
              padding: 12, 
              background: "#fff8e1", 
              borderRadius: 8,
              fontSize: 13,
              color: "#f57f17"
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>📋 Порядок работы:</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>Отсканируйте ячейку SURPLUS</li>
                <li>Сканируйте заказы без ТТНК (один за другим)</li>
                <li>Нажмите "Подтвердить приемку" для размещения</li>
              </ol>
              <div style={{ marginTop: 8, padding: 8, background: "#fff3e0", borderRadius: 4, fontSize: 12 }}>
                ⚠️ <strong>Защита от дубликатов:</strong> заказы, уже размещенные на складе, будут отклонены
              </div>
            </div>

            {/* Кнопка подтверждения */}
            {surplusCell && surplusUnits.length > 0 && (
              <Button
                variant="primary"
                size="lg"
                onClick={handleConfirmSurplus}
                disabled={busy}
                fullWidth
                style={{
                  background: "linear-gradient(135deg, #ff9800 0%, #f57c00 100%)",
                  marginTop: 8
                }}
              >
                ✓ Подтвердить приемку ({surplusUnits.length} шт.)
              </Button>
            )}
          </div>
        )}

        {/* Режим ОТГРУЗКА (FCUTC) - последовательное сканирование */}
        {mode === "shipping_fcutc" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            {/* FROM */}
            <div
              style={{
                padding: 16,
                background: fcutcFromCell ? "#e3f2fd" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: fcutcFromCell ? "#2196f3" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>FROM (откуда)</div>
              {fcutcFromCell ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: getCellColor(fcutcFromCell.cell_type, fcutcFromCell.meta),
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700 }}>{fcutcFromCell.code}</div>
                    <div style={{ fontSize: "14px", color: "#666" }}>{fcutcFromCell.cell_type}</div>
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
                background: fcutcUnit ? "#fff8e1" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: fcutcUnit ? "#ffc107" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>ЗАКАЗ</div>
              {fcutcUnit ? (
                <div style={{ fontSize: "20px", fontWeight: 700 }}>{fcutcUnit.barcode}</div>
              ) : (
                <div style={{ fontSize: "18px", color: "#999" }}>—</div>
              )}
            </div>

            {/* TO (ожидаемая ячейка) */}
            {fcutcTaskInfo && (
              <div
                style={{
                  padding: 16,
                  background: "#e8f5e9",
                  borderRadius: 8,
                  border: "2px solid #4caf50",
                }}
              >
                <div style={{ fontSize: "14px", color: "#2e7d32", fontWeight: 700, marginBottom: 8 }}>
                  📍 Отсканируйте TO ячейку:
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: getCellColor("picking", {}),
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#2e7d32" }}>
                      {fcutcTaskInfo.toCell.code}
                    </div>
                    {fcutcTaskInfo.toCell.description && (
                      <div style={{ fontSize: "14px", color: "#666", marginTop: 4 }}>
                        {fcutcTaskInfo.toCell.description}
                      </div>
                    )}
                    <div style={{ fontSize: "12px", color: "#666", marginTop: 4 }}>picking</div>
                  </div>
                </div>
              </div>
            )}

            {/* TO (отсканированная ячейка) */}
            <div
              style={{
                padding: 16,
                background: fcutcToCell ? "#e8f5e9" : "#f5f5f5",
                borderRadius: 8,
                border: "2px solid",
                borderColor: fcutcToCell ? "#4caf50" : "#ddd",
              }}
            >
              <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>TO (куда)</div>
              {fcutcToCell ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: getCellColor(fcutcToCell.cell_type, fcutcToCell.meta),
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700 }}>{fcutcToCell.code}</div>
                    <div style={{ fontSize: "14px", color: "#666" }}>{fcutcToCell.cell_type}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "18px", color: "#999" }}>—</div>
              )}
            </div>
          </div>
        )}

        {/* Режим ОТГРУЗКА (НОВАЯ) - с группировкой по picking ячейкам */}
        {mode === "shipping_new" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            {loadingTasksNew ? (
              <div style={{ padding: 16, textAlign: "center", color: "#666" }}>Загрузка задач...</div>
            ) : !currentTaskNew ? (
              // Список объединенных задач (по picking ячейкам)
              shippingNewGrouped.size === 0 ? (
                <div style={{ padding: 16, background: "#f5f5f5", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: "18px", color: "#666" }}>Нет активных задач</div>
                  <div style={{ fontSize: "14px", color: "#999", marginTop: 8 }}>Создайте задачу в разделе Ops</div>
                </div>
              ) : (
                <div style={{ padding: 16 }}>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: 16 }}>
                    Задачи по picking ячейкам ({shippingNewGrouped.size} ячеек, {shippingNewTasks.length} задач)
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {Array.from(shippingNewGrouped.entries())
                      .sort(([cellIdA], [cellIdB]) => {
                        const cellA = shippingNewCells.get(cellIdA);
                        const cellB = shippingNewCells.get(cellIdB);
                        return (cellA?.code || "").localeCompare(cellB?.code || "");
                      })
                      .map(([cellId, tasks]) => {
                        const cellInfo = shippingNewCells.get(cellId);
                        const totalUnits = tasks.reduce((sum, task) => sum + (task.unitCount || 0), 0);
                        const cellCode = cellInfo?.code || "?";
                        const cellDescription = cellInfo?.description ? ` (${cellInfo.description})` : "";
                        
                        return (
                          <div
                            key={cellId}
                            style={{
                              padding: 16,
                              background: "#fff",
                              borderRadius: 8,
                              border: "2px solid #e0e0e0",
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                            onClick={() => handleSelectTaskNew(cellId, tasks)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "#2196f3";
                              e.currentTarget.style.background = "#f5f5f5";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "#e0e0e0";
                              e.currentTarget.style.background = "#fff";
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: 4 }}>
                                  📦 {cellCode}{cellDescription}
                                </div>
                                <div style={{ fontSize: "14px", color: "#666" }}>
                                  {tasks.length} {tasks.length === 1 ? "задача" : tasks.length < 5 ? "задачи" : "задач"}, {totalUnits} {totalUnits === 1 ? "заказ" : totalUnits < 5 ? "заказа" : "заказов"}
                                </div>
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
                          </div>
                        );
                      })}
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <button
                      onClick={loadShippingNewTasks}
                      disabled={loadingTasksNew}
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
                      {loadingTasksNew ? "Загрузка..." : "🔄 Обновить список"}
                    </button>
                  </div>
                </div>
              )
            ) : (
              // Работа с выбранной объединенной задачей
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Информация о задаче */}
                <div style={{ padding: 16, background: "#e3f2fd", borderRadius: 8, border: "2px solid #2196f3" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: 4 }}>
                        📦 TO: {currentTaskNew.targetCell.code}
                      </div>
                      <div style={{ fontSize: "14px", color: "#666" }}>
                        {currentTaskNew.tasks.length} {currentTaskNew.tasks.length === 1 ? "задача" : "задач"}, {currentTaskNew.totalUnitCount} {currentTaskNew.totalUnitCount === 1 ? "заказ" : "заказов"}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setCurrentTaskNew(null);
                        setShippingNewFromCells([]);
                        setShippingNewSelectedFromCell(null);
                        setShippingNewScannedUnits([]);
                        setShippingNewToCell(null);
                        setShippingNewAllUnits([]);
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
                      ← Назад
                    </button>
                  </div>
                </div>

                {/* Если from-ячейка не выбрана - показываем список from-ячеек */}
                {!shippingNewSelectedFromCell && (
                  <div style={{ padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #e0e0e0" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: 12 }}>
                      📍 Выберите from-ячейку для сбора:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {shippingNewFromCells.map((fromCell) => {
                        const scannedCount = shippingNewScannedUnits.filter(
                          (u) => u.from_cell_id === fromCell.id || (u.cell_id === fromCell.id && !u.from_cell_id)
                        ).length;
                        const isCompleted = scannedCount >= fromCell.units.length;
                        
                        return (
                          <div
                            key={fromCell.id}
                            onClick={() => handleSelectFromCellNew(fromCell)}
                            style={{
                              padding: 16,
                              background: isCompleted ? "#e8f5e9" : "#fff",
                              borderRadius: 8,
                              border: isCompleted ? "2px solid #4caf50" : "2px solid #e0e0e0",
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              if (!isCompleted) {
                                e.currentTarget.style.borderColor = "#2196f3";
                                e.currentTarget.style.background = "#f5f5f5";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isCompleted) {
                                e.currentTarget.style.borderColor = "#e0e0e0";
                                e.currentTarget.style.background = "#fff";
                              }
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: 4 }}>
                                  {isCompleted ? "✅" : "📍"} {fromCell.code}
                                </div>
                                <div style={{ fontSize: "14px", color: "#666" }}>
                                  {scannedCount} / {fromCell.units.length} заказов
                                </div>
                              </div>
                              {isCompleted && (
                                <div style={{
                                  padding: "4px 8px",
                                  background: "#4caf50",
                                  color: "#fff",
                                  borderRadius: 4,
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}>
                                  Завершено
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Если from-ячейка выбрана - показываем список заказов */}
                {shippingNewSelectedFromCell && (
                  <div style={{ padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #2196f3" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: "20px", fontWeight: 700 }}>{shippingNewSelectedFromCell.code}</div>
                        <div style={{ fontSize: "14px", color: "#666" }}>
                          {shippingNewScannedUnits.filter(
                            (u) => u.from_cell_id === shippingNewSelectedFromCell.id || (u.cell_id === shippingNewSelectedFromCell.id && !u.from_cell_id)
                          ).length} / {shippingNewSelectedFromCell.units.length} заказов
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setShippingNewSelectedFromCell(null);
                          setSuccess(null);
                          setError(null);
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
                        ← Сменить ячейку
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                      {shippingNewSelectedFromCell.units.map((unit: any, idx: number) => {
                        const isScanned = shippingNewScannedUnits.some((u) => u.barcode === unit.barcode);
                        
                        return (
                          <div 
                            key={unit.id} 
                            style={{ 
                              fontSize: "16px", 
                              fontWeight: 600, 
                              padding: "10px 12px",
                              background: isScanned ? "#e8f5e9" : "#fff",
                              borderRadius: 6,
                              border: isScanned ? "2px solid #4caf50" : "2px solid #e0e0e0",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              opacity: isScanned ? 0.7 : 1,
                            }}
                          >
                            <span style={{ 
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: isScanned ? "#4caf50" : "#e0e0e0",
                              color: isScanned ? "#fff" : "#666",
                              fontSize: 13,
                              fontWeight: 700,
                              flexShrink: 0
                            }}>
                              {isScanned ? '✓' : (idx + 1)}
                            </span>
                            <span style={{ flex: 1, color: isScanned ? "#666" : "#111" }}>
                              {unit.barcode}
                            </span>
                            {isScanned && (
                              <span style={{ fontSize: 12, color: "#4caf50", fontWeight: 600 }}>
                                Отсканирован
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Если все from-ячейки завершены - показываем инструкцию для TO */}
                {!shippingNewSelectedFromCell && shippingNewFromCells.every((fc) => {
                  const scannedCount = shippingNewScannedUnits.filter(
                    (u) => u.from_cell_id === fc.id || (u.cell_id === fc.id && !u.from_cell_id)
                  ).length;
                  return scannedCount >= fc.units.length;
                }) && shippingNewFromCells.length > 0 && (
                  <div style={{ padding: 16, background: "#e8f5e9", borderRadius: 8, border: "2px solid #4caf50" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: 8, color: "#2e7d32" }}>
                      ✅ Все заказы собраны!
                    </div>
                    <div style={{ fontSize: "14px", color: "#666" }}>
                      Отсканируйте picking-ячейку: <strong>{currentTaskNew.targetCell.code}</strong>
                    </div>
                  </div>
                )}

                {/* Прогресс сбора */}
                {shippingNewFromCells.length > 0 && (
                  <div style={{ padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #e0e0e0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: "14px", color: "#666" }}>
                        Прогресс сбора:
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#333" }}>
                        {shippingNewFromCells.filter((fc) => {
                          const scannedCount = shippingNewScannedUnits.filter(
                            (u) => u.from_cell_id === fc.id || (u.cell_id === fc.id && !u.from_cell_id)
                          ).length;
                          return scannedCount >= fc.units.length;
                        }).length} / {shippingNewFromCells.length} ячеек
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", color: "#666", textAlign: "center" }}>
                      Собрано заказов: <strong>{shippingNewScannedUnits.length} / {currentTaskNew.totalUnitCount}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
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
          {mode === "shipping_new" && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadShippingNewTasks}
                disabled={loadingTasksNew || busy}
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
          ) : mode === "shipping_fcutc" ? (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Отсканируйте FROM ячейку</strong> (откуда берете заказ)</li>
              <li><strong>Отсканируйте заказ</strong> (штрихкод unit)</li>
              <li>Система проверит: есть ли заказ в задачах для этой ячейки</li>
              <li>Если заказ найден → появится <strong>ожидаемая TO ячейка</strong> (picking)</li>
              <li><strong>Отсканируйте TO ячейку</strong> (должна совпадать с ожидаемой)</li>
              <li>Заказ переместится автоматически, задача обновится</li>
              <li style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                💡 Можно обрабатывать заказы из разных задач последовательно
              </li>
            </ol>
          ) : mode === "surplus" ? (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Отсканируйте ячейку SURPLUS</li>
              <li>Отсканируйте заказы без ТТНК (один за другим)</li>
              <li>Нажмите "Подтвердить приемку" - заказы будут размещены в SURPLUS</li>
              <li style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                ⚠️ Заказы, уже размещенные на складе, будут отклонены (защита от дубликатов)
              </li>
            </ol>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Выберите задание</strong> из списка (нажмите на него)</li>
              <li><strong>Появится список ячеек</strong> с количеством заказов в каждой</li>
              <li><strong>Выберите ячейку</strong> для сбора (можно в любом порядке, на ваш выбор)</li>
              <li><strong>Увидите список заказов</strong> которые нужно отсканировать из этой ячейки</li>
              <li><strong>Сканируйте заказы</strong> один за другим (только из списка для этой ячейки)</li>
              <li><strong>После завершения</strong> ячейки автоматически вернётесь к списку - выберите следующую</li>
              <li><strong>Когда все ячейки собраны</strong> - отсканируйте picking-ячейку (указана в задании)</li>
              <li><strong>Все заказы переместятся</strong> автоматически в picking, задание завершится</li>
              <li style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                💡 Задача берётся в работу при выборе первой ячейки и блокируется для других работников
              </li>
              <li style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                📋 Можно собирать ячейки в любом порядке (сначала ближние, потом дальние)
              </li>
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
