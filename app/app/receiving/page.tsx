"use client";

import { useEffect, useMemo, useState } from "react";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  created_at: string;
  cell_id?: string | null;
};

type Cell = {
  id: string;
  code: string;
  cell_type: string;
  units_count: number;
};

export default function ReceivingPage() {
  const [digits, setDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [selectedCellIds, setSelectedCellIds] = useState<Record<string, string>>({});

  const sanitized = useMemo(() => digits.replace(/[^\d]/g, ""), [digits]);

  async function loadCells() {
    try {
      const res = await fetch("/api/cells/list", { cache: "no-store" });
      if (!res.ok) {
        console.error("Ошибка загрузки ячеек:", res.status);
        return;
      }
      const json = await res.json();
      // Фильтруем только bin ячейки
      const binCells = (json.cells || []).filter((cell: Cell) => cell.cell_type === "bin");
      setCells(binCells);
    } catch (e) {
      console.error("Ошибка загрузки ячеек:", e);
    }
  }

  async function loadLatest() {
    setError(null);
    const res = await fetch("/api/units/latest", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "failed_to_load");
      return;
    }
    setUnits(json.units);
  }

  useEffect(() => {
    loadLatest();
    loadCells();
  }, []);

  async function createUnit() {
    setError(null);
    if (!sanitized || sanitized.length < 3) {
      setError("Enter at least 3 digits");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/units/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digits: sanitized }),
    });
    const json = await res.json();
    setLoading(false);

    if (!json.ok) {
      setError(json.error || "create_failed");
      return;
    }

    setDigits("");
    await loadLatest();
  }

  async function moveToStored(id: string) {
    setLoading(true);
    setError(null);
    try {
      const selectedCellId = selectedCellIds[id];

      if (!selectedCellId) {
        setError("Выберите целевую ячейку");
        setLoading(false);
        return;
      }

      // Получаем текущий unit (если есть)
      const currentUnit = units.find(u => u.id === id);
      const fromType = currentUnit?.cell_id 
        ? cells.find(c => c.id === currentUnit.cell_id)?.cell_type || null
        : null;

      // Защитная проверка: убеждаемся, что выбранная ячейка - это bin
      const selectedCell = cells.find(c => c.id === selectedCellId);
      if (!selectedCell || selectedCell.cell_type !== "bin") {
        setError("Можно размещать только в BIN-ячейки");
        setLoading(false);
        return;
      }

      const toType = selectedCell.cell_type;

      // Защитная проверка: if (toType === "bin" && fromType !== "bin") -> ошибка
      if (toType === "bin" && fromType !== "bin" && fromType !== null) {
        setError("Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/units/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: id, toStatus: "receiving", cellId: selectedCellId }),
      });

      const text = await res.text();
      let assignData: any = null;
      try {
        assignData = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        console.error("Ошибка API units/assign:", assignData ?? text);
        throw new Error(assignData?.error || text || `units/assign failed: ${res.status}`);
      }

      // Обновляем списки после успешного перемещения
      await loadLatest();
      await loadCells();

      // Очищаем выбранную ячейку для этого unit
      setSelectedCellIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

    } catch (e: any) {
      console.error("Ошибка в moveToStored:", e);
      setError(e.message ?? "Ошибка перемещения");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Приёмка</h2>

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <input
          placeholder="Введите цифры для создания заказа"
          value={digits}
          onChange={(e) => setDigits(e.target.value)}
          style={{ width: 280 }}
        />
        <button onClick={createUnit} disabled={loading}>
          {loading ? "Создание..." : "Создать заказ"}
        </button>
        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </div>

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Последние заказы</div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Штрихкод</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Статус</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Создан</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{u.barcode}</td>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{u.status}</td>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
                  {new Date(u.created_at).toLocaleString()}
                </td>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
                  {u.status === "receiving" && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select
                        value={selectedCellIds[u.id] || ""}
                        onChange={(e) => {
                          setSelectedCellIds((prev) => ({
                            ...prev,
                            [u.id]: e.target.value,
                          }));
                        }}
                        style={{ padding: 6, minWidth: 200 }}
                      >
                        <option value="">Выберите ячейку...</option>
                        {cells.map((cell) => (
                          <option key={cell.id} value={cell.id}>
                            {cell.code} — {cell.units_count}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => moveToStored(u.id)}
                        disabled={loading || !selectedCellIds[u.id]}
                      >
                        Разместить в приёмку
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!units.length && (
              <tr>
                <td colSpan={4} style={{ padding: 8, color: "#666" }}>Пока нет заказов</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}