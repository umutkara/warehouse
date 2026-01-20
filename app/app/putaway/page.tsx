"use client";

import { useEffect, useState } from "react";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  created_at: string;
  cell_id: string | null;
};

type Cell = {
  id: string;
  code: string;
  cell_type: string;
  units_count: number;
};

type UnitWithCell = Unit & {
  current_cell_type: string | null;
};

export default function PutawayPage() {
  const [units, setUnits] = useState<UnitWithCell[]>([]);
  const [allCells, setAllCells] = useState<Cell[]>([]);
  const [targetCells, setTargetCells] = useState<Cell[]>([]);
  const [selectedCellIds, setSelectedCellIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadCells() {
    try {
      const res = await fetch("/api/cells/list", { cache: "no-store" });
      if (!res.ok) {
        console.error("Ошибка загрузки ячеек:", res.status);
        return;
      }
      const json = await res.json();
      const all = json.cells || [];
      setAllCells(all);
      // Фильтруем только storage и shipping ячейки (bin исключаем)
      const allowedCells = all.filter((cell: Cell) => 
        cell.cell_type === "storage" || cell.cell_type === "shipping"
      );
      setTargetCells(allowedCells);
    } catch (e) {
      console.error("Ошибка загрузки ячеек:", e);
    }
  }

  async function load() {
    setErr(null);
    // Загружаем units со статусом bin
    const r = await fetch(`/api/units/list?status=bin`, { cache: "no-store" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? "Ошибка загрузки");
      return;
    }
    const j = await r.json();
    const unitsList: Unit[] = j.units ?? [];
    
    // Загружаем все ячейки для сопоставления
    const cellsRes = await fetch("/api/cells/list", { cache: "no-store" });
    const cellsJson = await cellsRes.json().catch(() => ({ cells: [] }));
    const cellsList: Cell[] = cellsJson.cells || [];
    const cellsMap = new Map<string, Cell>(cellsList.map((c: Cell) => [c.id, c]));
    
    // Фильтруем только units, которые находятся в BIN-ячейках
    const unitsInBin: UnitWithCell[] = unitsList
      .map((u) => {
        const cell: Cell | undefined = u.cell_id ? cellsMap.get(u.cell_id) : undefined;
        return {
          ...u,
          current_cell_type: cell?.cell_type || null,
        };
      })
      .filter((u) => u.current_cell_type === "bin");
    
    setUnits(unitsInBin);
  }

  async function moveFromBin(id: string) {
    setLoading(true);
    setErr(null);
    try {
      const selectedCellId = selectedCellIds[id];

      if (!selectedCellId) {
        setErr("Выберите целевую ячейку");
        setLoading(false);
        return;
      }

      // Получаем текущий unit и его ячейку
      const currentUnit = units.find(u => u.id === id);
      if (!currentUnit) {
        setErr("Unit не найден");
        setLoading(false);
        return;
      }

      const fromType = currentUnit.current_cell_type;

      // Защитная проверка: нельзя перемещать в bin из storage/shipping
      const selectedCell = targetCells.find(c => c.id === selectedCellId);
      if (!selectedCell) {
        setErr("Выбранная ячейка недоступна");
        setLoading(false);
        return;
      }

      const toType = selectedCell.cell_type;

      // Защитная проверка: if (toType === "bin" && fromType !== "bin") -> ошибка
      if (toType === "bin" && fromType !== "bin") {
        setErr("Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона");
        setLoading(false);
        return;
      }

      // Определяем toStatus по cell_type целевой ячейки
      const toStatus = selectedCell.cell_type === "storage" 
        ? "stored" 
        : selectedCell.cell_type === "shipping"
        ? "shipping"
        : null;

      if (!toStatus) {
        setErr("Недопустимый тип целевой ячейки");
        setLoading(false);
        return;
      }

      const assignRes = await fetch("/api/units/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unitId: id, toStatus, cellId: selectedCellId }),
      });

      if (!assignRes.ok) {
        const assignData = await assignRes.json().catch(() => ({}));
        throw new Error(assignData.error ?? "Не удалось назначить ячейку");
      }

      // Обновляем списки после успешного перемещения
      await load();
      await loadCells();

      // Очищаем выбранную ячейку для этого unit
      setSelectedCellIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e: any) {
      setErr(e.message ?? "Ошибка перемещения");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadCells();
  }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Размещение</h2>
        <button onClick={load} style={{ marginLeft: "auto" }}>
          Обновить
        </button>
      </div>

      {err && <div style={{ color: "crimson" }}>{err}</div>}

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Заказы в BIN (для размещения в storage или shipping)</div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Штрихкод</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Создан</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{u.barcode}</td>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
                  {new Date(u.created_at).toLocaleString()}
                </td>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
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
                      <option value="">Выберите целевую ячейку...</option>
                      {targetCells.map((cell) => (
                        <option key={cell.id} value={cell.id}>
                          {cell.code} — {cell.units_count}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => moveFromBin(u.id)}
                      disabled={loading || !selectedCellIds[u.id]}
                    >
                      Переместить
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {units.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 8, color: "#666" }}>
                  Нет заказов в BIN
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}