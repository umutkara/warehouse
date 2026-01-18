"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUIStore, type Zone } from "@/lib/ui/store";
import { getCellColor } from "@/lib/ui/cellColors";

type Cell = {
  id: string;
  warehouse_id: string;
  code: string;
  cell_type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  is_active: boolean;
  meta?: any;
  units_count: number;
  calc_status: string;
};

// Константа для размера ячеек (все ячейки одинаковые квадратные)
const CELL_SIZE = 70;

function cellBg(cell: any) {
  return getCellColor(cell.cell_type, cell.meta);
}

function StatPill({ label, value, onClick }: { label: string; value?: number; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: "1px solid #eee",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        background: "#fafafa",
        display: "flex",
        gap: 6,
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.background = "#f0f0f0")}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.background = "#fafafa")}
    >
      <span style={{ color: "#666" }}>{label}</span>
      <b style={{ color: "#111" }}>{typeof value === "number" ? value : "-"}</b>
    </div>
  );
}

function cellColor(cellType: string, status: string) {
  // blocked всегда важнее
  if (status === "blocked") return "#ffdddd";

  switch (cellType) {
    case "receiving": return "#dbeafe";
    case "transfer":  return "#f3e8ff";
    case "storage":   return "#dcfce7";
    case "shipping":  return "#ffedd5";
    default:          return "#f3f4f6";
  }
}

function borderColor(status: string) {
  if (status === "occupied") return "#2563eb";
  if (status === "blocked") return "#dc2626";
  return "#9ca3af";
}

export default function WarehouseMapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cells, setCells] = useState<Cell[]>([]);
  const [role, setRole] = useState<string>("guest");
  const [newCode, setNewCode] = useState("");
  const [newCellType, setNewCellType] = useState<"bin" | "storage" | "picking" | "shipping">("storage");
  const [selectedCell, setSelectedCell] = useState<any>(null);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [cellUnits, setCellUnits] = useState<any[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [unitMoves, setUnitMoves] = useState<any[]>([]);
  const [loadingMoves, setLoadingMoves] = useState(false);
  const [searchBarcode, setSearchBarcode] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [highlightCellId, setHighlightCellId] = useState<string | null>(null);
  const [moveTargetCell, setMoveTargetCell] = useState<any>(null);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [zoneStats, setZoneStats] = useState<any>(null);
  const ZONES: Zone[] = ["receiving", "bin", "storage", "shipping", "transfer"];

  const ZONE_LABEL: Record<string, string> = {
    receiving: "Приёмка",
    bin: "Сортировка",
    storage: "Хранение",
    shipping: "Отгрузка",
    transfer: "Передача",
  };

  const zoneFilters = useUIStore((state) => state.zoneFilters);
  const setOnlyZone = useUIStore((state) => state.setOnlyZone);
  const toggleZone = useUIStore((state) => state.toggleZone);

  const [err, setErr] = useState<string | null>(null);

  const canEdit = ["manager", "head", "admin"].includes(role);

  const [dragId, setDragId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  
  // Используем useRef для отслеживания последнего загруженного cellId, чтобы избежать повторных загрузок
  const lastLoadedCellIdRef = useRef<string | null>(null);

  async function loadCells() {
    const r = await fetch("/api/cells/list", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error ?? "Ошибка загрузки");
      return;
    }
    setCells(j.cells ?? []);
  }

  async function loadUnassigned() {
    const r = await fetch("/api/units/unassigned");
    const j = await r.json();
    setUnassigned(j.units ?? []);
  }

  async function loadCellUnits(cellId: string) {
    setLoadingUnits(true);
    try {
      const r = await fetch(`/api/cells/units?cellId=${cellId}`);
      const j = await r.json();
      setCellUnits(j.units ?? []);
    } finally {
      setLoadingUnits(false);
    }
  }

  async function loadUnitMoves(unitId: string) {
    setLoadingMoves(true);
    try {
      const r = await fetch(`/api/audit/unit?unitId=${encodeURIComponent(unitId)}`);
      const j = await r.json().catch(() => ({}));
      setUnitMoves(j.moves ?? []);
    } finally {
      setLoadingMoves(false);
    }
  }

  async function findByBarcode() {
    setSearchMsg(null);
    const b = searchBarcode.trim();
    if (!b) return;

    const r = await fetch(`/api/units/find?barcode=${encodeURIComponent(b)}`);
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      setHighlightCellId(null);
      setSearchMsg(j.error ?? "Ошибка поиска");
      return;
    }

    if (!j.cell) {
      setHighlightCellId(null);
      setSearchMsg(j.message ?? "Заказ найден, но ячейка не назначена");
      return;
    }

    setHighlightCellId(j.cell.id);
    setSearchMsg(`Найдено: ${j.unit.barcode} → ${j.cell.code} (${j.cell.cell_type})`);

    setSelectedCell(j.cell);
    await loadCellUnits(j.cell.id);

    const cellType = j.cell.cell_type as Zone;
    if (ZONES.includes(cellType) && zoneFilters[cellType] === false) {
      toggleZone(cellType);
    }
  }

  async function loadRole() {
    const r = await fetch("/api/me");
    const j = await r.json();
    setRole(j.role ?? "guest");
  }

  async function loadZoneStats() {
    const r = await fetch("/api/stats/zones");
    const j = await r.json().catch(() => ({}));
    if (r.ok) setZoneStats(j);
  }

  useEffect(() => {
    loadCells();
    loadRole();
    loadZoneStats();
    // Увеличиваем интервал до 30 секунд, чтобы значительно уменьшить нагрузку
    const t = setInterval(() => {
      loadCells();
      loadZoneStats();
    }, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const cellIdParam = searchParams.get("cellId");
    if (cellIdParam && cells.length > 0) {
      const targetCell = cells.find((c) => c.id === cellIdParam);
      if (targetCell && lastLoadedCellIdRef.current !== cellIdParam) {
        lastLoadedCellIdRef.current = cellIdParam;
        setSelectedCell(targetCell);
        setMoveTargetCell(null);
        setSelectedUnit(null);
        setUnitMoves([]);
        setHighlightCellId(targetCell.id);
        loadCellUnits(targetCell.id);
        loadUnassigned();
      }
    } else if (!cellIdParam) {
      lastLoadedCellIdRef.current = null;
    }
  }, [searchParams, cells]);

  const visibleCells = cells.filter((c) => zoneFilters[c.cell_type as Zone] !== false);

  return (
    <div style={{ height: "calc(100vh - 120px)", display: "flex" }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <input
            placeholder="Поиск по штрихкоду"
            value={searchBarcode}
            onChange={(e) => setSearchBarcode(e.target.value)}
            style={{ padding: 10, width: 260 }}
          />
          <button onClick={findByBarcode} disabled={!searchBarcode.trim()}>
            Найти
          </button>
          {searchMsg && <div style={{ fontSize: 12, color: searchMsg.includes("Ошибка") ? "crimson" : "#111" }}>{searchMsg}</div>}
        </div>

        <h2>Карта склада</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Сводка:</div>

          <StatPill label="Приёмка" value={zoneStats?.counts?.receiving} onClick={() => setOnlyZone("receiving")} />
          <StatPill label="Сортировка" value={zoneStats?.counts?.bin} onClick={() => setOnlyZone("bin")} />
          <StatPill label="Хранение" value={zoneStats?.counts?.storage} onClick={() => setOnlyZone("storage")} />
          <StatPill label="Отгрузка" value={zoneStats?.counts?.shipping} onClick={() => setOnlyZone("shipping")} />
          <StatPill label="Передача" value={zoneStats?.counts?.transfer} onClick={() => setOnlyZone("transfer")} />

          <StatPill label="Не размещено" value={zoneStats?.unplaced} />
          <StatPill label="Всего" value={zoneStats?.total} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {ZONES.map((z) => (
            <label key={z} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={zoneFilters[z]}
                onChange={() => toggleZone(z)}
              />
              {ZONE_LABEL[z]}
            </label>
          ))}
        </div>

      {["manager", "head", "admin"].includes(role) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <input
            placeholder="Cell code (A1, B2...)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            style={{ padding: 8 }}
          />
          <select
            value={newCellType}
            onChange={(e) => setNewCellType(e.target.value as typeof newCellType)}
            style={{ padding: 8 }}
          >
            <option value="bin">Bin</option>
            <option value="storage">Storage</option>
            <option value="picking">Picking</option>
            <option value="shipping">Shipping</option>
          </select>
          <button
            onClick={async () => {
              if (!newCode.trim()) return;
              const r = await fetch("/api/cells/create", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ code: newCode, cellType: newCellType }),
              });
              const j = await r.json().catch(() => ({}));
              if (r.ok) {
                await loadCells(); // Refresh from API
                setNewCode("");
              } else {
                alert(j.error ?? "Ошибка создания ячейки");
              }
            }}
          >
            Add cell
          </button>
        </div>
      )}

      {err && <div style={{ color: "crimson" }}>{err}</div>}

      <div
        onMouseMove={(e) => {
          if (!dragId) return;
          setCells((prev) =>
            prev.map((c) =>
              c.id === dragId
                ? { ...c, x: e.clientX - offset.x, y: e.clientY - offset.y }
                : c
            )
          );
        }}
        onMouseUp={async () => {
          if (!dragId) return;
          const cell = cells.find((c) => c.id === dragId);
          setDragId(null);
          if (!cell) return;

          await fetch("/api/cells/update", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: cell.id, x: cell.x, y: cell.y }),
          });
        }}
        style={{
          position: "relative",
          background: "#fff",
          border: "1px solid #ddd",
          height: "100%",
          borderRadius: 12,
        }}
      >
        {visibleCells.map((c) => (
          <div
            key={c.id}
            onMouseDown={(e) => {
              if (!canEdit) return;
              setDragId(c.id);
              setOffset({
                x: e.clientX - c.x,
                y: e.clientY - c.y,
              });
            }}
            onClick={(e) => {
              setMoveMsg(null);

              if (selectedUnit) {
                setMoveTargetCell(c);
                return;
              }

              // Двойной клик - переход на страницу ячейки
              if (e.detail === 2) {
                router.push(`/app/cells/${c.id}`);
                return;
              }

              // Одинарный клик - выбор ячейки в панели
              setSelectedCell(c);
              setMoveTargetCell(null);
              setSelectedUnit(null);
              setUnitMoves([]);
              setHighlightCellId(c.id); // Подсветка при клике
              loadCellUnits(c.id);
              loadUnassigned();
            }}
            style={{
              position: "absolute",
              left: c.x,
              top: c.y,
              width: CELL_SIZE,
              height: CELL_SIZE,
              background: cellBg(c),
              border: `2px solid ${borderColor(c.calc_status)}`,
              outline: highlightCellId === c.id ? "3px solid #ff9800" : "none",
              boxShadow: highlightCellId === c.id ? "0 0 0 3px rgba(255,152,0,0.25)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              cursor: canEdit ? "move" : "pointer",
              userSelect: "none",
              borderRadius: 8,
            }}
            title={`${c.code} (${c.cell_type}) - ${c.units_count} units (${c.calc_status})`}
          >
            <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.code}</div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{c.cell_type}</div>
              {c.units_count > 0 && (
                <div style={{
                  marginTop: 4,
                  background: "#111", color: "#fff",
                  fontSize: 11, padding: "2px 6px", borderRadius: 999
                }}>
                  {c.units_count}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      </div>

      {selectedCell && (
        <div style={{ width: 360, borderLeft: "1px solid #ddd", padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            Ячейка: {selectedCell.code}
          </div>

          <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
            Зона: {selectedCell.cell_type} • Заказов: {selectedCell.units_count}
          </div>

          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => router.push(`/app/cells/${selectedCell.id}`)}
              style={{
                padding: "8px 16px",
                background: "#0066cc",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Открыть ячейку
            </button>
          </div>

          {/* Block/Unblock button for managers */}
          {["manager", "head", "admin"].includes(role) && (
            <div style={{ marginBottom: 12 }}>
              {(() => {
                const isBlocked = selectedCell?.meta?.blocked === true;
                return (
                  <button
                    onClick={async () => {
                      const r = await fetch("/api/cells/block", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ cellId: selectedCell.id, blocked: !isBlocked }),
                      });
                      if (!r.ok) {
                        const j = await r.json().catch(() => ({}));
                        alert(j.error ?? "Не удалось");
                        return;
                      }
                      await loadCells(); // Обновляем цвета/счётчики
                      const fresh = (await fetch("/api/cells/list").then(r=>r.json())).cells?.find((x:any)=>x.id===selectedCell.id);
                      if (fresh) setSelectedCell(fresh);
                    }}
                    style={{
                      padding: "8px 16px",
                      background: isBlocked ? "#dc2626" : "#16a34a",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    {isBlocked ? "Разблокировать" : "Заблокировать"}
                  </button>
                );
              })()}
            </div>
          )}

          {["head", "admin"].includes(role) && (
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={async () => {
                  if (!confirm(`Удалить ячейку ${selectedCell.code}? Это действие нельзя отменить.`)) {
                    return;
                  }
                  
                  const r = await fetch("/api/cells/delete", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ cellId: selectedCell.id }),
                  });
                  
                  const j = await r.json().catch(() => ({}));
                  
                  if (!r.ok) {
                    alert(j.error ?? "Ошибка удаления ячейки");
                    return;
                  }
                  
                  alert("Ячейка успешно удалена");
                  setSelectedCell(null);
                  await loadCells();
                }}
                style={{
                  padding: "8px 16px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                🗑️ Удалить ячейку
              </button>
            </div>
          )}

          <div style={{ fontWeight: 700, marginBottom: 6 }}>Содержимое</div>

          {loadingUnits ? (
            <div style={{ fontSize: 12, color: "#666" }}>Загрузка…</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 420, overflow: "auto" }}>
              {cellUnits.length === 0 && (
                <div style={{ fontSize: 12, color: "#666" }}>Пусто</div>
              )}

              {cellUnits.map((u) => (
                <div
                  key={u.id}
                  onClick={() => {
                    setSelectedUnit(u);
                    loadUnitMoves(u.id);
                  }}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: 10,
                    cursor: "pointer",
                    background: selectedUnit?.id === u.id ? "#fff8e1" : "#fff",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{u.barcode}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {new Date(u.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14, fontWeight: 800 }}>История перемещений</div>

          {!selectedUnit ? (
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Выберите заказ выше, чтобы увидеть историю.
            </div>
          ) : loadingMoves ? (
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Загрузка…</div>
          ) : unitMoves.length === 0 ? (
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Истории пока нет.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, marginTop: 8, maxHeight: 260, overflow: "auto" }}>
              {unitMoves.map((m) => (
                <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#111" }}>{m.note ?? "Событие"}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {new Date(m.created_at).toLocaleString()} → {m.source}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedUnit && moveTargetCell && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
              <div style={{ fontWeight: 800 }}>Перемещение</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Заказ: <b>{selectedUnit.barcode}</b>
                <br />
                Цель: <b>{moveTargetCell.code}</b> ({moveTargetCell.cell_type})
              </div>

              <button
                style={{ marginTop: 10, width: "100%" }}
                disabled={moving || moveTargetCell.id === selectedUnit.cell_id}
                onClick={async () => {
                  setMoving(true);
                  setMoveMsg(null);
                  try {
                    const r = await fetch("/api/units/move", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ unitId: selectedUnit.id, toCellId: moveTargetCell.id }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok) {
                      setMoveMsg(j.error ?? "Ошибка перемещения");
                      return;
                    }

                    setMoveMsg(`Готово: перемещено в ${moveTargetCell.code}`);

                    // Обновляем карту и список заказов
                    await loadCells();

                    // Обновляем список заказов выбранной ячейки
                    if (selectedCell?.id) await loadCellUnits(selectedCell.id);
                    if (moveTargetCell?.id) await loadCellUnits(moveTargetCell.id);

                    // Сбрасываем цель
                    setMoveTargetCell(null);
                    setSelectedUnit(null);
                  } finally {
                    setMoving(false);
                  }
                }}
              >
                Отмена
              </button>

              {moveMsg && (
                <div style={{ marginTop: 8, fontSize: 12, color: moveMsg.startsWith("Готово") ? "#111" : "crimson" }}>
                  {moveMsg}
                </div>
              )}

              <button
                style={{ marginTop: 8, width: "100%" }}
                onClick={() => {
                  setMoveTargetCell(null);
                  setSelectedUnit(null);
                  setUnitMoves([]);
                  setMoveMsg(null);
                }}
              >
                Отмена
              </button>
            </div>
          )}

          {/* Assign unassigned units */}
          <div style={{ display: "grid", gap: 6, maxHeight: 200, overflow: "auto" }}>
            {unassigned.map((u) => (
              <button
                key={u.id}
                onClick={async () => {
                  // Ручной перенос (карта): move_unit(unitId, null, toCellId)
                  const r = await fetch("/api/units/assign", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ unitId: u.id, toStatus: null, cellId: selectedCell.id }),
                  });
                  if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    alert(j.error ?? "Assign failed");
                    return;
                  }
                  // После назначения: обновляем карту, список ячейки и неразмещенные
                  await loadCells();
                  await loadCellUnits(selectedCell.id);
                  await loadUnassigned();
                }}
                style={{ padding: 8, textAlign: "left", border: "1px solid #eee", borderRadius: 6, fontSize: 12 }}
              >
                {u.barcode}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
