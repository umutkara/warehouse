"use client";

import { useState, useEffect } from "react";
import { Alert, Button } from "@/lib/ui/components";

type Cell = {
  id: string;
  code: string;
  cell_type: string;
};

type Unit = {
  id: string;
  barcode: string;
  cell_id?: string;
  status?: string;
};

type UnitWithCell = Unit & {
  cell?: {
    id: string;
    code: string;
    cell_type: string;
  } | null;
};

type Task = {
  id: string;
  status: string;
  scenario?: string;
  created_at: string;
  unit: {
    id: string;
    barcode: string;
    cell_id?: string;
  };
  fromCell?: {
    code: string;
    cell_type: string;
  } | null;
  targetCell?: {
    code: string;
    cell_type: string;
  } | null;
};

export default function OpsShippingPage() {
  const [searchBarcode, setSearchBarcode] = useState("");
  const [searchedUnit, setSearchedUnit] = useState<UnitWithCell | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<UnitWithCell[]>([]);
  const [pickingCells, setPickingCells] = useState<Cell[]>([]);
  const [selectedPickingCellId, setSelectedPickingCellId] = useState<string>("");
  const [scenario, setScenario] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastCreatedCount, setLastCreatedCount] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Load picking cells and tasks on mount
  useEffect(() => {
    async function loadPickingCells() {
      try {
        const res = await fetch("/api/cells/list", { cache: "no-store" });
        const json = await res.json();
        if (res.ok) {
          const picking = (json.cells || []).filter((c: Cell) => c.cell_type === "picking");
          setPickingCells(picking);
          if (picking.length === 0) {
            setError("Нет picking ячеек. Добавьте на карте склада ячейки с cell_type='picking'");
          }
        }
      } catch (e) {
        console.error("Failed to load picking cells:", e);
        setError("Ошибка загрузки ячеек");
      }
    }
    loadPickingCells();
    loadTasks();
  }, []);

  // Load tasks
  async function loadTasks() {
    setLoadingTasks(true);
    try {
      const res = await fetch("/api/tsd/shipping-tasks/list", { cache: "no-store" });
      
      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from /api/tsd/shipping-tasks/list:", text);
        setTasks([]);
        return;
      }
      
      const json = await res.json();
      if (res.ok) {
        setTasks(json.tasks || []);
      } else {
        console.error("Error loading tasks:", json.error || "Unknown error");
        setTasks([]);
      }
    } catch (e: any) {
      console.error("Failed to load tasks:", e);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }

  // Search unit by barcode
  async function handleSearchBarcode() {
    if (!searchBarcode.trim()) {
      setError("Введите штрихкод");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/units/by-barcode?barcode=${encodeURIComponent(searchBarcode.trim())}`);
      
      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(text || "Ошибка поиска: неверный формат ответа");
      }
      
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Ошибка поиска");
      }

      if (json.unit) {
        const unitWithCell: UnitWithCell = {
          ...json.unit,
          cell: json.cell || null,
        };
        setSearchedUnit(unitWithCell);
        
        // Validate unit is in storage or shipping
        if (!json.unit.cell_id) {
          setError(`Заказ ${json.unit.barcode} не размещен в ячейке. Нужно разместить в storage/shipping перед созданием задачи.`);
          setSearchBarcode("");
          return;
        }
        
        if (!json.cell) {
          setError(`Ячейка для заказа ${json.unit.barcode} не найдена`);
          setSearchBarcode("");
          return;
        }
        
        if (json.cell.cell_type !== "storage" && json.cell.cell_type !== "shipping") {
          setError(`Заказ ${json.unit.barcode} находится в ячейке типа "${json.cell.cell_type}". Можно создавать задачи только для заказов в storage/shipping.`);
          setSearchBarcode("");
          return;
        }
        
        // Auto-add if not already in selected
        if (!selectedUnits.find((u) => u.id === json.unit.id)) {
          setSelectedUnits([...selectedUnits, unitWithCell]);
          setSuccess(`Добавлен: ${json.unit.barcode} (${json.cell.code}, ${json.cell.cell_type})`);
        } else {
          setError("Заказ уже добавлен");
        }
        setSearchBarcode("");
      } else {
        setError("Заказ не найден");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка поиска");
    } finally {
      setLoading(false);
    }
  }

  // Remove unit from selection
  function handleRemoveUnit(unitId: string) {
    setSelectedUnits(selectedUnits.filter((u) => u.id !== unitId));
  }

  // Create tasks
  async function handleCreateTasks() {
    if (selectedUnits.length === 0) {
      setError("Выберите хотя бы один заказ");
      return;
    }

    if (!selectedPickingCellId) {
      setError("Выберите целевую ячейку picking");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/ops/picking-tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitIds: selectedUnits.map((u) => u.id),
          targetPickingCellId: selectedPickingCellId,
          scenario: scenario.trim() || null,
        }),
      });

      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(text || "Ошибка создания заданий: неверный формат ответа");
      }
      
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Ошибка создания заданий");
      }

      setLastCreatedCount(json.count || 0);
      setSuccess(`Создано заданий: ${json.count || 0}`);
      setSelectedUnits([]);
      setScenario("");
      setSearchedUnit(null);
      // Reload tasks
      await loadTasks();
    } catch (e: any) {
      setError(e.message || "Ошибка создания заданий");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>Создание заданий на отгрузку</h1>

      {error && (
        <Alert variant="error" style={{ marginBottom: 16 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" style={{ marginBottom: 16 }}>
          {success}
        </Alert>
      )}

      {/* Search unit by barcode */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
          Поиск заказа по штрихкоду
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={searchBarcode}
            onChange={(e) => setSearchBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearchBarcode();
              }
            }}
            placeholder="Отсканируйте или введите штрихкод"
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: 6,
              fontSize: 14,
            }}
            disabled={loading}
          />
          <Button onClick={handleSearchBarcode} disabled={loading}>
            Найти
          </Button>
        </div>
      </div>


      {/* Target picking cell */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
          Целевая ячейка picking <span style={{ color: "red" }}>*</span>
        </label>
        <select
          value={selectedPickingCellId}
          onChange={(e) => setSelectedPickingCellId(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 14,
          }}
          disabled={loading}
        >
          <option value="">Выберите ячейку picking</option>
          {pickingCells.map((cell) => (
            <option key={cell.id} value={cell.id}>
              {cell.code} ({cell.cell_type})
            </option>
          ))}
        </select>
      </div>

      {/* Scenario */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
          Сценарий (опционально)
        </label>
        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="Описание сценария..."
          rows={3}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 14,
            fontFamily: "inherit",
          }}
          disabled={loading}
        />
      </div>

      {/* Create button */}
      <Button
        onClick={handleCreateTasks}
        disabled={loading || selectedUnits.length === 0 || !selectedPickingCellId}
        style={{ width: "100%" }}
      >
        {loading ? "Создание..." : "Создать задания"}
      </Button>

      {lastCreatedCount !== null && lastCreatedCount > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: "#f0f9ff", borderRadius: 6, fontSize: 14 }}>
          <strong>Готово!</strong> Создано заданий: {lastCreatedCount}. Задания доступны в ТСД в режиме "Отгрузка".
        </div>
      )}

      {/* Picking cells warning */}
      {pickingCells.length === 0 && (
        <Alert variant="error" style={{ marginTop: 24 }}>
          <strong>Нет picking ячеек.</strong> Добавьте на карте склада ячейки с cell_type='picking'.
        </Alert>
      )}

      {/* Selected units table */}
      {selectedUnits.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Выбранные заказы</h2>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Штрихкод</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Текущая ячейка</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Тип ячейки</th>
                  <th style={{ padding: "12px", textAlign: "center", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Действие</th>
                </tr>
              </thead>
              <tbody>
                {selectedUnits.map((unit) => (
                  <tr key={unit.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>{unit.barcode}</td>
                    <td style={{ padding: "12px" }}>{unit.cell?.code || "—"}</td>
                    <td style={{ padding: "12px" }}>
                      {unit.cell?.cell_type ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: unit.cell.cell_type === "storage" ? "#e3f2fd" : "#fff3e0",
                            color: unit.cell.cell_type === "storage" ? "#1976d2" : "#e65100",
                          }}
                        >
                          {unit.cell.cell_type}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemoveUnit(unit.id)}
                        disabled={loading}
                      >
                        Удалить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tasks table */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Созданные задачи ({tasks.length})</h2>
          <Button variant="secondary" size="sm" onClick={loadTasks} disabled={loadingTasks}>
            {loadingTasks ? "Загрузка..." : "Обновить"}
          </Button>
        </div>

        {loadingTasks ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666" }}>Загрузка задач...</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            Нет активных задач (open/in_progress)
          </div>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Статус</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Штрихкод</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>FROM</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>TO</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Сценарий</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600, fontSize: 12 }}>Создано</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background:
                            task.status === "done"
                              ? "#e8f5e9"
                              : task.status === "in_progress"
                              ? "#fff3e0"
                              : "#e3f2fd",
                          color:
                            task.status === "done"
                              ? "#2e7d32"
                              : task.status === "in_progress"
                              ? "#e65100"
                              : "#1976d2",
                        }}
                      >
                        {task.status === "open" ? "Открыта" : task.status === "in_progress" ? "В работе" : task.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontWeight: 600 }}>{task.unit.barcode}</td>
                    <td style={{ padding: "12px", fontSize: 13 }}>
                      {task.fromCell ? `${task.fromCell.code} (${task.fromCell.cell_type})` : "—"}
                    </td>
                    <td style={{ padding: "12px", fontSize: 13 }}>
                      {task.targetCell ? `${task.targetCell.code} (${task.targetCell.cell_type})` : "—"}
                    </td>
                    <td style={{ padding: "12px", fontSize: 13, color: "#666", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {task.scenario || "—"}
                    </td>
                    <td style={{ padding: "12px", fontSize: 13, color: "#666" }}>
                      {new Date(task.created_at).toLocaleString("ru-RU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
