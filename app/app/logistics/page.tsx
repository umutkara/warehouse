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
  cell: { id: string; code: string; cell_type: string } | null;
  scenario: string | null;
};

export default function LogisticsPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [courierName, setCourierName] = useState("");
  const [shipping, setShipping] = useState(false);

  useEffect(() => {
    loadUnits();
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
        setUnits(json.units || []);
      } else {
        setError(json.error || "Ошибка загрузки заказов");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleShipOut() {
    if (!selectedUnit || !courierName.trim()) {
      alert("Введите имя курьера");
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
          courierName: courierName.trim(),
        }),
      });

      const json = await res.json();

      if (res.ok && json.ok) {
        alert(`✓ Заказ ${selectedUnit.barcode} отправлен курьером ${courierName}`);
        setSelectedUnit(null);
        setCourierName("");
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

  async function handleExportToExcel(format: "xlsx" | "csv" = "xlsx") {
    if (units.length === 0) {
      alert("Нет заказов для экспорта");
      return;
    }

    try {
      // Prepare data
      const data = units.map((unit) => ({
        "Штрихкод": unit.barcode || "",
        "Статус": unit.status || "",
        "Ячейка": unit.cell?.code || "—",
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
      }));

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
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: "var(--spacing-md)" }}>
        Логистика
      </h1>
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
              Заказы в Picking ({units.length})
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

          {loading ? (
            <div style={{ fontSize: 14, color: "#666" }}>Загрузка...</div>
          ) : units.length === 0 ? (
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
              Нет заказов в picking
            </div>
          ) : (
            <div style={{ display: "grid", gap: "var(--spacing-md)" }}>
              {units.map((unit) => (
                <div
                  key={unit.id}
                  onClick={() => setSelectedUnit(unit)}
                  style={{
                    background: selectedUnit?.id === unit.id ? "#e0f2fe" : "#fff",
                    border: selectedUnit?.id === unit.id ? "2px solid #0284c7" : "1px solid #ddd",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--spacing-md)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedUnit?.id !== unit.id) {
                      e.currentTarget.style.background = "#f9f9f9";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedUnit?.id !== unit.id) {
                      e.currentTarget.style.background = "#fff";
                    }
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                        📦 {unit.barcode}
                      </div>
                      <div style={{ fontSize: 13, color: "#666" }}>
                        Ячейка: {unit.cell?.code || "—"} • {formatDate(unit.created_at)}
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
              ))}
            </div>
          )}
        </div>

        {/* Right: Ship out form */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: "var(--spacing-md)" }}>
            Отправка заказа
          </h2>

          {!selectedUnit ? (
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
              Выберите заказ слева
            </div>
          ) : (
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
                <div style={{ fontSize: 18, fontWeight: 600 }}>{selectedUnit.barcode}</div>
              </div>

              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Ячейка</div>
                <div style={{ fontSize: 14 }}>{selectedUnit.cell?.code || "—"}</div>
              </div>

              {selectedUnit.scenario && (
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
                    {selectedUnit.scenario}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <label
                  htmlFor="courierName"
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: "var(--spacing-xs)",
                    color: "var(--color-text)",
                  }}
                >
                  Имя курьера <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  id="courierName"
                  type="text"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="Введите имя курьера"
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

              <button
                onClick={handleShipOut}
                disabled={shipping || !courierName.trim()}
                style={{
                  width: "100%",
                  padding: "var(--spacing-md)",
                  background: shipping || !courierName.trim() ? "#ccc" : "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: shipping || !courierName.trim() ? "not-allowed" : "pointer",
                }}
              >
                {shipping ? "Отправка..." : "✓ Готово / Отправить"}
              </button>

              <button
                onClick={() => {
                  setSelectedUnit(null);
                  setCourierName("");
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
          )}
        </div>
      </div>
    </div>
  );
}
