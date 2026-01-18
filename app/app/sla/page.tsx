"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Metrics = {
  total_units: number;
  units_over_24h: number;
  avg_processing_time_hours: number;
  units_by_status: Record<string, number>;
  old_units_by_status: Record<string, number>;
  out_total_shipments: number;
  out_returned_shipments: number;
  out_return_rate_percent: number;
  picking_avg_time_hours: number;
  picking_total_tasks: number;
  picking_completed_tasks: number;
  top_oldest_units: Array<{
    barcode: string;
    status: string;
    age_hours: number;
    created_at: string;
  }>;
  age_distribution: Record<string, number>;
};

function MetricCard({
  title,
  value,
  subtitle,
  color = "#2563eb",
  info,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  info?: string;
}) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "var(--radius-lg)",
        padding: "var(--spacing-lg)",
        boxShadow: "var(--shadow-sm)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>
          {title}
        </div>
        {info && (
          <div
            onMouseEnter={() => setShowInfo(true)}
            onMouseLeave={() => setShowInfo(false)}
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#e5e7eb",
              color: "#6b7280",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "help",
            }}
          >
            ?
          </div>
        )}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color, marginBottom: 4 }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: info ? 8 : 0 }}>{subtitle}</div>
      )}
      {info && (
        <div
          style={{
            fontSize: 11,
            color: "#6b7280",
            lineHeight: 1.4,
            padding: "6px 8px",
            background: "#f9fafb",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            marginTop: 8,
            maxHeight: showInfo ? 200 : 0,
            overflow: "hidden",
            transition: "max-height 0.2s ease",
          }}
        >
          {info}
        </div>
      )}
    </div>
  );
}

function BarChart({ data, max }: { data: Array<{ label: string; value: number; color?: string }>; max?: number }) {
  const maxValue = max || Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={{ display: "grid", gap: "var(--spacing-sm)" }}>
      {data.map((item, idx) => (
        <div key={idx}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              {item.label}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: item.color || "#2563eb" }}>
              {item.value}
            </span>
          </div>
          <div
            style={{
              height: 8,
              background: "#f3f4f6",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: item.color || "#2563eb",
                width: `${(item.value / maxValue) * 100}%`,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ value, max, label, color = "#2563eb" }: { value: number; max: number; label: string; color?: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{ textAlign: "center" }}>
      <svg width="120" height="120" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#f3f4f6"
          strokeWidth="10"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div style={{ marginTop: "-70px", fontSize: 24, fontWeight: 700, color }}>{Math.round(percentage)}%</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function SLAPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  async function loadMetrics() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sla/metrics", { cache: "no-store" });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const json = await res.json();

      if (res.ok && json.ok) {
        setMetrics(json.metrics);
      } else {
        setError(json.error || "Ошибка загрузки метрик");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  if (loading && !metrics) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--spacing-xl)", textAlign: "center" }}>
        <div style={{ fontSize: 18, color: "#6b7280" }}>Загрузка метрик...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--spacing-xl)" }}>
        <div
          style={{
            background: "#fee",
            border: "1px solid #fcc",
            borderRadius: "var(--radius-md)",
            padding: "var(--spacing-md)",
            color: "#c00",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const statusColors: Record<string, string> = {
    receiving: "#3b82f6",
    storage: "#10b981",
    picking: "#f59e0b",
    shipping: "#ef4444",
    out: "#8b5cf6",
    bin: "#a855f7",
    transfer: "#06b6d4",
  };

  const statusBarData = Object.entries(metrics.units_by_status).map(([status, count]) => ({
    label: status,
    value: count,
    color: statusColors[status] || "#6b7280",
  }));

  const oldStatusBarData = Object.entries(metrics.old_units_by_status).map(([status, count]) => ({
    label: `${status} (>24h)`,
    value: count,
    color: statusColors[status] || "#6b7280",
  }));

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--spacing-xl)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-xl)" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            📊 SLA Dashboard
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Мониторинг производительности и задержек на складе
          </p>
        </div>
        <button
          onClick={loadMetrics}
          style={{
            padding: "var(--spacing-sm) var(--spacing-md)",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-md)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          🔄 Обновить
        </button>
      </div>

      {/* Key Metrics Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "var(--spacing-lg)", marginBottom: "var(--spacing-xl)" }}>
        <MetricCard
          title="Всего заказов"
          value={metrics.total_units}
          subtitle="В системе"
          color="#2563eb"
          info="📊 Источник: таблица units. Подсчитываются все заказы вашего склада независимо от статуса."
        />
        <MetricCard
          title="Залежалые заказы"
          value={metrics.units_over_24h}
          subtitle="> 24 часов на складе"
          color={metrics.units_over_24h > 0 ? "#ef4444" : "#10b981"}
          info="⏰ Источник: units где created_at старше 24 часов. Исключаются shipped и out. Красный цвет — есть проблемы, зелёный — всё ОК."
        />
        <MetricCard
          title="Среднее время обработки"
          value={`${metrics.avg_processing_time_hours}ч`}
          subtitle="От приемки до отгрузки"
          color="#f59e0b"
          info="⚡ Источник: audit_events (действия unit.create → logistics.ship_out). Среднее время за последние 7 дней."
        />
        <MetricCard
          title="Процент возвратов"
          value={`${metrics.out_return_rate_percent}%`}
          subtitle="Из OUT обратно на склад"
          color={metrics.out_return_rate_percent > 20 ? "#ef4444" : "#10b981"}
          info="📦 Источник: outbound_shipments (status='returned' / total). Данные за 7 дней. Если >20% — красный, иначе зелёный."
        />
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--spacing-lg)", marginBottom: "var(--spacing-lg)" }}>
        {/* Current Status Distribution */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            Распределение заказов по статусам
          </h2>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: "var(--spacing-md)", lineHeight: 1.4 }}>
            📊 Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>units.status</code> — текущий снимок всех заказов на складе
          </div>
          <BarChart data={statusBarData} />
        </div>

        {/* Old Units Distribution */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            Залежалые заказы (&gt;24ч) по статусам
          </h2>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: "var(--spacing-md)", lineHeight: 1.4 }}>
            ⏰ Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>units</code> где created_at &lt; now() - 24h, исключая shipped/out
          </div>
          {oldStatusBarData.length > 0 ? (
            <BarChart data={oldStatusBarData} />
          ) : (
            <div style={{ textAlign: "center", padding: "var(--spacing-xl)", color: "#9ca3af" }}>
              Нет залежалых заказов 🎉
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "var(--spacing-lg)", marginBottom: "var(--spacing-lg)" }}>
        {/* Donut Charts */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            Производительность
          </h2>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: "var(--spacing-md)", lineHeight: 1.4 }}>
            📈 Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>picking_tasks</code> и <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>outbound_shipments</code> за последние 7 дней
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--spacing-md)" }}>
            <DonutChart
              value={metrics.picking_completed_tasks}
              max={metrics.picking_total_tasks}
              label="Задачи выполнены"
              color="#10b981"
            />
            <DonutChart
              value={metrics.out_total_shipments - metrics.out_returned_shipments}
              max={metrics.out_total_shipments}
              label="Успешно доставлено"
              color="#2563eb"
            />
          </div>
        </div>

        {/* Top Oldest Units Table */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            🚨 Топ-10 самых долгих заказов
          </h2>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: "var(--spacing-md)", lineHeight: 1.4 }}>
            📦 Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>units</code> старше 24ч, сортировка по created_at (старые сверху)
          </div>
          {metrics.top_oldest_units.length > 0 ? (
            <div style={{ maxHeight: 300, overflow: "auto" }}>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                    <th style={{ padding: "8px 0", fontWeight: 600, color: "#6b7280" }}>Заказ</th>
                    <th style={{ padding: "8px 0", fontWeight: 600, color: "#6b7280" }}>Статус</th>
                    <th style={{ padding: "8px 0", fontWeight: 600, color: "#6b7280", textAlign: "right" }}>
                      Возраст (часы)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.top_oldest_units.map((unit, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "8px 0", fontWeight: 600 }}>{unit.barcode}</td>
                      <td style={{ padding: "8px 0" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            background: statusColors[unit.status] || "#e5e7eb",
                            color: "#fff",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {unit.status}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "8px 0",
                          textAlign: "right",
                          fontWeight: 700,
                          color: unit.age_hours > 48 ? "#ef4444" : "#f59e0b",
                        }}
                      >
                        {unit.age_hours}ч
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "var(--spacing-xl)", color: "#9ca3af" }}>
              Все заказы обработаны быстро 🎉
            </div>
          )}
        </div>
      </div>

      {/* Additional Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--spacing-lg)" }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            ⏱️ Среднее время picking
          </h3>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8, lineHeight: 1.3 }}>
            Источник: picking_tasks (разница created_at → completed_at)
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#2563eb" }}>
            {metrics.picking_avg_time_hours}ч
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {metrics.picking_total_tasks} задач за 7 дней
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            📦 OUT отправки
          </h3>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8, lineHeight: 1.3 }}>
            Источник: outbound_shipments (все + с status='returned')
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#8b5cf6" }}>
            {metrics.out_total_shipments}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {metrics.out_returned_shipments} возвращено за 7 дней
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            ✅ Процент завершенных задач
          </h3>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8, lineHeight: 1.3 }}>
            Источник: picking_tasks (status='done' / total tasks)
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>
            {metrics.picking_total_tasks > 0
              ? Math.round((metrics.picking_completed_tasks / metrics.picking_total_tasks) * 100)
              : 0}
            %
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {metrics.picking_completed_tasks} / {metrics.picking_total_tasks}
          </div>
        </div>
      </div>
    </div>
  );
}
