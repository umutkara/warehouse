"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  cell_id: string;
  created_at: string;
  cell: { id: string; code: string; cell_type: string; meta?: any } | null;
  scenario: string | null;
};

type PickingCell = {
  id: string;
  code: string;
  cell_type: string;
  meta?: { description?: string } | null;
};

type CourierOption = {
  id: string;
  full_name: string;
  role: string;
};

type LastShipmentInfo = {
  unitLabel: string;
  courierName: string;
  sentAt: string;
};

export default function LogisticsPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [pickingCells, setPickingCells] = useState<PickingCell[]>([]);
  const [selectedCellFilter, setSelectedCellFilter] = useState<string>("");
  const [searchOrder, setSearchOrder] = useState("");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [selectedCourierUserId, setSelectedCourierUserId] = useState("");
  const [manualCourierName, setManualCourierName] = useState("");
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [lastShipment, setLastShipment] = useState<LastShipmentInfo | null>(null);

  useEffect(() => {
    loadUnits();
    loadCouriers();
  }, []);

  async function loadUnits() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/logistics/picking-units", { cache: "no-store" });
      
      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 403) {
        setError("У вас нет доступа к этому разделу");
        setLoading(false);
        return;
      }

      const json = await res.json();

      if (res.ok && json.ok) {
        const loadedUnits = json.units || [];
        setUnits(loadedUnits);
        
        // Extract unique picking cells from units
        const cellsMap = new Map<string, PickingCell>();
        loadedUnits.forEach((unit: Unit) => {
          if (unit.cell && !cellsMap.has(unit.cell.id)) {
            cellsMap.set(unit.cell.id, {
              id: unit.cell.id,
              code: unit.cell.code,
              cell_type: unit.cell.cell_type,
              meta: unit.cell.meta,
            });
          }
        });
        setPickingCells(Array.from(cellsMap.values()).sort((a, b) => a.code.localeCompare(b.code)));
      } else {
        setError(json.error || "Ошибка загрузки заказов");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function loadCouriers() {
    setLoadingCouriers(true);
    try {
      const res = await fetch("/api/logistics/couriers", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setError("У вас нет доступа к списку курьеров");
        return;
      }

      const json = await res.json();
      if (res.ok && json.ok) {
        setCouriers((json.couriers || []) as CourierOption[]);
      } else {
        setError(json.error || "Ошибка загрузки курьеров");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки курьеров");
    } finally {
      setLoadingCouriers(false);
    }
  }

  // Toggle unit selection for batch mode
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
    // Clear single selection when using batch mode
    if (selectedUnit?.id === unitId) {
      setSelectedUnit(null);
    }
  }

  // Handle single unit selection (existing behavior)
  function handleSelectUnit(unit: Unit) {
    setSelectedUnit(unit);
    // Clear batch selection when using single mode
    setSelectedUnitIds(new Set());
  }

  // Batch ship out - sends multiple units with same courier
  async function handleBatchShipOut() {
    if (selectedUnitIds.size === 0 || (!selectedCourierUserId && !manualCourierName.trim())) {
      alert("Выберите заказы и укажите курьера");
      return;
    }
    const selectedCourier = couriers.find((courier) => courier.id === selectedCourierUserId);
    const selectedCourierName =
      selectedCourier?.full_name || manualCourierName.trim() || "Неизвестный курьер";

    if (!confirm(`Отправить ${selectedUnitIds.size} заказ${selectedUnitIds.size > 1 ? 'ов' : ''} курьеру ${selectedCourierName}?`)) {
      return;
    }

    setShipping(true);
    setError(null);

    try {
      const unitIdsArray = Array.from(selectedUnitIds);
      const results = await Promise.allSettled(
        unitIdsArray.map((unitId) =>
          fetch("/api/logistics/ship-out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unitId,
              ...(selectedCourierUserId
                ? { courierUserId: selectedCourierUserId }
                : { courierName: manualCourierName.trim() }),
            }),
          }).then((res) => res.json())
        )
      );

      const successful = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
      const failed = results.length - successful;

      if (successful > 0) {
        alert(`✓ Отправлено ${successful} из ${results.length} заказ${results.length > 1 ? 'ов' : ''} курьеру ${selectedCourierName}`);
        setLastShipment({
          unitLabel: successful === 1 ? "1 заказ" : `${successful} заказов`,
          courierName: selectedCourierName,
          sentAt: new Date().toISOString(),
        });
        setSelectedUnitIds(new Set());
        setSelectedCourierUserId("");
        setManualCourierName("");
        await loadUnits();
      }

      if (failed > 0) {
        setError(`Не удалось отправить ${failed} из ${results.length} заказ${results.length > 1 ? 'ов' : ''}`);
      }
    } catch (e: any) {
      setError(e.message || "Ошибка отправки");
    } finally {
      setShipping(false);
    }
  }

  // Single ship out (existing behavior - preserved)
  async function handleShipOut() {
    if (!selectedUnit || (!selectedCourierUserId && !manualCourierName.trim())) {
      alert("Укажите курьера");
      return;
    }

    setShipping(true);
    setError(null);

    try {
      const res = await fetch("/api/logistics/ship-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selectedUnit.id,
          ...(selectedCourierUserId
            ? { courierUserId: selectedCourierUserId }
            : { courierName: manualCourierName.trim() }),
        }),
      });

      const json = await res.json();

      if (res.ok && json.ok) {
        const selectedCourier = couriers.find((courier) => courier.id === selectedCourierUserId);
        const sentCourierName = selectedCourier?.full_name || manualCourierName.trim() || "курьеру";
        alert(`✓ Заказ ${selectedUnit.barcode} отправлен курьеру ${sentCourierName}`);
        setLastShipment({
          unitLabel: selectedUnit.barcode,
          courierName: sentCourierName,
          sentAt: new Date().toISOString(),
        });
        setSelectedUnit(null);
        setSelectedCourierUserId("");
        setManualCourierName("");
        await loadUnits();
      } else {
        setError(json.error || "Ошибка отправки");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка отправки");
    } finally {
      setShipping(false);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Filter units by selected picking cell and search by order (barcode)
  const filteredUnits = units
    .filter((unit) => !selectedCellFilter || unit.cell_id === selectedCellFilter)
    .filter((unit) => {
      if (!searchOrder.trim()) return true;
      const q = searchOrder.trim().toLowerCase();
      return (unit.barcode || "").toLowerCase().includes(q);
    });
  const selectedCourierName =
    couriers.find((courier) => courier.id === selectedCourierUserId)?.full_name || "";
  const effectiveCourierName = selectedCourierName
    ? selectedCourierName
    : manualCourierName.trim();

  async function handleExportToExcel(format: "xlsx" | "csv" = "xlsx") {
    const unitsToExport = filteredUnits.length > 0 ? filteredUnits : units;
    
    if (unitsToExport.length === 0) {
      alert("Нет заказов для экспорта");
      return;
    }

    try {
      // Prepare data
      const data = unitsToExport.map((unit) => {
        const cellDescription = unit.cell?.meta?.description
          ? ` (${unit.cell.meta.description})`
          : "";
        
        return {
          "Штрихкод": unit.barcode || "",
          "Статус": unit.status || "",
          "Ячейка": unit.cell?.code ? `${unit.cell.code}${cellDescription}` : "—",
          "Тип ячейки": unit.cell?.cell_type || "—",
          "Сценарий": unit.scenario || "—",
          "Дата создания": unit.created_at 
            ? new Date(unit.created_at).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—",
        };
      });

      if (format === "xlsx") {
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Create worksheet from data
        const ws = XLSX.utils.json_to_sheet(data);

        // Set column widths for better readability
        ws["!cols"] = [
          { wch: 15 }, // Штрихкод
          { wch: 12 }, // Статус
          { wch: 12 }, // Ячейка
          { wch: 15 }, // Тип ячейки
          { wch: 40 }, // Сценарий
          { wch: 20 }, // Дата создания
        ];

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Заказы в Picking");

        // Generate filename
        const filename = `logistics_picking_orders_${new Date().toISOString().split("T")[0]}.xlsx`;

        // Write file
        XLSX.writeFile(wb, filename);
      } else {
        // CSV export
        const headers = Object.keys(data[0]);
        const csvRows = [
          headers.join(","),
          ...data.map((row) =>
            headers
              .map((header) => {
                const value = row[header as keyof typeof row];
                return `"${String(value).replace(/"/g, '""')}"`;
              })
              .join(",")
          ),
        ];

        const csvContent = csvRows.join("\n");
        const bom = "\uFEFF";
        const csvWithBom = bom + csvContent;

        const blob = new Blob([csvWithBom], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `logistics_picking_orders_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (e: any) {
      console.error("Export error:", e);
      alert("Ошибка при экспорте: " + (e.message || "Неизвестная ошибка"));
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--spacing-xl)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--spacing-md)",
          marginBottom: "var(--spacing-md)",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Логистика
        </h1>
        <button
          onClick={() => router.push("/routeplanning")}
          style={{
            padding: "8px 14px",
            background: "#111827",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#1f2937";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#111827";
          }}
          title="Открыть карту маршрутов и live-контроль курьеров"
        >
          🗺 Route Planning
        </button>
      </div>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--spacing-xl)" }}>
        Отправка заказов из picking в OUT (доставка курьером)
      </p>

      {error && (
        <div
          style={{
            background: "#fee",
            border: "1px solid #fcc",
            borderRadius: "var(--radius-md)",
            padding: "var(--spacing-md)",
            marginBottom: "var(--spacing-lg)",
            color: "#c00",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--spacing-xl)" }}>
        {/* Left: Units in picking */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-md)" }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
              Заказы в Picking ({filteredUnits.length}{(selectedCellFilter || searchOrder.trim()) ? ` из ${units.length}` : ""})
            </h2>
            {units.length > 0 && (
              <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
                <button
                  onClick={() => handleExportToExcel("xlsx")}
                  style={{
                    padding: "8px 16px",
                    background: "#10b981",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#059669";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#10b981";
                  }}
                >
                  📊 Excel (XLSX)
                </button>
                <button
                  onClick={() => handleExportToExcel("csv")}
                  style={{
                    padding: "8px 16px",
                    background: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#2563eb";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#3b82f6";
                  }}
                >
                  📄 CSV
                </button>
              </div>
            )}
          </div>

          {/* Search by order (barcode) */}
          <div style={{ marginBottom: "var(--spacing-md)" }}>
            <label
              htmlFor="searchOrder"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: "var(--spacing-xs)",
                color: "var(--color-text)",
              }}
            >
              Поиск по заказу
            </label>
            <input
              id="searchOrder"
              type="text"
              placeholder="Номер заказа (штрихкод)..."
              value={searchOrder}
              onChange={(e) => setSearchOrder(e.target.value)}
              style={{
                width: "100%",
                padding: "var(--spacing-sm) var(--spacing-md)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: 14,
                background: "#fff",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Filter by picking cell */}
          {pickingCells.length > 0 && (
            <div style={{ marginBottom: "var(--spacing-md)" }}>
              <label
                htmlFor="cellFilter"
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: "var(--spacing-xs)",
                  color: "var(--color-text)",
                }}
              >
                Фильтр по ячейке picking:
              </label>
              <select
                id="cellFilter"
                value={selectedCellFilter}
                onChange={(e) => {
                  setSelectedCellFilter(e.target.value);
                  setSelectedUnitIds(new Set());
                  setSelectedUnit(null);
                }}
                style={{
                  width: "100%",
                  padding: "var(--spacing-sm) var(--spacing-md)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 14,
                  background: "#fff",
                }}
              >
                <option value="">Все ячейки picking</option>
                {pickingCells.map((cell) => (
                  <option key={cell.id} value={cell.id}>
                    {cell.code}{cell.meta?.description ? ` (${cell.meta.description})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {loading ? (
            <div style={{ display: "grid", gap: "var(--spacing-md)" }}>
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`skeleton-${idx}`}
                  style={{
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--spacing-md)",
                    display: "flex",
                    gap: "var(--spacing-sm)",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      marginTop: 2,
                      borderRadius: 4,
                      background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                      backgroundSize: "200% 100%",
                      animation: "logisticsSkeleton 1.2s ease-in-out infinite",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 16,
                        width: "50%",
                        borderRadius: 6,
                        marginBottom: 10,
                        background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                        backgroundSize: "200% 100%",
                        animation: "logisticsSkeleton 1.2s ease-in-out infinite",
                      }}
                    />
                    <div
                      style={{
                        height: 12,
                        width: "75%",
                        borderRadius: 6,
                        marginBottom: 8,
                        background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                        backgroundSize: "200% 100%",
                        animation: "logisticsSkeleton 1.2s ease-in-out infinite",
                      }}
                    />
                    <div
                      style={{
                        height: 12,
                        width: "38%",
                        borderRadius: 6,
                        background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                        backgroundSize: "200% 100%",
                        animation: "logisticsSkeleton 1.2s ease-in-out infinite",
                      }}
                    />
                  </div>
                </div>
              ))}
              <style>{`
                @keyframes logisticsSkeleton {
                  0% { background-position: 200% 0; }
                  100% { background-position: -200% 0; }
                }
              `}</style>
            </div>
          ) : filteredUnits.length === 0 ? (
            <div
              style={{
                background: "#f9f9f9",
                border: "1px solid #ddd",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-lg)",
                textAlign: "center",
                color: "#666",
              }}
            >
              {searchOrder.trim()
                ? `По запросу «${searchOrder.trim()}» ничего не найдено`
                : selectedCellFilter
                  ? "Нет заказов в выбранной ячейке"
                  : "Нет заказов в picking"}
            </div>
          ) : (
            <>
              {selectedUnitIds.size > 0 && (
                <div
                  style={{
                    background: "#e0f2fe",
                    border: "2px solid #0284c7",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--spacing-sm) var(--spacing-md)",
                    marginBottom: "var(--spacing-md)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0284c7",
                  }}
                >
                  Выбрано заказов: {selectedUnitIds.size}
                </div>
              )}
              <div style={{ display: "grid", gap: "var(--spacing-md)" }}>
                {filteredUnits.map((unit) => {
                  const isSelected = selectedUnit?.id === unit.id;
                  const isBatchSelected = selectedUnitIds.has(unit.id);
                  const cellDescription = unit.cell?.meta?.description
                    ? ` (${unit.cell.meta.description})`
                    : "";

                  return (
                    <div
                      key={unit.id}
                      style={{
                        background: isSelected || isBatchSelected ? "#e0f2fe" : "#fff",
                        border:
                          isSelected || isBatchSelected ? "2px solid #0284c7" : "1px solid #ddd",
                        borderRadius: "var(--radius-md)",
                        padding: "var(--spacing-md)",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        gap: "var(--spacing-sm)",
                        alignItems: "flex-start",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected && !isBatchSelected) {
                          e.currentTarget.style.background = "#f9f9f9";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected && !isBatchSelected) {
                          e.currentTarget.style.background = "#fff";
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isBatchSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleUnit(unit.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          cursor: "pointer",
                          width: 18,
                          height: 18,
                          marginTop: 2,
                          flexShrink: 0,
                        }}
                      />
                      <div
                        style={{ flex: 1 }}
                        onClick={() => handleSelectUnit(unit)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                              📦 {unit.barcode}
                            </div>
                            <div style={{ fontSize: 13, color: "#666" }}>
                              Ячейка: {unit.cell?.code || "—"}{cellDescription} • {formatDate(unit.created_at)}
                            </div>
                            {unit.scenario && (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#0284c7",
                                  marginTop: 6,
                                  padding: "4px 8px",
                                  background: "#e0f2fe",
                                  borderRadius: 4,
                                  display: "inline-block",
                                }}
                              >
                                📋 {unit.scenario}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Right: Ship out form */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: "var(--spacing-md)" }}>
            {selectedUnitIds.size > 0
              ? `Отправка заказов (${selectedUnitIds.size})`
              : "Отправка заказа"}
          </h2>
          {lastShipment && (
            <div
              style={{
                background: "#ecfdf5",
                border: "1px solid #86efac",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-md)",
                marginBottom: "var(--spacing-md)",
              }}
            >
              <div style={{ fontSize: 12, color: "#166534", marginBottom: 4 }}>
                Последняя отправка
              </div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Заказ: {lastShipment.unitLabel}
              </div>
              <div style={{ fontSize: 14 }}>
                Назначенный курьер: {lastShipment.courierName}
              </div>
              <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>
                {formatDate(lastShipment.sentAt)}
              </div>
            </div>
          )}

          {!selectedUnit && selectedUnitIds.size === 0 ? (
            <div
              style={{
                background: "#f9f9f9",
                border: "1px solid #ddd",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-lg)",
                textAlign: "center",
                color: "#666",
              }}
            >
              Выберите заказ(ы) слева
            </div>
          ) : selectedUnitIds.size > 0 ? (
            /* Batch mode */
            <div
              style={{
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-lg)",
              }}
            >
              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Выбрано заказов</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {selectedUnitIds.size} {selectedUnitIds.size === 1 ? "заказ" : selectedUnitIds.size < 5 ? "заказа" : "заказов"}
                </div>
              </div>

              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <label
                  htmlFor="courierSelectBatch"
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: "var(--spacing-xs)",
                    color: "var(--color-text)",
                  }}
                >
                  Курьер (role: courier) <span style={{ color: "red" }}>*</span>
                </label>
                <select
                  id="courierSelectBatch"
                  value={selectedCourierUserId}
                  onChange={(e) => setSelectedCourierUserId(e.target.value)}
                  disabled={shipping || loadingCouriers}
                  style={{
                    width: "100%",
                    padding: "var(--spacing-sm) var(--spacing-md)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 14,
                    background: "#fff",
                  }}
                >
                  <option value="">{loadingCouriers ? "Загрузка курьеров..." : "Выберите курьера"}</option>
                  {couriers.map((courier) => (
                    <option key={courier.id} value={courier.id}>
                      {courier.full_name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                  Можно выбрать курьера из справочника или ввести имя вручную.
                </div>
                <div style={{ marginTop: 10 }}>
                  <label
                    htmlFor="manualCourierNameBatch"
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 6,
                      color: "var(--color-text)",
                    }}
                  >
                    Ручной ввод имени курьера
                  </label>
                  <input
                    id="manualCourierNameBatch"
                    type="text"
                    value={manualCourierName}
                    onChange={(e) => setManualCourierName(e.target.value)}
                    placeholder="Например: Али Мамедов"
                    disabled={shipping}
                    style={{
                      width: "100%",
                      padding: "var(--spacing-sm) var(--spacing-md)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 14,
                    }}
                  />
                </div>
                {selectedCourierName && (
                  <div style={{ fontSize: 13, color: "#065f46", marginTop: 8 }}>
                    Назначен курьер: <strong>{selectedCourierName}</strong>
                  </div>
                )}
                {!selectedCourierName && effectiveCourierName && (
                  <div style={{ fontSize: 13, color: "#065f46", marginTop: 8 }}>
                    Введенный курьер: <strong>{effectiveCourierName}</strong>
                  </div>
                )}
              </div>

              <button
                onClick={handleBatchShipOut}
                disabled={shipping || !effectiveCourierName}
                style={{
                  width: "100%",
                  padding: "var(--spacing-md)",
                  background: shipping || !effectiveCourierName ? "#ccc" : "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: shipping || !effectiveCourierName ? "not-allowed" : "pointer",
                }}
              >
                {shipping ? "Отправка..." : `✓ Отправить все (${selectedUnitIds.size})`}
              </button>

              <button
                onClick={() => {
                  setSelectedUnitIds(new Set());
                  setSelectedCourierUserId("");
                  setManualCourierName("");
                }}
                disabled={shipping}
                style={{
                  width: "100%",
                  padding: "var(--spacing-sm)",
                  background: "transparent",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "var(--radius-md)",
                  fontSize: 14,
                  marginTop: "var(--spacing-sm)",
                  cursor: shipping ? "not-allowed" : "pointer",
                }}
              >
                Отмена
              </button>
            </div>
          ) : selectedUnit ? (
            /* Single mode (existing behavior) */
            <div
              style={{
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-lg)",
              }}
            >
              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Заказ</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{selectedUnit?.barcode || "—"}</div>
              </div>

              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Ячейка</div>
                <div style={{ fontSize: 14 }}>{selectedUnit?.cell?.code || "—"}</div>
              </div>

              {selectedUnit?.scenario && (
                <div style={{ marginBottom: "var(--spacing-lg)" }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Сценарий (OPS)</div>
                  <div
                    style={{
                      fontSize: 13,
                      padding: "var(--spacing-sm)",
                      background: "#f9f9f9",
                      borderRadius: "var(--radius-sm)",
                      color: "#333",
                    }}
                  >
                    {selectedUnit?.scenario}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <label
                  htmlFor="courierSelect"
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: "var(--spacing-xs)",
                    color: "var(--color-text)",
                  }}
                >
                  Курьер (role: courier) <span style={{ color: "red" }}>*</span>
                </label>
                <select
                  id="courierSelect"
                  value={selectedCourierUserId}
                  onChange={(e) => setSelectedCourierUserId(e.target.value)}
                  disabled={shipping || loadingCouriers}
                  style={{
                    width: "100%",
                    padding: "var(--spacing-sm) var(--spacing-md)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 14,
                    background: "#fff",
                  }}
                >
                  <option value="">{loadingCouriers ? "Загрузка курьеров..." : "Выберите курьера"}</option>
                  {couriers.map((courier) => (
                    <option key={courier.id} value={courier.id}>
                      {courier.full_name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                  Можно выбрать курьера из справочника или ввести имя вручную.
                </div>
                <div style={{ marginTop: 10 }}>
                  <label
                    htmlFor="manualCourierNameSingle"
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 6,
                      color: "var(--color-text)",
                    }}
                  >
                    Ручной ввод имени курьера
                  </label>
                  <input
                    id="manualCourierNameSingle"
                    type="text"
                    value={manualCourierName}
                    onChange={(e) => setManualCourierName(e.target.value)}
                    placeholder="Например: Али Мамедов"
                    disabled={shipping}
                    style={{
                      width: "100%",
                      padding: "var(--spacing-sm) var(--spacing-md)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 14,
                    }}
                  />
                </div>
                {selectedCourierName && (
                  <div style={{ fontSize: 13, color: "#065f46", marginTop: 8 }}>
                    Назначен курьер: <strong>{selectedCourierName}</strong>
                  </div>
                )}
                {!selectedCourierName && effectiveCourierName && (
                  <div style={{ fontSize: 13, color: "#065f46", marginTop: 8 }}>
                    Введенный курьер: <strong>{effectiveCourierName}</strong>
                  </div>
                )}
              </div>

              <button
                onClick={handleShipOut}
                disabled={shipping || !effectiveCourierName || !selectedUnit}
                style={{
                  width: "100%",
                  padding: "var(--spacing-md)",
                  background: shipping || !effectiveCourierName || !selectedUnit ? "#ccc" : "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: shipping || !effectiveCourierName || !selectedUnit ? "not-allowed" : "pointer",
                }}
              >
                {shipping ? "Отправка..." : "✓ Готово / Отправить"}
              </button>

              <button
                onClick={() => {
                  setSelectedUnit(null);
                  setSelectedCourierUserId("");
                  setManualCourierName("");
                }}
                disabled={shipping}
                style={{
                  width: "100%",
                  padding: "var(--spacing-sm)",
                  background: "transparent",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "var(--radius-md)",
                  fontSize: 14,
                  marginTop: "var(--spacing-sm)",
                  cursor: shipping ? "not-allowed" : "pointer",
                }}
              >
                Отмена
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
