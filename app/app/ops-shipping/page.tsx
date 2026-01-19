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

type UnitDetails = {
  id: string;
  barcode: string;
  status: string;
  cell_id?: string;
  created_at: string;
  cell?: {
    id: string;
    code: string;
    cell_type: string;
  } | null;
  item?: {
    title?: string;
    sku?: string;
    vendor?: string;
    image_url?: string;
  } | null;
};

// Scenario configuration
const SCENARIO_FROM = "Склад Возвратов";

const SCENARIO_TO_OPTIONS = {
  Pudo: ["Pudo Point 1", "Pudo Point 2", "Pudo Point 3"],
  Мерчант: ["Merchant 1", "Merchant 2", "Merchant 3"],
  Сервис: ["Service Center 1", "Service Center 2", "Service Center 3"],
} as const;

type ScenarioCategory = keyof typeof SCENARIO_TO_OPTIONS;

export default function OpsShippingPage() {
  const [availableUnits, setAvailableUnits] = useState<UnitWithCell[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [pickingCells, setPickingCells] = useState<Cell[]>([]);
  const [selectedPickingCellId, setSelectedPickingCellId] = useState<string>("");
  
  // Scenario state
  const [scenarioCategory, setScenarioCategory] = useState<ScenarioCategory | "">("");
  const [scenarioDestination, setScenarioDestination] = useState<string>("");
  
  const [loading, setLoading] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastCreatedCount, setLastCreatedCount] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Modal state
  const [modalUnitId, setModalUnitId] = useState<string | null>(null);
  const [modalUnitDetails, setModalUnitDetails] = useState<UnitDetails | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  // Compute final scenario string
  const scenarioString = scenarioCategory && scenarioDestination
    ? `${SCENARIO_FROM} → ${scenarioCategory} → ${scenarioDestination}`
    : "";

  // Load picking cells, available units and tasks on mount
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
    loadAvailableUnits();
    loadTasks();
  }, []);

  // Load available units from storage/shipping
  async function loadAvailableUnits() {
    setLoadingUnits(true);
    setError(null);
    try {
      const res = await fetch("/api/units/storage-shipping", { cache: "no-store" });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from /api/units/storage-shipping:", text);
        setAvailableUnits([]);
        return;
      }
      
      const json = await res.json();
      if (res.ok) {
        setAvailableUnits(json.units || []);
      } else {
        console.error("Error loading units:", json.error || "Unknown error");
        setError(json.error || "Ошибка загрузки заказов");
        setAvailableUnits([]);
      }
    } catch (e: any) {
      console.error("Failed to load units:", e);
      setError("Ошибка загрузки заказов");
      setAvailableUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  }

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

  // Toggle unit selection
  function handleToggleUnit(unitId: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  // Select all units
  function handleSelectAll() {
    if (selectedUnitIds.size === availableUnits.length) {
      setSelectedUnitIds(new Set());
    } else {
      setSelectedUnitIds(new Set(availableUnits.map((u) => u.id)));
    }
  }

  // Open unit details modal
  async function handleOpenUnitDetails(unitId: string) {
    setModalUnitId(unitId);
    setLoadingModal(true);
    setModalUnitDetails(null);

    try {
      // Load unit details
      const unitRes = await fetch(`/api/units/get?unitId=${unitId}`, { cache: "no-store" });
      const unitJson = await unitRes.json();

      if (!unitRes.ok || !unitJson.unit) {
        throw new Error("Не удалось загрузить данные заказа");
      }

      const unit = unitJson.unit;

      // Load cell if exists
      let cell = null;
      if (unit.cell_id) {
        const cellRes = await fetch(`/api/cells/get?cellId=${unit.cell_id}`, { cache: "no-store" });
        const cellJson = await cellRes.json();
        if (cellRes.ok && cellJson.cell) {
          cell = cellJson.cell;
        }
      }

      // Load unit_item if exists
      let item = null;
      const itemRes = await fetch(`/api/unit-items/get?unitId=${unitId}`, { cache: "no-store" });
      const itemJson = await itemRes.json();
      if (itemRes.ok && itemJson.item) {
        item = itemJson.item;
      }

      setModalUnitDetails({
        ...unit,
        cell,
        item,
      });
    } catch (e: any) {
      console.error("Failed to load unit details:", e);
      setModalUnitDetails(null);
    } finally {
      setLoadingModal(false);
    }
  }

  // Close modal
  function handleCloseModal() {
    setModalUnitId(null);
    setModalUnitDetails(null);
  }

  // Create tasks
  async function handleCreateTasks() {
    if (selectedUnitIds.size === 0) {
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
          unitIds: Array.from(selectedUnitIds),
          targetPickingCellId: selectedPickingCellId,
          scenario: scenarioString || null,
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
      setSelectedUnitIds(new Set());
      setScenarioCategory("");
      setScenarioDestination("");
      // Reload tasks and units
      await Promise.all([loadTasks(), loadAvailableUnits()]);
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

      {/* Available units list */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 16 }}>
            📦 Доступные заказы для создания задач
          </label>
          <Button variant="secondary" size="sm" onClick={loadAvailableUnits} disabled={loadingUnits}>
            {loadingUnits ? "Загрузка..." : "Обновить"}
          </Button>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          Заказы из ячеек storage/shipping, которые еще не добавлены в задачи
        </div>

        {loadingUnits ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            Загрузка заказов...
          </div>
        ) : availableUnits.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#666", border: "1px solid #ddd", borderRadius: 8 }}>
            Нет доступных заказов. Все заказы из storage/shipping уже добавлены в задачи или ячейки пусты.
          </div>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f5f5f5", zIndex: 1 }}>
                <tr>
                  <th style={{ padding: "12px", textAlign: "center", borderBottom: "1px solid #ddd", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={availableUnits.length > 0 && selectedUnitIds.size === availableUnits.length}
                      onChange={handleSelectAll}
                      style={{ cursor: "pointer", width: 16, height: 16 }}
                    />
                  </th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Штрихкод</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Текущая ячейка</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Тип</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #ddd", fontWeight: 600 }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {availableUnits.map((unit) => (
                  <tr 
                    key={unit.id} 
                    style={{ 
                      borderBottom: "1px solid #eee",
                      background: selectedUnitIds.has(unit.id) ? "#f0f9ff" : "transparent",
                      cursor: "pointer"
                    }}
                    onClick={(e) => {
                      // If clicking on checkbox column, toggle selection
                      const target = e.target as HTMLElement;
                      if (target.tagName === "INPUT" || target.closest("td")?.querySelector("input[type='checkbox']")) {
                        handleToggleUnit(unit.id);
                      } else {
                        // Otherwise, open details modal
                        handleOpenUnitDetails(unit.id);
                      }
                    }}
                  >
                    <td style={{ padding: "12px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedUnitIds.has(unit.id)}
                        onChange={() => handleToggleUnit(unit.id)}
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </td>
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
                    <td style={{ padding: "12px", fontSize: 13, color: "#666" }}>{unit.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedUnitIds.size > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: "#f0f9ff", borderRadius: 6, fontSize: 14 }}>
            <strong>Выбрано заказов:</strong> {selectedUnitIds.size}
          </div>
        )}
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
        
        <div style={{ display: "grid", gap: 12 }}>
          {/* FROM - fixed */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#666" }}>
              ОТКУДА
            </label>
            <input
              type="text"
              value={SCENARIO_FROM}
              disabled
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                background: "#f5f5f5",
                color: "#666",
                cursor: "not-allowed",
              }}
            />
          </div>

          {/* TO - Category */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#666" }}>
              КУДА (категория)
            </label>
            <select
              value={scenarioCategory}
              onChange={(e) => {
                setScenarioCategory(e.target.value as ScenarioCategory | "");
                setScenarioDestination(""); // Reset destination when category changes
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                background: "#fff",
              }}
              disabled={loading}
            >
              <option value="">Выберите категорию</option>
              <option value="Pudo">Pudo</option>
              <option value="Мерчант">Мерчант</option>
              <option value="Сервис">Сервис</option>
            </select>
          </div>

          {/* TO - Destination (shown only when category is selected) */}
          {scenarioCategory && (
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#666" }}>
                Точка назначения
              </label>
              <select
                value={scenarioDestination}
                onChange={(e) => setScenarioDestination(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                  background: "#fff",
                }}
                disabled={loading}
              >
                <option value="">Выберите точку</option>
                {SCENARIO_TO_OPTIONS[scenarioCategory].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Preview */}
          {scenarioString && (
            <div
              style={{
                padding: "12px",
                background: "#f0f9ff",
                borderRadius: 6,
                fontSize: 14,
                color: "#1976d2",
                border: "1px solid #bbdefb",
              }}
            >
              <strong>Сценарий:</strong> {scenarioString}
            </div>
          )}
        </div>
      </div>

      {/* Create button */}
      <Button
        onClick={handleCreateTasks}
        disabled={loading || selectedUnitIds.size === 0 || !selectedPickingCellId}
        style={{ width: "100%" }}
        variant="primary"
      >
        {loading ? "Создание..." : `Создать задания (${selectedUnitIds.size})`}
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

      {/* Unit Details Modal */}
      {modalUnitId && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 600,
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #ddd",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Информация о заказе</h2>
              <button
                onClick={handleCloseModal}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "#666",
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: 24 }}>
              {loadingModal ? (
                <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Загрузка...</div>
              ) : modalUnitDetails ? (
                <div style={{ display: "grid", gap: 20 }}>
                  {/* Barcode */}
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                      {modalUnitDetails.barcode}
                    </div>
                    <div style={{ fontSize: 12, color: "#999" }}>ID: {modalUnitDetails.id}</div>
                  </div>

                  {/* Main Info */}
                  <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 12 }}>Основная информация</div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Статус</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{modalUnitDetails.status}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Создан</div>
                        <div style={{ fontSize: 14 }}>
                          {new Date(modalUnitDetails.created_at).toLocaleString("ru-RU")}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Текущая ячейка</div>
                        {modalUnitDetails.cell ? (
                          <div>
                            <div style={{ fontSize: 14, marginBottom: 4 }}>
                              {modalUnitDetails.cell.code} ({modalUnitDetails.cell.cell_type})
                            </div>
                            <a
                              href={`/app/cells/${modalUnitDetails.cell.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#0066cc", textDecoration: "none", fontSize: 13 }}
                            >
                              Открыть ячейку →
                            </a>
                          </div>
                        ) : (
                          <div style={{ fontSize: 14, color: "#999" }}>Не размещен</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Product Info */}
                  <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 12 }}>Товар</div>
                    {modalUnitDetails.item ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        {modalUnitDetails.item.image_url && (
                          <div>
                            <img
                              src={modalUnitDetails.item.image_url}
                              alt={modalUnitDetails.item.title || "Товар"}
                              style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }}
                            />
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Название</div>
                          <div style={{ fontSize: 14 }}>{modalUnitDetails.item.title || "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>SKU</div>
                          <div style={{ fontSize: 14 }}>{modalUnitDetails.item.sku || "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Производитель</div>
                          <div style={{ fontSize: 14 }}>{modalUnitDetails.item.vendor || "—"}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 14 }}>
                        Данные товара не добавлены
                      </div>
                    )}
                  </div>

                  {/* Full page link */}
                  <div style={{ textAlign: "center", paddingTop: 8 }}>
                    <a
                      href={`/app/units/${modalUnitDetails.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#0066cc",
                        textDecoration: "none",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      Открыть полную страницу →
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
                  Не удалось загрузить данные
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
