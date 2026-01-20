"use client";

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { useRouter } from "next/navigation";

// ⚡ Force dynamic for real-time SLA metrics
export const dynamic = 'force-dynamic';

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
  bin_cells: Array<{
    cell_code: string;
    cell_id: string;
    unit_barcode: string;
    unit_id: string;
    unit_status: string;
    time_in_cell_hours: number;
    time_in_cell_minutes: number;
    placed_at: string;
  }>;
};

type ProcessingMetrics = {
  period: string;
  total_tasks: number;
  avg_processing_time_hours: number;
  avg_processing_time_minutes: number;
  min_time_hours: number;
  max_time_hours: number;
  tasks_count: number;
};

type ShippingSLAMetrics = {
  period: string;
  total_tasks: number;
  open_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  avg_completion_time_hours: number;
  avg_completion_time_minutes: number;
  avg_current_wait_time_hours: number;
  avg_current_wait_time_minutes: number;
  min_time_hours: number;
  max_time_hours: number;
};

type MerchantRejectionMetrics = {
  total_units: number;
  avg_bin_to_ticket_hours: number;
  avg_bin_to_ticket_minutes: number;
  avg_ticket_resolution_hours: number;
  avg_ticket_resolution_minutes: number;
  units_with_tickets: number;
  units_resolved: number;
};

// ⚡ OPTIMIZATION: Memoized MetricCard component
const MetricCard = memo(function MetricCard({
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

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)",
        border: "2px solid #e5e7eb",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)",
        position: "relative",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 12px 24px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)";
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)";
        e.currentTarget.style.borderColor = "#e5e7eb";
      }}
    >
      {/* Decorative gradient overlay */}
      <div style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: "40%",
        height: "100%",
        background: `linear-gradient(135deg, transparent 0%, ${color}08 100%)`,
        opacity: 0.5,
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative", zIndex: 1 }}>
        <div style={{ 
          fontSize: 13, 
          color: "#6b7280", 
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          {title}
        </div>
      </div>
      <div style={{ 
        fontSize: 40, 
        fontWeight: 800, 
        color,
        marginBottom: 8,
        letterSpacing: "-0.02em",
        position: "relative",
        zIndex: 1,
      }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ 
          fontSize: 13, 
          color: "#9ca3af",
          fontWeight: 600,
          marginBottom: info ? 8 : 0,
          position: "relative",
          zIndex: 1,
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
});

// ⚡ OPTIMIZATION: Memoized BarChart component
const BarChart = memo(function BarChart({ data, max }: { data: Array<{ label: string; value: number; color?: string }>; max?: number }) {
  const maxValue = max || Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {data.map((item, idx) => (
        <div key={idx}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ 
              fontSize: 13, 
              fontWeight: 700, 
              color: "#374151",
              letterSpacing: "0.01em",
            }}>
              {item.label}
            </span>
            <span style={{ 
              fontSize: 14, 
              fontWeight: 800, 
              color: item.color || "#2563eb",
              background: `${item.color || "#2563eb"}10`,
              padding: "2px 8px",
              borderRadius: 6,
            }}>
              {item.value}
            </span>
          </div>
          <div
            style={{
              height: 10,
              background: "#f3f4f6",
              borderRadius: 999,
              overflow: "hidden",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                height: "100%",
                background: `linear-gradient(90deg, ${item.color || "#2563eb"} 0%, ${item.color || "#2563eb"}dd 100%)`,
                width: `${(item.value / maxValue) * 100}%`,
                transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                borderRadius: 999,
                boxShadow: `0 0 8px ${item.color || "#2563eb"}40`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
});

// ⚡ OPTIMIZATION: Memoized DonutChart component
const DonutChart = memo(function DonutChart({ value, max, label, color = "#2563eb" }: { value: number; max: number; label: string; color?: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{ textAlign: "center", position: "relative" }}>
      <svg width="140" height="140" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.08))" }}>
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#f3f4f6"
          strokeWidth="12"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={`url(#gradient-${color})`}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={`${color}cc`} />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ 
        marginTop: "-80px", 
        fontSize: 32, 
        fontWeight: 800, 
        color,
        letterSpacing: "-0.02em",
      }}>
        {Math.round(percentage)}%
      </div>
      <div style={{ 
        fontSize: 12, 
        color: "#6b7280", 
        marginTop: 56,
        fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{ 
        fontSize: 11, 
        color: "#9ca3af", 
        marginTop: 4,
        fontWeight: 500,
      }}>
        {value} из {max}
      </div>
    </div>
  );
});

export default function SLAPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New metrics states
  const [processingMetrics, setProcessingMetrics] = useState<ProcessingMetrics | null>(null);
  const [shippingSLAMetrics, setShippingSLAMetrics] = useState<ShippingSLAMetrics | null>(null);
  const [rejectionMetrics, setRejectionMetrics] = useState<MerchantRejectionMetrics | null>(null);
  
  // Telegram notification states (v2)
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
    loadProcessingMetrics();
    loadShippingSLAMetrics();
    loadRejectionMetrics();
    const interval = setInterval(() => {
      loadMetrics();
      loadProcessingMetrics();
      loadShippingSLAMetrics();
      loadRejectionMetrics();
    }, 60000); // Refresh every minute
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

  async function loadProcessingMetrics() {
    try {
      const res = await fetch("/api/stats/processing-metrics?period=today", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) setProcessingMetrics(json.metrics);
      }
    } catch (e) {
      console.error("Failed to load processing metrics:", e);
    }
  }

  async function loadShippingSLAMetrics() {
    try {
      const res = await fetch("/api/stats/shipping-tasks-sla?period=today", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) setShippingSLAMetrics(json.metrics);
      }
    } catch (e) {
      console.error("Failed to load shipping SLA metrics:", e);
    }
  }

  async function loadRejectionMetrics() {
    try {
      const res = await fetch("/api/stats/merchant-rejection-metrics?rejection_count=all", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) setRejectionMetrics(json.metrics);
      }
    } catch (e) {
      console.error("Failed to load rejection metrics:", e);
    }
  }

  async function sendToTelegram() {
    setSendingTelegram(true);
    setTelegramStatus(null);
    
    try {
      const res = await fetch('/api/telegram/send-sla-report', {
        method: 'POST',
      });
      
      const json = await res.json();
      
      if (res.ok) {
        setTelegramStatus('✅ Отправлено в Telegram');
      } else {
        setTelegramStatus('❌ ' + (json.error || 'Ошибка отправки'));
      }
    } catch (e: any) {
      setTelegramStatus('❌ ' + (e.message || 'Ошибка отправки'));
    } finally {
      setSendingTelegram(false);
      // Auto-hide status after 5 seconds
      setTimeout(() => setTelegramStatus(null), 5000);
    }
  }

  if (loading && !metrics) {
    return (
      <div style={{ 
        maxWidth: 1400, 
        margin: "0 auto", 
        padding: "40px 24px",
      }}>
        {/* Header skeleton */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            width: 280,
            height: 40,
            background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
            borderRadius: 8,
            marginBottom: 12,
          }} />
          <div style={{
            width: 400,
            height: 20,
            background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
            borderRadius: 6,
          }} />
        </div>

        {/* Metrics cards skeleton */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", 
          gap: 20,
          marginBottom: 40,
        }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              height: 140,
              background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
              borderRadius: 12,
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
        </div>

        {/* Charts skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 24 }}>
          {[1, 2].map((i) => (
            <div key={i} style={{
              height: 300,
              background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
              borderRadius: 12,
              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>

        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        maxWidth: 600,
        margin: "0 auto",
        padding: "80px 24px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
        <h2 style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#dc2626",
          marginBottom: 12,
        }}>
          Ошибка загрузки метрик
        </h2>
        <div style={{
          color: "#6b7280",
          marginBottom: 24,
          fontSize: 14,
          lineHeight: 1.6,
        }}>
          {error}
        </div>
        <button
          onClick={loadMetrics}
          style={{
            padding: "12px 24px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(102, 126, 234, 0.3)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(102, 126, 234, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.3)";
          }}
        >
          🔄 Попробовать снова
        </button>
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
    <div style={{ 
      maxWidth: 1400, 
      margin: "0 auto", 
      padding: "32px 24px",
      background: "linear-gradient(to bottom, #fafafa 0%, #ffffff 100%)",
      minHeight: "100vh",
    }}>
      {/* Modern Header */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "flex-start",
        marginBottom: 40,
        flexWrap: "wrap",
        gap: 20,
      }}>
        <div>
          <h1 style={{ 
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 8,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.02em",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            📊 SLA Dashboard
          </h1>
          <p style={{ 
            color: "#6b7280", 
            fontSize: 15,
            fontWeight: 500,
            margin: 0,
          }}>
            Мониторинг производительности и задержек на складе • Обновляется каждую минуту
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={loadMetrics}
            disabled={loading}
            style={{
              padding: "12px 20px",
              background: loading 
                ? "#e5e7eb"
                : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: loading ? "#9ca3af" : "white",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading 
                ? "none"
                : "0 4px 12px rgba(102, 126, 234, 0.3)",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(102, 126, 234, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.3)";
              }
            }}
          >
            <span>{loading ? "⏳" : "🔄"}</span>
            <span>{loading ? "Обновление..." : "Обновить"}</span>
          </button>

          <button
            onClick={sendToTelegram}
            disabled={sendingTelegram}
            style={{
              padding: "12px 20px",
              background: sendingTelegram 
                ? "#e5e7eb"
                : "linear-gradient(135deg, #0088cc 0%, #00a8e8 100%)",
              color: sendingTelegram ? "#9ca3af" : "white",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: sendingTelegram ? "not-allowed" : "pointer",
              boxShadow: sendingTelegram 
                ? "none"
                : "0 4px 12px rgba(0, 136, 204, 0.3)",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            onMouseEnter={(e) => {
              if (!sendingTelegram) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 136, 204, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (!sendingTelegram) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 136, 204, 0.3)";
              }
            }}
          >
            <span>{sendingTelegram ? "⏳" : "📱"}</span>
            <span>{sendingTelegram ? "Отправка..." : "Отправить в Telegram"}</span>
          </button>

          {telegramStatus && (
            <div style={{
              padding: "12px 20px",
              background: telegramStatus.startsWith('✅') ? "#d1fae5" : "#fee2e2",
              color: telegramStatus.startsWith('✅') ? "#065f46" : "#991b1b",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            }}>
              {telegramStatus}
            </div>
          )}
        </div>
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
            📈 Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>picking_tasks</code> (задачи на отгрузку) и 
            <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3, marginLeft: 4 }}>outbound_shipments</code> (отправленные заказы) за последние 7 дней. 
            <strong style={{ color: "#6b7280" }}>Задачи выполнены:</strong> процент завершенных задач от общего числа созданных (done/total). 
            <strong style={{ color: "#6b7280" }}>Успешно доставлено:</strong> процент отправок без возврата (отправлено - возвращено) / всего отправок.
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--spacing-lg)", marginBottom: "var(--spacing-lg)" }}>
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

      {/* Bin Cells Section - Always visible */}
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
          🗄️ Мониторинг ячеек BIN
        </h2>
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: "var(--spacing-md)", lineHeight: 1.4 }}>
          📊 Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>units</code> с привязкой к ячейкам типа bin. Показывается последний размещенный заказ в каждой ячейке и время его нахождения там.
        </div>
        
        {metrics.bin_cells && metrics.bin_cells.length > 0 ? (
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#6b7280" }}>Ячейка</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#6b7280" }}>Заказ</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#6b7280" }}>Статус</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#6b7280", textAlign: "right" }}>
                    Время в ячейке
                  </th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, color: "#6b7280", textAlign: "right" }}>
                    Размещен
                  </th>
                </tr>
              </thead>
              <tbody>
                {metrics.bin_cells.map((bin, idx) => {
                  const totalMinutes = bin.time_in_cell_hours * 60 + bin.time_in_cell_minutes;
                  const isWarning = totalMinutes > 24 * 60; // >24 hours
                  const isCritical = totalMinutes > 48 * 60; // >48 hours

                  return (
                    <tr 
                      key={idx} 
                      style={{ 
                        borderBottom: "1px solid #f3f4f6",
                        background: isCritical ? "#fef2f2" : isWarning ? "#fffbeb" : "transparent"
                      }}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "#2563eb" }}>
                        {bin.cell_code}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                        <a 
                          href={`/app/units/${bin.unit_id}`}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                          onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                          onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                        >
                          {bin.unit_barcode}
                        </a>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            background: statusColors[bin.unit_status] || "#e5e7eb",
                            color: "#fff",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {bin.unit_status}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontWeight: 700,
                          color: isCritical ? "#dc2626" : isWarning ? "#f59e0b" : "#10b981",
                        }}
                      >
                        {bin.time_in_cell_hours > 0 && `${bin.time_in_cell_hours}ч `}
                        {bin.time_in_cell_minutes}мин
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        {new Date(bin.placed_at).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div 
            style={{ 
              textAlign: "center", 
              padding: "var(--spacing-xl)", 
              background: "#f9fafb",
              borderRadius: "var(--radius-md)",
              border: "1px dashed #d1d5db"
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
              Нет данных по BIN ячейкам
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              Убедитесь что в БД есть ячейки с типом "bin" и в них размещены заказы
            </div>
          </div>
        )}
      </div>

      {/* Processing Time: Storage/Shipping → OPS */}
      {processingMetrics && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
            marginTop: "var(--spacing-lg)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            ⏱️ Storage/Shipping → Создание задачи OPS
          </h2>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16, lineHeight: 1.4 }}>
            📊 Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>unit_moves</code> → 
            <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3, marginLeft: 4 }}>picking_tasks</code>. 
            Считается время от первого попадания заказа в ячейку storage/shipping до создания задачи OPS. Показывает как быстро OPS реагирует на доступные заказы.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <MetricCard
              title="Всего задач (сегодня)"
              value={processingMetrics.total_tasks}
              color="#374151"
              info="📋 Общее количество задач на обработку (перемещение, приемка, размещение), созданных сегодня."
            />
            <MetricCard
              title="Среднее время"
              value={`${processingMetrics.avg_processing_time_hours}ч ${processingMetrics.avg_processing_time_minutes}м`}
              color="#0284c7"
              info="⏱️ Среднее время выполнения задачи от момента создания до завершения. Показывает общую эффективность обработки."
            />
            <MetricCard
              title="Минимум"
              value={`${processingMetrics.min_time_hours}ч`}
              color="#10b981"
              info="🚀 Самая быстрая задача за сегодня. Показывает минимально возможное время при идеальных условиях."
            />
            <MetricCard
              title="Максимум"
              value={`${processingMetrics.max_time_hours}ч`}
              color="#dc2626"
              info="⚠️ Самая долгая задача за сегодня. Высокое значение может указывать на проблемы или сложные задачи."
            />
          </div>
        </div>
      )}

      {/* Shipping Tasks SLA */}
      {shippingSLAMetrics && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
            marginTop: "var(--spacing-lg)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            📦 SLA Заданий на отгрузку (OPS → ТСД)
          </h2>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16, lineHeight: 1.4 }}>
            📊 Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>picking_tasks</code>. 
            Время от создания задания OPS (<code>created_at</code>) до завершения в ТСД (<code>completed_at</code> или <code>picked_at</code>). 
            Открытые задания показывают текущее время ожидания. Помогает отслеживать загруженность ТСД и скорость обработки.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 16 }}>
            <MetricCard
              title="Всего задач (сегодня)"
              value={shippingSLAMetrics.total_tasks}
              color="#374151"
              info="📦 Общее количество задач отгрузки (перемещение из ячеек в зону shipping), созданных сегодня."
            />
            <MetricCard
              title="Открыто"
              value={shippingSLAMetrics.open_tasks}
              color="#f59e0b"
              subtitle="Ожидают начала"
              info="⏳ Задачи в статусе 'open' — созданы, но еще не взяты в работу складчиком. Ждут своей очереди."
            />
            <MetricCard
              title="В работе"
              value={shippingSLAMetrics.in_progress_tasks}
              color="#ea580c"
              subtitle="Выполняются сейчас"
              info="🔄 Задачи в статусе 'in_progress' — складчик активно работает над ними прямо сейчас."
            />
            <MetricCard
              title="Завершено"
              value={shippingSLAMetrics.completed_tasks}
              color="#10b981"
              subtitle="Выполнено сегодня"
              info="✅ Задачи в статусе 'completed' — успешно завершены за сегодня. Заказы перемещены в зону отгрузки."
            />
            <MetricCard
              title="Среднее (завершенные)"
              value={`${shippingSLAMetrics.avg_completion_time_hours}ч ${shippingSLAMetrics.avg_completion_time_minutes}м`}
              color="#0284c7"
              info="⚡ Среднее время выполнения завершенных задач отгрузки. Показывает скорость обработки отгрузки."
            />
          </div>
          {shippingSLAMetrics.avg_current_wait_time_hours > 0 && (
            <div
              style={{
                padding: 16,
                background: "#fef2f2",
                borderRadius: 8,
                border: "1px solid #fecaca",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "#dc2626", marginBottom: 4 }}>
                ⚠️ Среднее время ожидания (активные задачи)
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#dc2626" }}>
                {shippingSLAMetrics.avg_current_wait_time_hours}ч {shippingSLAMetrics.avg_current_wait_time_minutes}м
              </div>
            </div>
          )}
        </div>
      )}

      {/* Merchant Rejection Metrics */}
      {rejectionMetrics && rejectionMetrics.total_units > 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "var(--radius-lg)",
            padding: "var(--spacing-lg)",
            boxShadow: "var(--shadow-sm)",
            marginTop: "var(--spacing-lg)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
            🚫 Мерчант не принял
          </h2>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16, lineHeight: 1.4 }}>
            📊 Источник: <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3 }}>units.meta</code> (merchant_rejections) + 
            <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3, marginLeft: 4 }}>unit_moves</code> (bin) + 
            <code style={{ background: "#f3f4f6", padding: "2px 4px", borderRadius: 3, marginLeft: 4 }}>merchant_rejection_ticket</code>. 
            "BIN → Тикет" — время от попадания в BIN до создания тикета. "Тикет → Решение" — время работы над проблемой. Критичные метрики для контроля качества возвратов.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <MetricCard
              title="Всего проблемных"
              value={rejectionMetrics.total_units}
              color="#dc2626"
              subtitle="Требуют внимания"
              info="⚠️ Общее количество заказов с проблемами (брак, повреждения, несоответствия). Находятся в зоне BIN или на рассмотрении."
            />
            <MetricCard
              title="BIN → Тикет"
              value={`${rejectionMetrics.avg_bin_to_ticket_hours}ч ${rejectionMetrics.avg_bin_to_ticket_minutes}м`}
              color="#ea580c"
              subtitle="Время реакции"
              info="⏱️ Среднее время от помещения заказа в BIN до создания тикета для решения проблемы. Чем быстрее, тем лучше."
            />
            <MetricCard
              title="Тикет → Решение"
              value={`${rejectionMetrics.avg_ticket_resolution_hours}ч ${rejectionMetrics.avg_ticket_resolution_minutes}м`}
              color="#f59e0b"
              subtitle="Время решения"
              info="🔧 Среднее время от создания тикета до решения проблемы. Показывает эффективность работы с проблемными заказами."
            />
            <MetricCard
              title="Решено"
              value={rejectionMetrics.units_resolved}
              color="#10b981"
              subtitle="Проблемы устранены"
              info="✅ Количество проблемных заказов, по которым проблема была успешно решена и они могут продолжить обработку."
            />
          </div>
        </div>
      )}

    </div>
  );
}
