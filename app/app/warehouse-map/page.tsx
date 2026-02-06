"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUIStore, type Zone } from "@/lib/ui/store";
import { getCellColor } from "@/lib/ui/cellColors";

// ⚡ Force dynamic for real-time warehouse data
export const dynamic = 'force-dynamic';

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
const CELL_SIZE = 56;

function cellBg(cell: any) {
  return getCellColor(cell.cell_type, cell.meta);
}

function StatPill({ label, value, onClick }: { label: string; value?: number; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: "2px solid #e5e7eb",
        borderRadius: 12,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        background: "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.background = "linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)";
          e.currentTarget.style.borderColor = "#667eea";
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 8px rgba(102, 126, 234, 0.15)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.background = "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)";
          e.currentTarget.style.borderColor = "#e5e7eb";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
        }
      }}
    >
      <span style={{ color: "#6b7280" }}>{label}</span>
      <b style={{ 
        color: "#111",
        fontSize: 14,
        background: "#f3f4f6",
        padding: "2px 8px",
        borderRadius: 6,
      }}>
        {typeof value === "number" ? value : "-"}
      </b>
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
  const [newCellType, setNewCellType] = useState<"bin" | "storage" | "picking" | "shipping" | "surplus" | "rejected" | "ff">("storage");
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
  const ZONES: Zone[] = ["bin", "storage", "shipping", "rejected", "surplus", "ff"];

  const ZONE_LABEL: Record<string, string> = {
    bin: "Сортировка",
    storage: "Хранение",
    shipping: "Отгрузка",
    rejected: "Отклонённые",
    surplus: "Излишки",
    ff: "FF",
  };

  const zoneFilters = useUIStore((state) => state.zoneFilters);
  const setOnlyZone = useUIStore((state) => state.setOnlyZone);
  const toggleZone = useUIStore((state) => state.toggleZone);

  const [err, setErr] = useState<string | null>(null);

  const canEdit = ["manager", "head", "admin"].includes(role);
  const canDragCells = ["worker", "manager", "head", "admin"].includes(role);

  const [dragId, setDragId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Zoom и pan карты (не меняют логику ячеек)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [mapFullscreenOpen, setMapFullscreenOpen] = useState(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.2;

  // Используем useRef для отслеживания последнего загруженного cellId, чтобы избежать повторных загрузок
  const lastLoadedCellIdRef = useRef<string | null>(null);
  const moveLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ⚡ OPTIMIZATION: Memoized load functions
  const loadCells = useCallback(async () => {
    const r = await fetch("/api/cells/list", { 
      next: { revalidate: 30 } // ⚡ Cache for 30 seconds
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error ?? "Ошибка загрузки");
      return;
    }
    const cellsList = j.cells ?? [];
    const overlapGroups = new Map<string, any[]>();
    cellsList.forEach((c: any) => {
      const key = `${c.x}|${c.y}`;
      if (!overlapGroups.has(key)) overlapGroups.set(key, []);
      overlapGroups.get(key)!.push(c);
    });
    const adjustedCells = cellsList.map((c: any) => {
      const key = `${c.x}|${c.y}`;
      const group = overlapGroups.get(key) || [];
      if (group.length <= 1) return c;
      const idx = group.findIndex((g: any) => g.id === c.id);
      const offset = 8 * idx;
      return { ...c, x: c.x + offset, y: c.y + offset };
    });
    setCells(adjustedCells);
  }, []);

  const loadUnassigned = useCallback(async () => {
    const r = await fetch("/api/units/unassigned", {
      next: { revalidate: 10 } // ⚡ Cache for 10 seconds
    });
    const j = await r.json();
    setUnassigned(j.units ?? []);
  }, []);

  const loadCellUnits = useCallback(async (cellId: string) => {
    setLoadingUnits(true);
    try {
      const r = await fetch(`/api/cells/units?cellId=${cellId}`, {
        next: { revalidate: 5 } // ⚡ Cache for 5 seconds
      });
      const j = await r.json();
      setCellUnits(j.units ?? []);
    } finally {
      setLoadingUnits(false);
    }
  }, []);

  async function loadUnitMoves(unitId: string) {
    // ⚡ ОПТИМИЗАЦИЯ: Debounce для предотвращения множественных запросов
    if (moveLoadTimeoutRef.current) {
      clearTimeout(moveLoadTimeoutRef.current);
    }
    
    setLoadingMoves(true);
    
    moveLoadTimeoutRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/audit/unit?unitId=${encodeURIComponent(unitId)}`);
        const j = await r.json().catch(() => ({}));
        setUnitMoves(j.moves ?? []);
      } finally {
        setLoadingMoves(false);
      }
    }, 150); // 150ms debounce
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

  // ⚡ OPTIMIZATION: Memoized filtered cells
  const visibleCells = useMemo(
    () => cells.filter((c) => {
      const zone = c.cell_type as Zone;
      // Показываем ячейки которые не являются зонами (surplus и др.) ИЛИ зоны которые включены
      return !ZONES.includes(zone) || zoneFilters[zone] !== false;
    }),
    [cells, zoneFilters]
  );

  // Размер области карты под формат ячеек (чтобы ни одна ячейка не выходила за границы)
  const MAP_PAD = 24;
  const mapBounds = useMemo(() => {
    if (visibleCells.length === 0) return { width: 400, height: 400 };
    const minX = Math.min(...visibleCells.map((c) => c.x));
    const minY = Math.min(...visibleCells.map((c) => c.y));
    const maxX = Math.max(...visibleCells.map((c) => c.x + (c.w ?? CELL_SIZE)));
    const maxY = Math.max(...visibleCells.map((c) => c.y + (c.h ?? CELL_SIZE)));
    return {
      width: Math.max(400, maxX - minX + 2 * MAP_PAD),
      height: Math.max(400, maxY - minY + 2 * MAP_PAD),
    };
  }, [visibleCells]);

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      
      <div style={{ height: "calc(100vh - 120px)", display: "flex" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16, flexShrink: 0 }}>
          <input
            placeholder="🔍 Поиск по штрихкоду"
            value={searchBarcode}
            onChange={(e) => setSearchBarcode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchBarcode.trim() && findByBarcode()}
            style={{ 
              padding: "10px 14px",
              width: 280,
              borderRadius: 10,
              border: "2px solid #e5e7eb",
              fontSize: 14,
              fontWeight: 500,
              transition: "all 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#667eea";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
            }}
          />
          <button 
            onClick={findByBarcode} 
            disabled={!searchBarcode.trim()}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: searchBarcode.trim() 
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : "#e5e7eb",
              color: searchBarcode.trim() ? "#fff" : "#9ca3af",
              fontSize: 14,
              fontWeight: 600,
              cursor: searchBarcode.trim() ? "pointer" : "not-allowed",
              transition: "all 0.2s",
              boxShadow: searchBarcode.trim() 
                ? "0 2px 8px rgba(102, 126, 234, 0.3)"
                : "none",
            }}
            onMouseEnter={(e) => {
              if (searchBarcode.trim()) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (searchBarcode.trim()) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.3)";
              }
            }}
          >
            Найти
          </button>
          {searchMsg && (
            <div style={{ 
              fontSize: 13, 
              fontWeight: 500,
              color: searchMsg.includes("Ошибка") ? "#dc2626" : "#059669",
              padding: "8px 12px",
              borderRadius: 8,
              background: searchMsg.includes("Ошибка") 
                ? "#fef2f2"
                : "#f0fdf4",
              border: `1px solid ${searchMsg.includes("Ошибка") ? "#fecaca" : "#bbf7d0"}`,
            }}>
              {searchMsg}
            </div>
          )}
        </div>

        <h2 style={{
          fontSize: 28,
          fontWeight: 800,
          marginBottom: 16,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          letterSpacing: "-0.02em",
        }}>
          🗺️ Карта склада
        </h2>

        {/* Чекбоксы по типам ячеек */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, flexShrink: 0 }}>
          {ZONES.map((z) => (
            <label
              key={z}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderRadius: 12,
                border: "2px solid",
                borderColor: zoneFilters[z] ? "#667eea" : "#e5e7eb",
                background: zoneFilters[z]
                  ? "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)"
                  : "#fff",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                color: zoneFilters[z] ? "#4338ca" : "#6b7280",
                boxShadow: zoneFilters[z] ? "0 2px 8px rgba(102, 126, 234, 0.2)" : "0 1px 2px rgba(0,0,0,0.04)",
                transition: "all 0.2s ease",
                userSelect: "none",
              }}
              onMouseEnter={(e) => {
                if (!zoneFilters[z]) {
                  e.currentTarget.style.borderColor = "#a5b4fc";
                  e.currentTarget.style.background = "#f8fafc";
                } else {
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.25)";
                }
              }}
              onMouseLeave={(e) => {
                if (!zoneFilters[z]) {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.background = "#fff";
                } else {
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.2)";
                }
              }}
            >
              <input
                type="checkbox"
                checked={zoneFilters[z]}
                onChange={() => toggleZone(z)}
                style={{
                  width: 18,
                  height: 18,
                  cursor: "pointer",
                  accentColor: "#667eea",
                }}
              />
              <span style={{ letterSpacing: "0.02em" }}>{ZONE_LABEL[z]}</span>
              <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>({z})</span>
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
            <option value="surplus">Surplus</option>
            <option value="rejected">Rejected</option>
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

      {/* Zoom: кнопки */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Масштаб:</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
            color: "#374151",
            lineHeight: 1,
          }}
          title="Уменьшить"
        >
          −
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 44, textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
            color: "#374151",
            lineHeight: 1,
          }}
          title="Увеличить"
        >
          +
        </button>
        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 4 }}>
          Перетаскивание пустого места — сдвиг карты
        </span>
        <button
          type="button"
          onClick={() => setMapFullscreenOpen(true)}
          style={{
            marginLeft: "auto",
            padding: "10px 18px",
            borderRadius: 10,
            border: "2px solid #667eea",
            background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
            color: "#4338ca",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 2px 8px rgba(102, 126, 234, 0.2)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.2)";
          }}
        >
          <span style={{ fontSize: 18 }}>⛶</span>
          Открыть во весь экран
        </button>
      </div>

      {/* Область карты с zoom/pan */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          minHeight: 400,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "transparent",
        }}
        onMouseLeave={() => {
          if (isPanning) setIsPanning(false);
          panStartRef.current = null;
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            position: "relative",
            width: mapBounds.width,
            height: mapBounds.height,
          }}
        >
          {/* Слой для pan: клик по пустому месту — перетаскивание карты */}
          <div
            role="presentation"
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (dragId) return;
              setIsPanning(true);
              panStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                panX: pan.x,
                panY: pan.y,
              };
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              height: "100%",
              zIndex: 0,
              cursor: isPanning ? "grabbing" : "grab",
            }}
          />
          <div
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (dragId) return;
              setIsPanning(true);
              panStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                panX: pan.x,
                panY: pan.y,
              };
            }}
            onMouseMove={(e) => {
              if (isPanning && panStartRef.current) {
                setPan({
                  x: panStartRef.current.panX + e.clientX - panStartRef.current.clientX,
                  y: panStartRef.current.panY + e.clientY - panStartRef.current.clientY,
                });
                return;
              }
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
              if (isPanning) {
                setIsPanning(false);
                panStartRef.current = null;
                return;
              }
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
              width: mapBounds.width,
              height: mapBounds.height,
              minWidth: 400,
              minHeight: 400,
              background: "linear-gradient(to bottom right, #fafafa 0%, #ffffff 100%)",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              zIndex: 1,
              cursor: isPanning ? "grabbing" : "grab",
            }}
          >
        {visibleCells.map((c) => (
          <div
            key={c.id}
            onMouseDown={(e) => {
              if (!canDragCells) return;
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
              setHighlightCellId(c.id);
              
              // ⚡ ОПТИМИЗАЦИЯ: Параллельная загрузка данных
              Promise.all([
                loadCellUnits(c.id),
                loadUnassigned()
              ]);
            }}
            style={{
              position: "absolute",
              left: c.x,
              top: c.y,
              width: CELL_SIZE,
              height: CELL_SIZE,
              background: highlightCellId === c.id 
                ? `linear-gradient(135deg, ${cellBg(c)} 0%, ${cellBg(c)} 100%)`
                : cellBg(c),
              border: highlightCellId === c.id 
                ? "3px solid #667eea" 
                : `2px solid ${borderColor(c.calc_status)}`,
              boxShadow: highlightCellId === c.id 
                ? "0 8px 24px rgba(102, 126, 234, 0.4), 0 0 0 4px rgba(102, 126, 234, 0.1)"
                : c.calc_status === "blocked" 
                  ? "0 2px 8px rgba(220, 38, 38, 0.2)"
                  : c.units_count > 0 
                    ? "0 2px 8px rgba(0, 0, 0, 0.08)"
                    : "0 1px 3px rgba(0, 0, 0, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              cursor: canDragCells ? "move" : "pointer",
              userSelect: "none",
              borderRadius: 10,
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: highlightCellId === c.id ? "scale(1.05)" : "scale(1)",
            }}
            title={`${c.code} (${c.cell_type}) - ${c.units_count} units (${c.calc_status})`}
            onMouseEnter={(e) => {
              if (highlightCellId !== c.id && !dragId) {
                e.currentTarget.style.transform = "scale(1.02)";
                e.currentTarget.style.boxShadow = c.calc_status === "blocked"
                  ? "0 4px 12px rgba(220, 38, 38, 0.3)"
                  : "0 4px 12px rgba(0, 0, 0, 0.12)";
              }
            }}
            onMouseLeave={(e) => {
              if (highlightCellId !== c.id && !dragId) {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = c.calc_status === "blocked"
                  ? "0 2px 8px rgba(220, 38, 38, 0.2)"
                  : c.units_count > 0
                    ? "0 2px 8px rgba(0, 0, 0, 0.08)"
                    : "0 1px 3px rgba(0, 0, 0, 0.05)";
              }
            }}
          >
            <div style={{ 
              position: "relative", 
              width: "100%", 
              height: "100%", 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              justifyContent: "center", 
              padding: 4,
            }}>
              <div style={{ 
                fontWeight: 800, 
                fontSize: highlightCellId === c.id ? 13 : 12,
                color: highlightCellId === c.id ? "#667eea" : "#111",
                letterSpacing: "-0.01em",
                transition: "all 0.2s",
              }}>
                {c.code}
              </div>
              <div style={{ 
                fontSize: 6, 
                color: "#6b7280",
                marginTop: 2,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}>
                {c.cell_type}
              </div>
              {c.meta?.description && c.cell_type === "picking" && (
                <div style={{
                  fontSize: 7,
                  color: "#9ca3af",
                  marginTop: 2,
                  fontWeight: 600,
                  lineHeight: 1.1,
                  textAlign: "center",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {c.meta.description}
                </div>
              )}
              {c.units_count > 0 && (
                <div style={{
                  marginTop: 4,
                  background: highlightCellId === c.id 
                    ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                    : c.calc_status === "blocked"
                      ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                      : "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "3px 7px",
                  borderRadius: 999,
                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)",
                  minWidth: 20,
                  textAlign: "center",
                }}>
                  {c.units_count}
                </div>
              )}
            </div>
          </div>
        ))}
          </div>
        </div>
      </div>

      {/* Модальное окно: карта во весь экран (только просмотр) */}
      {mapFullscreenOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setMapFullscreenOpen(false)}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMapFullscreenOpen(false)}
              style={{
                position: "fixed",
                top: 20,
                right: 20,
                zIndex: 10000,
                width: 48,
                height: 48,
                borderRadius: 12,
                border: "2px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 24,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.25)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
              }}
            >
              ×
            </button>
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                position: "relative",
                width: mapBounds.width,
                height: mapBounds.height,
                background: "linear-gradient(to bottom right, #fafafa 0%, #ffffff 100%)",
                border: "2px solid #e5e7eb",
                borderRadius: 16,
                boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
              }}
            >
              {visibleCells.map((c) => (
                <div
                  key={c.id}
                  style={{
                    position: "absolute",
                    left: c.x,
                    top: c.y,
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    background: cellBg(c),
                    border: `2px solid ${borderColor(c.calc_status)}`,
                    boxShadow: c.calc_status === "blocked"
                      ? "0 2px 8px rgba(220, 38, 38, 0.2)"
                      : c.units_count > 0
                        ? "0 2px 8px rgba(0, 0, 0, 0.08)"
                        : "0 1px 3px rgba(0, 0, 0, 0.05)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    padding: 4,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 12, color: "#111" }}>{c.code}</div>
                  <div style={{ fontSize: 6, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>{c.cell_type}</div>
                  {c.units_count > 0 && (
                    <div style={{
                      marginTop: 4,
                      background: "#374151",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 999,
                    }}>
                      {c.units_count}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedCell && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            height: "100vh",
            width: 420,
            borderLeft: "1px solid #e5e7eb",
            background: "linear-gradient(to bottom, #f9fafb 0%, #ffffff 100%)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
            zIndex: 50,
          }}
        >
          {/* Header */}
          <div style={{ 
            padding: "20px 20px 16px", 
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "#fff",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
                {selectedCell.code}
              </div>
              <button
                onClick={() => {
                  setSelectedCell(null);
                  setHighlightCellId(null);
                  setSelectedUnit(null);
                  setUnitMoves([]);
                  setMoveTargetCell(null);
                }}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "none",
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ 
                fontSize: 12, 
                fontWeight: 600,
                background: "rgba(255,255,255,0.25)",
                padding: "4px 10px",
                borderRadius: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                {selectedCell.cell_type}
              </div>
              <div style={{ 
                fontSize: 12, 
                fontWeight: 600,
                background: "rgba(255,255,255,0.25)",
                padding: "4px 10px",
                borderRadius: 12,
              }}>
                📦 {selectedCell.units_count}
              </div>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div style={{ 
            flex: 1, 
            overflowY: "auto", 
            padding: "16px 20px",
          }}>

            {/* Action Buttons */}
            <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => router.push(`/app/cells/${selectedCell.id}`)}
                style={{
                  padding: "12px 16px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                  boxShadow: "0 2px 8px rgba(102, 126, 234, 0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.3)";
                }}
              >
                🔍 Открыть полную информацию
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
                        await loadCells();
                        const fresh = (await fetch("/api/cells/list").then(r=>r.json())).cells?.find((x:any)=>x.id===selectedCell.id);
                        if (fresh) setSelectedCell(fresh);
                      }}
                      style={{
                        padding: "10px 16px",
                        background: isBlocked 
                          ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)" 
                          : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                        width: "100%",
                        boxShadow: isBlocked 
                          ? "0 2px 8px rgba(239, 68, 68, 0.3)" 
                          : "0 2px 8px rgba(16, 185, 129, 0.3)",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
                    >
                      {isBlocked ? "🔓 Разблокировать ячейку" : "🔒 Заблокировать ячейку"}
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
                    padding: "10px 16px",
                    background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                    width: "100%",
                    boxShadow: "0 2px 8px rgba(220, 38, 38, 0.3)",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
                >
                  🗑️ Удалить ячейку
                </button>
              </div>
            )}

            {/* Units Section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ 
                fontWeight: 700, 
                fontSize: 14,
                marginBottom: 12,
                color: "#374151",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>📦</span>
                <span>Содержимое</span>
                <span style={{ 
                  fontSize: 11, 
                  fontWeight: 600, 
                  background: "#e5e7eb", 
                  padding: "2px 8px", 
                  borderRadius: 12,
                  color: "#6b7280",
                }}>
                  {cellUnits.length}
                </span>
              </div>

              {loadingUnits ? (
                // Skeleton loader
                <div style={{ display: "grid", gap: 8 }}>
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: 12,
                        height: 72,
                      }}
                    />
                  ))}
                </div>
              ) : cellUnits.length === 0 ? (
                <div style={{ 
                  textAlign: "center", 
                  padding: "32px 20px",
                  background: "#f9fafb",
                  borderRadius: 12,
                  border: "2px dashed #d1d5db",
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Ячейка пуста</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {cellUnits.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => {
                        setSelectedUnit(u);
                        loadUnitMoves(u.id);
                      }}
                      style={{
                        border: selectedUnit?.id === u.id 
                          ? "2px solid #667eea" 
                          : "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "12px 14px",
                        cursor: "pointer",
                        background: selectedUnit?.id === u.id 
                          ? "linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)"
                          : "#fff",
                        transition: "all 0.2s",
                        boxShadow: selectedUnit?.id === u.id 
                          ? "0 4px 12px rgba(102, 126, 234, 0.15)"
                          : "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                      onMouseEnter={(e) => {
                        if (selectedUnit?.id !== u.id) {
                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedUnit?.id !== u.id) {
                          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                          e.currentTarget.style.transform = "translateY(0)";
                        }
                      }}
                    >
                      <div style={{ 
                        fontWeight: 700, 
                        fontSize: 15,
                        color: selectedUnit?.id === u.id ? "#667eea" : "#111",
                        marginBottom: 4,
                      }}>
                        {u.barcode}
                      </div>
                      <div style={{ 
                        fontSize: 11, 
                        color: "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}>
                        <span>🕒</span>
                        {new Date(u.created_at).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* History Section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ 
                fontWeight: 700, 
                fontSize: 14,
                marginBottom: 12,
                color: "#374151",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>📜</span>
                <span>История перемещений</span>
              </div>

              {!selectedUnit ? (
                <div style={{ 
                  textAlign: "center", 
                  padding: "24px 16px",
                  background: "#f9fafb",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>👆</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Выберите заказ для просмотра истории
                  </div>
                </div>
              ) : loadingMoves ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s infinite",
                        borderRadius: 10,
                        height: 52,
                      }}
                    />
                  ))}
                </div>
              ) : unitMoves.length === 0 ? (
                <div style={{ 
                  textAlign: "center", 
                  padding: "24px 16px",
                  background: "#f9fafb",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    История пока пуста
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {unitMoves.map((m, idx) => (
                    <div 
                      key={m.id} 
                      style={{ 
                        border: "1px solid #e5e7eb", 
                        borderRadius: 10, 
                        padding: "10px 12px",
                        background: "#fff",
                        position: "relative",
                        paddingLeft: 32,
                      }}
                    >
                      <div style={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: idx === 0 ? "#667eea" : "#d1d5db",
                      }} />
                      <div style={{ 
                        fontSize: 12, 
                        fontWeight: 600, 
                        color: "#374151",
                        marginBottom: 2,
                      }}>
                        {m.note ?? "Событие"}
                      </div>
                      <div style={{ 
                        fontSize: 11, 
                        color: "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}>
                        <span>🕒</span>
                        {new Date(m.created_at).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {m.source && (
                          <>
                            <span>•</span>
                            <span>{m.source}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

          </div>

          {/* Move Target Section */}
          {selectedUnit && moveTargetCell && (
            <div style={{ 
              padding: "16px 20px", 
              borderTop: "1px solid #e5e7eb",
              background: "#f9fafb",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 12, color: "#374151" }}>
                🔄 Перемещение
              </div>
              <div style={{ 
                fontSize: 12, 
                color: "#6b7280", 
                marginBottom: 12,
                padding: 12,
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}>
                <div><strong>Заказ:</strong> {selectedUnit.barcode}</div>
                <div style={{ marginTop: 4 }}>
                  <strong>Цель:</strong> {moveTargetCell.code} ({moveTargetCell.cell_type})
                </div>
              </div>

              <button
                style={{ 
                  width: "100%",
                  padding: "10px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: moving || moveTargetCell.id === selectedUnit.cell_id ? "not-allowed" : "pointer",
                  opacity: moving || moveTargetCell.id === selectedUnit.cell_id ? 0.5 : 1,
                }}
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

                    setMoveMsg(`✅ Перемещено в ${moveTargetCell.code}`);
                    await loadCells();
                    if (selectedCell?.id) await loadCellUnits(selectedCell.id);
                    if (moveTargetCell?.id) await loadCellUnits(moveTargetCell.id);
                    setMoveTargetCell(null);
                    setSelectedUnit(null);
                  } finally {
                    setMoving(false);
                  }
                }}
              >
                {moving ? "Перемещение..." : "Переместить"}
              </button>

              {moveMsg && (
                <div style={{ 
                  marginTop: 8, 
                  fontSize: 12, 
                  color: moveMsg.startsWith("✅") ? "#059669" : "#dc2626",
                  textAlign: "center",
                }}>
                  {moveMsg}
                </div>
              )}

              <button
                style={{ 
                  marginTop: 8, 
                  width: "100%",
                  padding: "8px",
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#6b7280",
                }}
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
        </div>
      )}
      </div>
      </div>
    </>
  );
}
