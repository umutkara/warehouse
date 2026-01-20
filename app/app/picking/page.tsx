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

export default function PickingPage() {
  const [units, setUnits] = useState<UnitWithCell[]>([]);
  const [storageCells, setStorageCells] = useState<Cell[]>([]);
  const [shippingCells, setShippingCells] = useState<Cell[]>([]);
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
      const allCells: Cell[] = json.cells || [];
      // Фильтруем storage и shipping ячейки (bin исключаем)
      const storage = allCells.filter((cell: Cell) => cell.cell_type === "storage");
      const shipping = allCells.filter((cell: Cell) => cell.cell_type === "shipping");
      setStorageCells(storage);
      setShippingCells(shipping);
    } catch (e) {
      console.error("Ошибка загрузки ячеек:", e);
    }
  }

  async function load() {
    setErr(null);
    // Загружаем units из storage (stored) и shipping (shipping)
    const [storageRes, shippingRes] = await Promise.all([
      fetch(`/api/units/list?status=stored`, { cache: "no-store" }),
      fetch(`/api/units/list?status=shipping`, { cache: "no-store" }),
    ]);
    
    const storageJson = await storageRes.json().catch(() => ({}));
    const shippingJson = await shippingRes.json().catch(() => ({}));
    
    const storageUnits: Unit[] = storageJson.units ?? [];
    const shippingUnits: Unit[] = shippingJson.units ?? [];
    const allUnits = [...storageUnits, ...shippingUnits];
    
    // Загружаем все ячейки для сопоставления
    const cellsRes = await fetch("/api/cells/list", { cache: "no-store" });
    const cellsJson = await cellsRes.json().catch(() => ({ cells: [] }));
    const cellsList: Cell[] = cellsJson.cells || [];
    const cellsMap = new Map<string, Cell>(cellsList.map((c: Cell) => [c.id, c]));
    
    // Фильтруем только units, которые находятся в storage или shipping ячейках
    const unitsInStorageOrShipping: UnitWithCell[] = allUnits
      .map((u) => {
        const cell: Cell | undefined = u.cell_id ? cellsMap.get(u.cell_id) : undefined;
        return {
          ...u,
          current_cell_type: cell?.cell_type || null,
        };
      })
      .filter((u) => u.current_cell_type === "storage" || u.current_cell_type === "shipping");
    
    setUnits(unitsInStorageOrShipping);
  }

  async function moveBetweenStorageAndShipping(id: string) {
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
      const allCells = [...storageCells, ...shippingCells];
      const selectedCell = allCells.find(c => c.id === selectedCellId);
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

      // Определяем целевую ячейку и статус
      let toStatus: string;
      if (selectedCell.cell_type === "storage") {
        toStatus = "stored";
      } else if (selectedCell.cell_type === "shipping") {
        toStatus = "shipping";
      } else {
        setErr("Недопустимый тип целевой ячейки");
        setLoading(false);
        return;
      }

      // Разрешаем перемещения: storage ⇄ shipping
      // storage -> shipping: OK
      // shipping -> storage: OK
      // bin -> storage/shipping: не должно быть здесь (это в Putaway)
      if (fromType !== "storage" && fromType !== "shipping") {
        setErr("Можно перемещать только из storage или shipping");
        setLoading(false);
        return;
      }

      const r = await fetch("/api/units/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unitId: id, toStatus, cellId: selectedCellId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const errorText = j.error || "Не удалось переместить";
        throw new Error(errorText);
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
        <h2 style={{ margin: 0 }}>Сборка</h2>
        <button onClick={load} style={{ marginLeft: "auto" }}>Обновить</button>
      </div>

      {err && <div style={{ color: "crimson" }}>{err}</div>}

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Заказы в storage и shipping (перемещения в обе стороны)</div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Штрихкод</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Текущая ячейка</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Создан</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              // Определяем доступные целевые ячейки в зависимости от текущей
              // Если fromType = storage -> показывать storage + shipping (включая storage для внутренних перемещений)
              // Если fromType = shipping -> показывать shipping + storage (включая shipping для внутренних перемещений)
              // Никогда не показывать bin
              const availableCells = u.current_cell_type === "storage" 
                ? [...storageCells, ...shippingCells] // storage + shipping
                : u.current_cell_type === "shipping"
                ? [...shippingCells, ...storageCells] // shipping + storage
                : [];
              
              return (
                <tr key={u.id}>
                  <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{u.barcode}</td>
                  <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
                    <span style={{ 
                      color: u.current_cell_type === "storage" ? "#0066cc" : "#cc6600",
                      fontWeight: 500 
                    }}>
                      {u.current_cell_type === "storage" ? "storage" : u.current_cell_type === "shipping" ? "shipping" : "—"}
                    </span>
                  </td>
                  <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{new Date(u.created_at).toLocaleString()}</td>
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
                        {availableCells.map((cell) => (
                          <option key={cell.id} value={cell.id}>
                            {cell.code} — {cell.units_count}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => moveBetweenStorageAndShipping(u.id)}
                        disabled={loading || !selectedCellIds[u.id]}
                      >
                        Переместить
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {units.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 8, color: "#666" }}>Нет заказов в storage или shipping</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}