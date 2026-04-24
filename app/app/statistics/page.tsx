"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type OpsShippingByDay = {
  date: string;
  created_tasks: number;
  out_tasks: number;
  out_returned_tasks: number;
  kuda_breakdown: Array<{
    kuda: string;
    created_tasks: number;
  }>;
};

type OpsShippingByKuda = {
  kuda: string;
  created_tasks: number;
  out_tasks: number;
  out_returned_tasks: number;
  returned_orders?: Array<{
    barcode: string;
    accepted_in_bin_at: string;
  }>;
};

type OpsShippingStats = {
  filters: {
    from: string;
    to: string;
    excluded_scenario_keyword: string;
    excluded_kuda: string[];
    excluded_ops_mark: string;
  };
  summary: {
    total_tasks: number;
    out_tasks: number;
    out_returned_tasks: number;
    kuda_categories: number;
    excluded_by_keyword: number;
    excluded_by_kuda: number;
    excluded_by_ops_ns: number;
    not_out_kgt_count?: number;
    not_out_mbt_count?: number;
    not_out_zone_breakdown?: Array<{
      zone: string;
      count: number;
    }>;
    team_efficiency?: {
      based_on_created_tasks: number;
      started_at: string | null;
      first_scan_at: string | null;
      last_scan_at: string | null;
      scanned_orders_count: number;
      completed_orders_count?: number;
      out_tasks_count?: number;
      out_tasks_without_tsd_scan_count?: number;
      first_started_unit_barcode?: string | null;
      first_started_unit_at?: string | null;
      last_started_unit_barcode?: string | null;
      last_started_unit_at?: string | null;
      tasks_per_tsd: Array<{
        user_id: string;
        user_name: string;
        tasks_count: number;
      }>;
      shipped_tasks_per_user?: Array<{
        user_id: string;
        user_name: string;
        tasks_count: number;
      }>;
    };
    not_out_cells: Array<
      | string
      | {
          code?: string | null;
          tag?: string | null;
        }
    >;
  };
  by_day: OpsShippingByDay[];
  by_kuda: OpsShippingByKuda[];
  merchant_seller_returned_breakdown?: Array<{
    seller_name: string;
    out_returned_tasks: number;
    returned_orders: Array<{
      barcode: string;
      accepted_in_bin_at: string;
    }>;
  }>;
};

function getTodayDateUtc() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDaysAgoUtc(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function formatShortDate(dateIso: string) {
  return new Date(`${dateIso}T00:00:00.000Z`).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU");
}

const StatCard = memo(function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  color: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        border: "1px solid #243244",
        borderRadius: 12,
        padding: 12,
        background: "linear-gradient(160deg, #0f172a 0%, #111827 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02), 0 10px 20px rgba(0,0,0,0.22)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: color,
          opacity: 0.9,
        }}
      />
      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 28, color, fontWeight: 800, marginTop: 2, lineHeight: 1.1 }}>{value}</div>
      {subtitle && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
});

const OpsShippingTrendChart = memo(function OpsShippingTrendChart({
  data,
}: {
  data: OpsShippingByDay[];
}) {
  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#64748b", padding: "40px 0" }}>
        Нет данных за выбранный период
      </div>
    );
  }

  const width = 760;
  const height = 280;
  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxValue = Math.max(
    1,
    ...data.flatMap((day) => [day.created_tasks, day.out_tasks, day.out_returned_tasks])
  );

  const pointX = (index: number) =>
    data.length === 1
      ? paddingLeft + chartWidth / 2
      : paddingLeft + (index / (data.length - 1)) * chartWidth;

  const pointY = (value: number) => paddingTop + ((maxValue - value) / maxValue) * chartHeight;

  const buildPath = (valueGetter: (row: OpsShippingByDay) => number) =>
    data
      .map((row, index) => `${index === 0 ? "M" : "L"} ${pointX(index)} ${pointY(valueGetter(row))}`)
      .join(" ");

  const createdPath = buildPath((row) => row.created_tasks);
  const outPath = buildPath((row) => row.out_tasks);
  const returnedPath = buildPath((row) => row.out_returned_tasks);
  const labelStep = Math.max(1, Math.floor(data.length / 6));

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block", borderRadius: 10 }}
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const value = Math.round((maxValue / 4) * (4 - step));
          const y = paddingTop + (step / 4) * chartHeight;
          return (
            <g key={step}>
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={y}
                y2={y}
                stroke="#243042"
                strokeWidth="1"
              />
              <text x={4} y={y + 4} fontSize="11" fill="#64748b">
                {value}
              </text>
            </g>
          );
        })}

        <path d={createdPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
        <path d={outPath} fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" />
        <path d={returnedPath} fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />

        {data.map((row, index) => {
          if (index % labelStep !== 0 && index !== data.length - 1) return null;
          return (
            <text
              key={row.date}
              x={pointX(index)}
              y={height - 12}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
            >
              {formatShortDate(row.date)}
            </text>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 700 }}>● Создано задач</div>
        <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 700 }}>● Есть OUT</div>
        <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700 }}>● Селлер не принял</div>
      </div>
    </div>
  );
});

const OpsShippingKudaBars = memo(function OpsShippingKudaBars({
  data,
  topLimit,
}: {
  data: OpsShippingByKuda[];
  topLimit: number;
}) {
  const [kudaTooltip, setKudaTooltip] = useState<{
    x: number;
    y: number;
    row: OpsShippingByKuda;
  } | null>(null);

  const updateKudaTooltip = useCallback((e: React.MouseEvent, row: OpsShippingByKuda) => {
    setKudaTooltip({ x: e.clientX, y: e.clientY, row });
  }, []);

  const clearKudaTooltip = useCallback(() => {
    setKudaTooltip(null);
  }, []);

  const rowsWithReturned = data
    .filter((row) => row.out_returned_tasks > 0)
    .sort((a, b) => b.out_returned_tasks - a.out_returned_tasks || b.out_tasks - a.out_tasks);
  const rowsToDisplay = topLimit > 0 ? rowsWithReturned.slice(0, topLimit) : rowsWithReturned;

  if (rowsToDisplay.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#64748b", padding: "40px 0" }}>
        Нет мерчантов с выехавшими и вернувшимися заказами (OUT → BIN) в выбранном периоде
      </div>
    );
  }

  const maxReturned = Math.max(1, ...rowsToDisplay.map((row) => row.out_returned_tasks));
  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700 }}>● Селлер не принял</div>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          Показано: {rowsToDisplay.length} из {rowsWithReturned.length}
        </div>
      </div>

      <div
        className="kuda-scroll"
        style={{
          border: "1px solid #253246",
          borderRadius: 12,
          padding: 10,
          overflowX: "auto",
          overflowY: "hidden",
          background: "#0b1220",
          scrollbarColor: "#334155 #0f172a",
        }}
      >
        <div
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: "minmax(72px, 72px)",
            gap: 12,
            alignItems: "end",
            minHeight: 280,
            paddingBottom: 8,
          }}
        >
          {rowsToDisplay.map((row) => {
            const retHeight = Math.max(2, Math.round((row.out_returned_tasks / maxReturned) * 200));
            return (
              <div
                key={row.kuda}
                role="presentation"
                onMouseEnter={(e) => updateKudaTooltip(e, row)}
                onMouseMove={(e) => updateKudaTooltip(e, row)}
                onMouseLeave={clearKudaTooltip}
                style={{ display: "grid", gap: 6, justifyItems: "center", minHeight: 280, cursor: "default" }}
              >
                <div
                  style={{
                    display: "grid",
                    justifyItems: "center",
                    alignItems: "end",
                    height: 190,
                    width: "100%",
                    borderRadius: 8,
                    background: "repeating-linear-gradient(to top, rgba(71,85,105,0.2) 0 1px, transparent 1px 44px)",
                  }}
                >
                  <div
                    style={{
                      marginBottom: 6,
                      minWidth: 28,
                      padding: "1px 6px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 800,
                      textAlign: "center",
                      color: "#fecaca",
                      background: "rgba(153,27,27,0.35)",
                      border: "1px solid rgba(239,68,68,0.45)",
                    }}
                  >
                    {row.out_returned_tasks}
                  </div>
                  <div
                    style={{
                      width: 22,
                      height: retHeight,
                      borderRadius: 6,
                      background: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
                      boxShadow: "0 4px 12px rgba(220,38,38,0.35)",
                    }}
                  />
                </div>
                <div
                  style={{
                    position: "relative",
                    width: 72,
                    height: 84,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 36,
                      top: 0,
                      transform: "rotate(-38deg)",
                      transformOrigin: "left top",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#cbd5e1",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.kuda}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {kudaTooltip && (
        <div
          style={{
            position: "fixed",
            left: kudaTooltip.x + 14,
            top: kudaTooltip.y + 14,
            zIndex: 1000,
            pointerEvents: "none",
            minWidth: 200,
            maxWidth: 320,
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "linear-gradient(160deg, rgba(15,23,42,0.97) 0%, rgba(17,24,39,0.98) 100%)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
            padding: "10px 12px",
            color: "#e2e8f0",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
            КУДА (направление)
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#f8fafc", marginTop: 2, wordBreak: "break-word" }}>
            {kudaTooltip.row.kuda}
          </div>
          <div
            style={{
              marginTop: 8,
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "4px 12px",
              fontSize: 12,
            }}
          >
            <span style={{ color: "#94a3b8" }}>Селлер не принял</span>
            <span style={{ fontWeight: 800, color: "#fecaca", textAlign: "right" }}>{kudaTooltip.row.out_returned_tasks}</span>
            <span style={{ color: "#94a3b8" }}>Выезжало (OUT)</span>
            <span style={{ fontWeight: 700, color: "#c4b5fd", textAlign: "right" }}>{kudaTooltip.row.out_tasks}</span>
          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid rgba(148,163,184,0.2)",
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Barcode и принято в BIN
            </div>
            {(kudaTooltip.row.returned_orders || []).slice(0, 6).map((order) => (
              <div
                key={`${order.barcode}-${order.accepted_in_bin_at}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "4px 10px",
                  alignItems: "center",
                  fontSize: 11,
                }}
              >
                <span style={{ color: "#e2e8f0", fontWeight: 700, wordBreak: "break-word" }}>{order.barcode}</span>
                <span style={{ color: "#93c5fd", fontWeight: 600 }}>{formatDateTime(order.accepted_in_bin_at)}</span>
              </div>
            ))}
            {(kudaTooltip.row.returned_orders || []).length === 0 && (
              <div style={{ fontSize: 11, color: "#94a3b8" }}>Нет данных по заказам для этого направления</div>
            )}
            {(kudaTooltip.row.returned_orders || []).length > 6 && (
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                И еще {(kudaTooltip.row.returned_orders || []).length - 6}
              </div>
            )}
          </div>
        </div>
      )}
      <style jsx global>{`
        .kuda-scroll::-webkit-scrollbar {
          height: 10px;
        }
        .kuda-scroll::-webkit-scrollbar-track {
          background: #0f172a;
          border-radius: 999px;
        }
        .kuda-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(90deg, #334155 0%, #475569 100%);
          border-radius: 999px;
          border: 1px solid #1e293b;
        }
        .kuda-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(90deg, #475569 0%, #64748b 100%);
        }
      `}</style>
    </div>
  );
});

const OpsShippingReturnedPie = memo(function OpsShippingReturnedPie({
  data,
  merchantBreakdown,
  topLimit = 10,
}: {
  data: OpsShippingByKuda[];
  merchantBreakdown: Array<{
    seller_name: string;
    out_returned_tasks: number;
    returned_orders: Array<{ barcode: string; accepted_in_bin_at: string }>;
  }>;
  topLimit?: number;
}) {
  const [selectedSlice, setSelectedSlice] = useState<{
    label: string;
    returned_orders: Array<{ barcode: string; accepted_in_bin_at: string }>;
  } | null>(null);
  const merchantRow = data.find((row) => String(row.kuda || "").trim().toLowerCase() === "мерчант");
  const merchantSplitRows = (merchantBreakdown || [])
    .filter((row) => Number(row.out_returned_tasks || 0) > 0)
    .map((row) => ({
      kuda: `Мерчант: ${row.seller_name}`,
      created_tasks: 0,
      out_tasks: 0,
      out_returned_tasks: row.out_returned_tasks,
      returned_orders: row.returned_orders || [],
    }));
  const nonMerchantRows = data.filter(
    (row) =>
      Number(row.out_returned_tasks || 0) > 0 &&
      String(row.kuda || "").trim().toLowerCase() !== "мерчант"
  );
  const composedRows = [...nonMerchantRows, ...merchantSplitRows]
    .filter((row) => Number(row.out_returned_tasks || 0) > 0)
    .sort((a, b) => Number(b.out_returned_tasks || 0) - Number(a.out_returned_tasks || 0))
    .slice(0, topLimit);

  if (composedRows.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#64748b", padding: "24px 0" }}>
        Нет данных для pie chart по селлерам с возвратом в BIN
      </div>
    );
  }

  const total = composedRows.reduce((acc, row) => acc + Number(row.out_returned_tasks || 0), 0);
  const topSlice = composedRows[0];
  const topSlicePct = total > 0 ? (Number(topSlice?.out_returned_tasks || 0) / total) * 100 : 0;
  const cx = 120;
  const cy = 120;
  const radius = 88;
  const palette = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#84cc16",
    "#22c55e",
    "#14b8a6",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];

  const polarToCartesian = (centerX: number, centerY: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: centerX + r * Math.cos(rad),
      y: centerY + r * Math.sin(rad),
    };
  };

  let cumulativeAngle = 0;
  const slices = composedRows.map((row, index) => {
    const value = Number(row.out_returned_tasks || 0);
    const angle = total > 0 ? (value / total) * 360 : 0;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const pathData = [
      `M ${cx} ${cy}`,
      `L ${end.x} ${end.y}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${start.x} ${start.y}`,
      "Z",
    ].join(" ");

    return {
      row,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
      color: palette[index % palette.length],
      pathData,
    };
  });

  return (
    <div
      style={{
        border: "1px solid #1f2937",
        borderRadius: 12,
        padding: 10,
        background: "#0f172a",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1", marginBottom: 8 }}>
        Top 10 селлеров: возврат после OUT (селлер не принял)
      </div>
      {merchantRow && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
          Сегмент "Мерчант" автоматически разделен по имени селлера из `scenario`.
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            color: "#94a3b8",
            border: "1px solid #334155",
            borderRadius: 999,
            background: "#111827",
            padding: "3px 8px",
            fontWeight: 700,
          }}
        >
          Сегментов: {composedRows.length}
        </span>
        {topSlice && (
          <span
            style={{
              fontSize: 11,
              color: "#fecaca",
              border: "1px solid #7f1d1d",
              borderRadius: 999,
              background: "rgba(127,29,29,0.25)",
              padding: "3px 8px",
              fontWeight: 700,
            }}
          >
            Топ: {topSlice.kuda} ({Number(topSlice.out_returned_tasks || 0)} / {topSlicePct.toFixed(1)}%)
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 10, alignItems: "start" }}>
        <div style={{ position: "relative", width: 240, height: 240, margin: "0 auto" }}>
          <svg viewBox="0 0 240 240" width="240" height="240" aria-label="Pie chart returned sellers">
            {slices.map((slice) => (
              <path
                key={slice.row.kuda}
                d={slice.pathData}
                fill={slice.color}
                stroke="#0b1220"
                strokeWidth="1.5"
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedSlice({ label: slice.row.kuda, returned_orders: slice.row.returned_orders || [] })}
              />
            ))}
            <circle cx={cx} cy={cy} r={42} fill="#0b1220" />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>Всего</div>
              <div style={{ fontSize: 20, color: "#fecaca", fontWeight: 800 }}>{total}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {slices.map((slice) => (
            <div
              key={`legend-${slice.row.kuda}`}
              style={{
                display: "grid",
                gridTemplateColumns: "12px minmax(0, 1fr) auto auto auto",
                gap: 8,
                alignItems: "center",
                border: "1px solid #1f2937",
                borderRadius: 8,
                padding: "5px 8px",
                background: "#111827",
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 999, background: slice.color, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, wordBreak: "break-word" }}>{slice.row.kuda}</span>
              <span style={{ fontSize: 12, color: "#fecaca", fontWeight: 800 }}>{slice.value}</span>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{slice.pct.toFixed(1)}%</span>
              <button
                type="button"
                onClick={() => setSelectedSlice({ label: slice.row.kuda, returned_orders: slice.row.returned_orders || [] })}
                style={{
                  border: "1px solid #334155",
                  background: "#0f172a",
                  color: "#93c5fd",
                  borderRadius: 6,
                  padding: "2px 7px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Дрилл заказов
              </button>
            </div>
          ))}
        </div>
      </div>
      {selectedSlice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.7)",
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setSelectedSlice(null)}
        >
          <div
            style={{
              width: "min(720px, 96vw)",
              maxHeight: "84vh",
              overflow: "auto",
              borderRadius: 12,
              border: "1px solid #334155",
              background: "#0f172a",
              padding: 12,
              boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 800 }}>
                Дрилл: {selectedSlice.label}
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlice(null)}
                style={{
                  border: "1px solid #334155",
                  background: "#111827",
                  color: "#e2e8f0",
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Закрыть
              </button>
            </div>
            {(selectedSlice.returned_orders || []).length > 0 ? (
              <div style={{ display: "grid", gap: 6 }}>
                {(selectedSlice.returned_orders || []).map((row) => (
                  <div
                    key={`${row.barcode}-${row.accepted_in_bin_at}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 8,
                      border: "1px solid #1f2937",
                      borderRadius: 8,
                      background: "#111827",
                      padding: "6px 8px",
                    }}
                  >
                    <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{row.barcode}</span>
                    <span style={{ color: "#93c5fd", fontWeight: 600, fontSize: 12 }}>
                      {formatDateTime(row.accepted_in_bin_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Нет заказов для дрилла</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default function StatisticsPage() {
  const router = useRouter();
  const [fromDate, setFromDate] = useState<string>(() => getDateDaysAgoUtc(13));
  const [toDate, setToDate] = useState<string>(() => getTodayDateUtc());
  const [kudaTopLimit, setKudaTopLimit] = useState<number>(20);
  const [stats, setStats] = useState<OpsShippingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  async function loadOpsShippingStats(from: string, to: string) {
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    // #region agent log
    fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "post-fix", hypothesisId: "H15", location: "app/app/statistics/page.tsx:loadOpsShippingStats:start", message: "Start statistics request", data: { requestSeq, from, to }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/stats/ops-shipping-kuda?${params.toString()}`, { cache: "no-store" });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const json = await res.json();
      if (requestSeq !== requestSeqRef.current) {
        // #region agent log
        fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "post-fix", hypothesisId: "H15", location: "app/app/statistics/page.tsx:loadOpsShippingStats:stale", message: "Ignore stale statistics response", data: { requestSeq, currentSeq: requestSeqRef.current, from, to, ok: res.ok }, timestamp: Date.now() }) }).catch(() => {});
        // #endregion
        return;
      }
      if (res.ok && json.ok) {
        // #region agent log
        fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "post-fix", hypothesisId: "H15", location: "app/app/statistics/page.tsx:loadOpsShippingStats:success", message: "Apply statistics response", data: { requestSeq, from, to, summary: json.summary }, timestamp: Date.now() }) }).catch(() => {});
        // #endregion
        setStats(json);
      } else {
        // #region agent log
        fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "post-fix", hypothesisId: "H15", location: "app/app/statistics/page.tsx:loadOpsShippingStats:error", message: "Statistics response is non-ok", data: { requestSeq, from, to, status: res.status, error: json?.error || null }, timestamp: Date.now() }) }).catch(() => {});
        // #endregion
        setError(json.error || "Ошибка загрузки статистики");
      }
    } catch (e: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(e.message || "Ошибка загрузки статистики");
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadOpsShippingStats(fromDate, toDate);
    const interval = setInterval(() => loadOpsShippingStats(fromDate, toDate), 60000);
    return () => clearInterval(interval);
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!stats) return;
    const outOnly = Math.max(0, stats.summary.out_tasks - stats.summary.out_returned_tasks);
    const notOut = Math.max(0, stats.summary.total_tasks - stats.summary.out_tasks);
    // #region agent log
    fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "post-fix", hypothesisId: "H16", location: "app/app/statistics/page.tsx:metric-mapping", message: "Displayed top metrics mapping", data: { from: stats.filters.from, to: stats.filters.to, cards: { createdTasks: stats.summary.total_tasks, uniqueDirectionOut: stats.summary.out_tasks, outReturnedToBin: stats.summary.out_returned_tasks, kudaCategoriesReference: stats.summary.kuda_categories } }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    // #region agent log
    fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "post-fix", hypothesisId: "H17", location: "app/app/statistics/page.tsx:metric-partition", message: "Partition metrics into exclusive buckets", data: { from: stats.filters.from, to: stats.filters.to, createdTasks: stats.summary.total_tasks, outOnly, outReturned: stats.summary.out_returned_tasks, notOut, partitionSum: outOnly + stats.summary.out_returned_tasks + notOut }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    const byKudaOutSum = stats.by_kuda.reduce((acc, row) => acc + Number(row.out_tasks || 0), 0);
    const byKudaReturnedSum = stats.by_kuda.reduce(
      (acc, row) => acc + Number(row.out_returned_tasks || 0),
      0
    );
    const byKudaOutOnlySum = stats.by_kuda.reduce(
      (acc, row) =>
        acc + Math.max(0, Number(row.out_tasks || 0) - Number(row.out_returned_tasks || 0)),
      0
    );
    // #region agent log
    fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "discrepancy-pre-fix", hypothesisId: "H18", location: "app/app/statistics/page.tsx:chart-card-consistency", message: "Compare by_kuda sums vs top cards", data: { from: stats.filters.from, to: stats.filters.to, summary: { totalTasks: stats.summary.total_tasks, outTasks: stats.summary.out_tasks, outReturnedTasks: stats.summary.out_returned_tasks, outOnlyCard: outOnly }, byKuda: { outSum: byKudaOutSum, returnedSum: byKudaReturnedSum, outOnlySum: byKudaOutOnlySum, categories: stats.by_kuda.length } }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    // #region agent log
    fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "post-fix", hypothesisId: "H12_team_efficiency_display", location: "app/app/statistics/page.tsx:team-efficiency-display", message: "Display values for TSD scans vs completed/out", data: { from: stats.filters.from, to: stats.filters.to, teamEfficiency: stats.summary.team_efficiency ? { scannedOrdersCount: stats.summary.team_efficiency.scanned_orders_count, completedOrdersCount: stats.summary.team_efficiency.completed_orders_count || 0, outTasksCount: stats.summary.team_efficiency.out_tasks_count || 0, outWithoutTsdScan: stats.summary.team_efficiency.out_tasks_without_tsd_scan_count || 0, firstStartedUnitBarcode: stats.summary.team_efficiency.first_started_unit_barcode || null, firstStartedUnitAt: stats.summary.team_efficiency.first_started_unit_at || null, lastStartedUnitBarcode: stats.summary.team_efficiency.last_started_unit_barcode || null, lastStartedUnitAt: stats.summary.team_efficiency.last_started_unit_at || null, shippedTasksPerUserCount: (stats.summary.team_efficiency.shipped_tasks_per_user || []).length } : null }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    // #region agent log
    fetch("http://127.0.0.1:7370/ingest/24317d64-e0d6-4945-91b0-f5cf6390eaf2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "696a64" }, body: JSON.stringify({ sessionId: "696a64", runId: "post-fix", hypothesisId: "H14_pie_top10_returned", location: "app/app/statistics/page.tsx:pie-top10-data", message: "Top 10 returned sellers data for pie chart", data: { from: stats.filters.from, to: stats.filters.to, top10: stats.by_kuda.filter((row) => Number(row.out_returned_tasks || 0) > 0).sort((a, b) => Number(b.out_returned_tasks || 0) - Number(a.out_returned_tasks || 0)).slice(0, 10).map((row) => ({ kuda: row.kuda, returned: row.out_returned_tasks })) }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
  }, [stats]);

  return (
    <div
      style={{
        maxWidth: "100%",
        margin: 0,
        padding: "14px 16px 28px",
        background:
          "radial-gradient(1200px 500px at 0% -10%, rgba(37,99,235,0.14), transparent 60%), radial-gradient(900px 400px at 100% -20%, rgba(124,58,237,0.12), transparent 55%), #0b1220",
        minHeight: "calc(100vh - 60px)",
      }}
    >
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 26, margin: 0, fontWeight: 800, color: "#e5e7eb" }}>Статистика</h1>
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            fontSize: 12,
            color: "#cbd5e1",
            border: "1px solid #334155",
            borderRadius: 999,
            padding: "8px 12px",
            background: "rgba(15,23,42,0.7)",
            fontWeight: 700,
          }}
        >
          Live обновление: 60с
        </div>
      </div>

      <div
        style={{
          background: "rgba(17,24,39,0.88)",
          border: "1px solid #1f2937",
          borderRadius: 12,
          padding: 12,
          boxShadow: "0 16px 30px rgba(0,0,0,0.28)",
          backdropFilter: "blur(4px)",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#9ca3af", minWidth: 170 }}>
            С даты
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                padding: "7px 9px",
                border: "1px solid #334155",
                borderRadius: 8,
                background: "#0f172a",
                color: "#e5e7eb",
                fontWeight: 600,
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#9ca3af", minWidth: 170 }}>
            По дату
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                padding: "7px 9px",
                border: "1px solid #334155",
                borderRadius: 8,
                background: "#0f172a",
                color: "#e5e7eb",
                fontWeight: 600,
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => loadOpsShippingStats(fromDate, toDate)}
            disabled={loading}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: loading ? "#374151" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
              color: loading ? "#9ca3af" : "#f8fafc",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 8px 16px rgba(37,99,235,0.28)",
            }}
          >
            {loading ? "Загрузка..." : "Обновить период"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <span
            style={{
              fontSize: 11,
              color: "#94a3b8",
              background: "#0f172a",
              border: "1px solid #273449",
              borderRadius: 999,
              padding: "4px 8px",
            }}
          >
            Фильтр: GERI/GERI QAYTARMA
          </span>
          <span
            style={{
              fontSize: 11,
              color: "#94a3b8",
              background: "#0f172a",
              border: "1px solid #273449",
              borderRadius: 999,
              padding: "4px 8px",
            }}
          >
            Исключения: DIAQNOSTIKA, NS, Клиент, Pudo
          </span>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              background: "rgba(239, 68, 68, 0.12)",
              color: "#fecaca",
              border: "1px solid rgba(239,68,68,0.35)",
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {!stats && loading && (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontWeight: 600 }}>
            Загрузка статистики...
          </div>
        )}

        {stats && (
          <>
            {(() => {
              const zoneRows = stats.summary.not_out_zone_breakdown || [];
              const notOutTotal = Math.max(0, Number(stats.summary.total_tasks || 0) - Number(stats.summary.out_tasks || 0));
              const pickingCount = zoneRows.find((row) => row.zone === "picking")?.count || 0;
              const rejectedCount = zoneRows.find((row) => row.zone === "rejected")?.count || 0;
              if (notOutTotal <= 0) return null;
              return (
                <div
                  style={{
                    marginBottom: 10,
                    border: "1px solid #334155",
                    borderRadius: 10,
                    padding: "8px 10px",
                    background: "rgba(15,23,42,0.6)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>
                    Не выехало: {notOutTotal} (по дням OUT). По текущей зоне: picking {pickingCount}, rejected {rejectedCount}
                  </div>
                </div>
              );
            })()}
            {(() => {
              const created = Number(stats.summary.total_tasks || 0);
              const out = Number(stats.summary.out_tasks || 0);
              const returned = Number(stats.summary.out_returned_tasks || 0);
              const formatPercent = (num: number, den: number) => {
                if (!den || den <= 0) return "0%";
                return `${((num / den) * 100).toFixed(1)}%`;
              };
              const conversionRows = [
                {
                  label: "Создано → Выехало",
                  value: formatPercent(out, created),
                  detail: `${out} / ${created}`,
                  color: "#a78bfa",
                },
                {
                  label: "Выехало → Селлер не принял",
                  value: formatPercent(returned, out),
                  detail: `${returned} / ${out}`,
                  color: "#f87171",
                },
                {
                  label: "Создано → Селлер не принял",
                  value: formatPercent(returned, created),
                  detail: `${returned} / ${created}`,
                  color: "#38bdf8",
                },
              ];
              return (
                <div
                  style={{
                    marginBottom: 10,
                    border: "1px solid #1f2937",
                    borderRadius: 12,
                    padding: 10,
                    background: "#0f172a",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1", marginBottom: 8 }}>
                    Конверсия этапов
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                    {conversionRows.map((row) => (
                      <div
                        key={row.label}
                        style={{
                          border: "1px solid #334155",
                          borderRadius: 8,
                          background: "#111827",
                          padding: "6px 8px",
                          display: "grid",
                          gap: 2,
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>{row.label}</div>
                        <div style={{ fontSize: 16, color: row.color, fontWeight: 800 }}>{row.value}</div>
                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{row.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <StatCard
                title="Создано задач"
                value={stats.summary.total_tasks}
                subtitle={`${stats.filters.from} → ${stats.filters.to}`}
                color="#38bdf8"
              />
              <StatCard
                title="Выехало к партнеру и не вернулось"
                value={Math.max(0, stats.summary.out_tasks - stats.summary.out_returned_tasks)}
                subtitle="OUT без возврата в BIN"
                color="#a78bfa"
              />
              <StatCard
                title="Селлер не принял"
                value={stats.summary.out_returned_tasks}
                subtitle="OUT и потом вернулось в BIN"
                color="#f87171"
              />
              <StatCard
                title="Не выехало"
                value={Math.max(0, stats.summary.total_tasks - stats.summary.out_tasks)}
                subtitle="Задачи без OUT"
                color="#94a3b8"
              />
            </div>
            <div
              style={{
                marginBottom: 10,
                border: "1px solid #1f2937",
                borderRadius: 12,
                padding: 10,
                background: "#0f172a",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>
                Не выехало — в каких ячейках числятся
              </div>
              <div
                style={{
                  marginBottom: 8,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    border: "1px solid #334155",
                    background: "#111827",
                    borderRadius: 8,
                    padding: "6px 8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#fca5a5", fontWeight: 700 }}>КГТ</span>
                  <span style={{ fontSize: 14, color: "#fecaca", fontWeight: 800 }}>
                    {Number(stats.summary.not_out_kgt_count || 0)}
                  </span>
                </div>
                <div
                  style={{
                    border: "1px solid #334155",
                    background: "#111827",
                    borderRadius: 8,
                    padding: "6px 8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 700 }}>МБТ</span>
                  <span style={{ fontSize: 14, color: "#bfdbfe", fontWeight: 800 }}>
                    {Number(stats.summary.not_out_mbt_count || 0)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {stats.summary.not_out_cells && stats.summary.not_out_cells.length > 0 ? (
                  stats.summary.not_out_cells.map((cell, index) => {
                    const safeCode =
                      typeof cell === "string"
                        ? cell || "Без ячейки"
                        : String(cell?.code || "Без ячейки").trim() || "Без ячейки";
                    const safeTag =
                      typeof cell === "string" ? null : (typeof cell?.tag === "string" ? cell.tag.trim() : null);
                    const key = `${safeCode}-${safeTag || ""}-${index}`;
                    return (
                    <span
                      key={key}
                      style={{
                        fontSize: 12,
                        color: "#cbd5e1",
                        borderRadius: 999,
                        border: "1px solid #334155",
                        background: "#111827",
                        padding: "4px 8px",
                        fontWeight: 600,
                      }}
                    >
                      {safeCode}
                      {safeTag ? (
                        <span
                          style={{
                            marginLeft: 6,
                            padding: "1px 6px",
                            borderRadius: 999,
                            border: "1px solid #475569",
                            background: "#0f172a",
                            color: "#93c5fd",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {safeTag}
                        </span>
                      ) : null}
                    </span>
                    );
                  })
                ) : (
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Нет данных по ячейкам</span>
                )}
              </div>
              {(stats.summary.not_out_zone_breakdown || []).length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {stats.summary.not_out_zone_breakdown!.map((row) => (
                    <span
                      key={`zone-${row.zone}`}
                      style={{
                        fontSize: 11,
                        color: "#cbd5e1",
                        borderRadius: 999,
                        border: "1px solid #334155",
                        background: "#0f172a",
                        padding: "3px 8px",
                        fontWeight: 700,
                      }}
                    >
                      {row.zone}: {row.count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 10, background: "#0f172a" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {[
                    { label: "Top 20", value: 20 },
                    { label: "Top 40", value: 40 },
                    { label: "Все", value: 0 },
                  ].map((option) => {
                    const active = kudaTopLimit === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setKudaTopLimit(option.value)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: active ? "1px solid #ef4444" : "1px solid #334155",
                          background: active ? "rgba(220,38,38,0.18)" : "#111827",
                          color: active ? "#fecaca" : "#94a3b8",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <OpsShippingKudaBars data={stats.by_kuda} topLimit={kudaTopLimit} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <OpsShippingReturnedPie
                data={stats.by_kuda}
                merchantBreakdown={stats.merchant_seller_returned_breakdown || []}
                topLimit={10}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 10, background: "#0f172a" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1", marginBottom: 8 }}>
                  Эффективность команды (по созданным задачам периода)
                </div>
                {stats.summary.team_efficiency ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", padding: "6px 8px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Начало отгрузки (TSD)</div>
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>
                          {formatDateTime(stats.summary.team_efficiency.started_at)}
                        </div>
                      </div>
                      <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", padding: "6px 8px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Первый скан</div>
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>
                          {formatDateTime(stats.summary.team_efficiency.first_scan_at)}
                        </div>
                      </div>
                      <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", padding: "6px 8px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Последний скан</div>
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>
                          {formatDateTime(stats.summary.team_efficiency.last_scan_at)}
                        </div>
                      </div>
                      <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", padding: "6px 8px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Отсканировано заказов (TSD)</div>
                        <div style={{ fontSize: 13, color: "#fca5a5", fontWeight: 800 }}>
                          {Number(stats.summary.team_efficiency.scanned_orders_count || 0)}
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                          База созданных задач: {Number(stats.summary.team_efficiency.based_on_created_tasks || 0)}
                        </div>
                      </div>
                      <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", padding: "6px 8px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Собрано/завершено задач</div>
                        <div style={{ fontSize: 13, color: "#86efac", fontWeight: 800 }}>
                          {Number(stats.summary.team_efficiency.completed_orders_count || 0)}
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                          Выехало (OUT): {Number(stats.summary.team_efficiency.out_tasks_count || 0)}
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                          OUT без TSD-скана: {Number(stats.summary.team_efficiency.out_tasks_without_tsd_scan_count || 0)}
                        </div>
                      </div>
                      <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", padding: "6px 8px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Первый начатый unit</div>
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>
                          {stats.summary.team_efficiency.first_started_unit_barcode || "—"}
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                          {formatDateTime(stats.summary.team_efficiency.first_started_unit_at || null)}
                        </div>
                      </div>
                      <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", padding: "6px 8px" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>Последний начатый unit</div>
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>
                          {stats.summary.team_efficiency.last_started_unit_barcode || "—"}
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                          {formatDateTime(stats.summary.team_efficiency.last_started_unit_at || null)}
                        </div>
                      </div>
                    </div>

                    <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", overflow: "hidden" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(220px, 1fr) 120px",
                          gap: 8,
                          padding: "6px 8px",
                          borderBottom: "1px solid #1f2937",
                          fontSize: 11,
                          color: "#94a3b8",
                          fontWeight: 700,
                        }}
                      >
                        <div>Сотрудник (TSD)</div>
                        <div style={{ textAlign: "right" }}>Отсканировано</div>
                      </div>
                      {(stats.summary.team_efficiency.tasks_per_tsd || []).length > 0 ? (
                        stats.summary.team_efficiency.tasks_per_tsd.map((row) => (
                          <div
                            key={row.user_id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(220px, 1fr) 120px",
                              gap: 8,
                              padding: "6px 8px",
                              borderBottom: "1px solid #1f2937",
                              fontSize: 12,
                              color: "#cbd5e1",
                            }}
                          >
                            <div>{row.user_name}</div>
                            <div style={{ textAlign: "right", fontWeight: 700 }}>{row.tasks_count}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "8px", fontSize: 12, color: "#94a3b8" }}>
                          Нет задач с зафиксированным TSD-исполнителем
                        </div>
                      )}
                    </div>
                    <div style={{ border: "1px solid #334155", borderRadius: 8, background: "#111827", overflow: "hidden", marginTop: 8 }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(220px, 1fr) 120px",
                          gap: 8,
                          padding: "6px 8px",
                          borderBottom: "1px solid #1f2937",
                          fontSize: 11,
                          color: "#94a3b8",
                          fontWeight: 700,
                        }}
                      >
                        <div>Сотрудник (worker)</div>
                        <div style={{ textAlign: "right" }}>Отгружено (OUT, по picked_by)</div>
                      </div>
                      {(stats.summary.team_efficiency.shipped_tasks_per_user || []).length > 0 ? (
                        stats.summary.team_efficiency.shipped_tasks_per_user!.map((row) => (
                          <div
                            key={`ship-${row.user_id}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(220px, 1fr) 120px",
                              gap: 8,
                              padding: "6px 8px",
                              borderBottom: "1px solid #1f2937",
                              fontSize: 12,
                              color: "#cbd5e1",
                            }}
                          >
                            <div>{row.user_name}</div>
                            <div style={{ textAlign: "right", fontWeight: 700 }}>{row.tasks_count}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "8px", fontSize: 12, color: "#94a3b8" }}>
                          Нет данных по исполнителям отгрузки
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>Нет данных по эффективности команды</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
