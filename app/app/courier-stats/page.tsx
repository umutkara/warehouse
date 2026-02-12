"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type CourierSummary = {
  courier_name: string;
  total_finalized: number;
  payable_count: number;
  non_payable_count: number;
  total_amount: number;
};

type CourierRow = {
  unit_id: string;
  barcode: string;
  courier_name: string;
  out_at: string;
  shipment_status: string;
  final_ops_status: string | null;
  final_ops_status_label: string;
  final_ops_status_at: string;
  ops_comment: string | null;
  is_payable: boolean;
  payment_amount: number;
};

type ApiResponse = {
  ok: boolean;
  filters: { from: string; to: string; courier: string; status: string };
  payable_statuses: string[];
  couriers: string[];
  summary: {
    total_finalized: number;
    payable_count: number;
    non_payable_count: number;
    total_amount: number;
    rate_per_order: number;
  };
  by_courier: CourierSummary[];
  rows: CourierRow[];
  error?: string;
};

const STATUS_OPTIONS = [
  { value: "all", label: "Все финальные статусы" },
  { value: "payable", label: "Только оплачиваемые" },
  { value: "non_payable", label: "Только не оплачиваемые" },
  { value: "partner_accepted_return", label: "Партнер принял на возврат" },
  { value: "sent_to_sc", label: "Передан в СЦ" },
  { value: "client_accepted", label: "Клиент принял" },
  { value: "sent_to_client", label: "Товар отправлен клиенту" },
  { value: "partner_rejected_return", label: "Партнер не принял на возврат" },
  { value: "delivered_to_rc", label: "Товар доставлен на РЦ" },
  { value: "client_rejected", label: "Клиент не принял" },
  { value: "delivered_to_pudo", label: "Товар доставлен на ПУДО" },
  { value: "case_cancelled_cc", label: "Кейс отменен (Направлен КК)" },
  { value: "postponed_1", label: "Перенос" },
  { value: "postponed_2", label: "Перенос 2" },
  { value: "warehouse_did_not_issue", label: "Склад не выдал" },
  { value: "in_progress", label: "В работе" },
  { value: "no_report", label: "Отчета нет" },
];

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CourierStatsPage() {
  const router = useRouter();

  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(
    () => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
    [today]
  );

  const [fromDate, setFromDate] = useState(toDateInputValue(monthStart));
  const [toDate, setToDate] = useState(toDateInputValue(today));
  const [courier, setCourier] = useState("");
  const [status, setStatus] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        status,
      });
      if (courier.trim()) {
        params.set("courier", courier.trim());
      }

      const res = await fetch(`/api/stats/courier-payments?${params.toString()}`, {
        cache: "no-store",
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok) {
        setError(json.error || "Ошибка загрузки статистики");
        return;
      }
      setData(json);
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки статистики");
    } finally {
      setLoading(false);
    }
  }

  function handleResetFilters() {
    setFromDate(toDateInputValue(monthStart));
    setToDate(toDateInputValue(today));
    setCourier("");
    setStatus("all");
  }

  function handleExportXlsx() {
    if (!data || data.rows.length === 0) {
      alert("Нет данных для экспорта");
      return;
    }

    const rows = data.rows.map((row) => ({
      "Курьер": row.courier_name,
      "Заказ (штрихкод)": row.barcode,
      "Дата OUT": formatDate(row.out_at),
      "Финальный OPS статус": row.final_ops_status_label,
      "Код OPS статуса": row.final_ops_status || "—",
      "Дата финального OPS статуса": formatDate(row.final_ops_status_at),
      "Комментарий OPS": row.ops_comment || "",
      "Оплачивается": row.is_payable ? "Да" : "Нет",
      "Сумма (у.е.)": row.payment_amount,
    }));

    const wb = XLSX.utils.book_new();
    const wsRows = XLSX.utils.json_to_sheet(rows);
    wsRows["!cols"] = [
      { wch: 24 },
      { wch: 20 },
      { wch: 20 },
      { wch: 30 },
      { wch: 24 },
      { wch: 26 },
      { wch: 40 },
      { wch: 14 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRows, "Детализация");

    const wsSummary = XLSX.utils.json_to_sheet(
      (data.by_courier || []).map((item) => ({
        "Курьер": item.courier_name,
        "Финальных заказов": item.total_finalized,
        "Оплачиваемых": item.payable_count,
        "Не оплачиваемых": item.non_payable_count,
        "К выплате (у.е.)": item.total_amount,
      }))
    );
    wsSummary["!cols"] = [
      { wch: 24 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Сводка по курьерам");

    const filename = `courier_payments_${fromDate}_${toDate}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--spacing-xl)" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: "var(--spacing-sm)" }}>
        Статистика курьеров
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--spacing-lg)" }}>
        Расчет выплат по дате финального OPS-статуса
      </p>

      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-md)",
          marginBottom: "var(--spacing-lg)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Инструкция</div>
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
          1) Тарификация в этой версии: <strong>1 у.е. за 1 оплачиваемый заказ</strong>.<br />
          2) В выплату идут только OPS статусы: <strong>partner_accepted_return</strong>,{" "}
          <strong>sent_to_sc</strong>, <strong>client_accepted</strong>, <strong>sent_to_client</strong>.<br />
          3) Период отчета считается по <strong>дате финального OPS-статуса</strong>, а не по дате OUT.<br />
          4) Формула выплаты: <strong>к выплате = количество оплачиваемых заказов x 1</strong>.
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: "var(--radius-md)",
            padding: "var(--spacing-md)",
            marginBottom: "var(--spacing-lg)",
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-md)",
          marginBottom: "var(--spacing-lg)",
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
          gap: "var(--spacing-sm)",
          alignItems: "end",
        }}
      >
        <label style={{ fontSize: 13 }}>
          С даты
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ width: "100%", marginTop: 6, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
          />
        </label>

        <label style={{ fontSize: 13 }}>
          По дату
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ width: "100%", marginTop: 6, padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
          />
        </label>

        <label style={{ fontSize: 13 }}>
          Курьер
          <select
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            style={{ width: "100%", marginTop: 6, padding: 8, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" }}
          >
            <option value="">Все курьеры</option>
            {(data?.couriers || []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          OPS фильтр
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ width: "100%", marginTop: 6, padding: 8, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={loadStats}
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: loading ? "#d1d5db" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Загрузка..." : "Применить"}
          </button>
          <button
            onClick={handleResetFilters}
            style={{
              padding: "10px 12px",
              background: "#fff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Сброс
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          gap: "var(--spacing-md)",
          marginBottom: "var(--spacing-lg)",
        }}
      >
        <MetricCard title="Финальных заказов" value={data?.summary.total_finalized ?? 0} />
        <MetricCard title="Оплачиваемых" value={data?.summary.payable_count ?? 0} color="#15803d" />
        <MetricCard title="Не оплачиваемых" value={data?.summary.non_payable_count ?? 0} color="#b91c1c" />
        <MetricCard title="К выплате (у.е.)" value={data?.summary.total_amount ?? 0} color="#1d4ed8" />
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-md)",
          marginBottom: "var(--spacing-lg)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Сводка по курьерам</h2>
          <button
            onClick={handleExportXlsx}
            disabled={!data || data.rows.length === 0}
            style={{
              padding: "8px 14px",
              background: !data || data.rows.length === 0 ? "#d1d5db" : "#059669",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: !data || data.rows.length === 0 ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Экспорт XLSX
          </button>
        </div>
        {!data || data.by_courier.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Нет данных по выбранным фильтрам</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: 10 }}>Курьер</th>
                  <th style={{ textAlign: "right", padding: 10 }}>Финальных</th>
                  <th style={{ textAlign: "right", padding: 10 }}>Оплачиваемых</th>
                  <th style={{ textAlign: "right", padding: 10 }}>Не оплачиваемых</th>
                  <th style={{ textAlign: "right", padding: 10 }}>К выплате</th>
                </tr>
              </thead>
              <tbody>
                {data.by_courier.map((item) => (
                  <tr key={item.courier_name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 10, fontWeight: 600 }}>{item.courier_name}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>{item.total_finalized}</td>
                    <td style={{ padding: 10, textAlign: "right", color: "#15803d", fontWeight: 600 }}>
                      {item.payable_count}
                    </td>
                    <td style={{ padding: 10, textAlign: "right", color: "#b91c1c", fontWeight: 600 }}>
                      {item.non_payable_count}
                    </td>
                    <td style={{ padding: 10, textAlign: "right", fontWeight: 700 }}>{item.total_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-md)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
          Детализация заказов ({data?.rows.length || 0})
        </h2>

        {!data || data.rows.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Нет данных по выбранным фильтрам</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: 8 }}>Курьер</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Заказ</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Дата OUT</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Финальный OPS статус</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Дата финального OPS</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Комментарий OPS</th>
                  <th style={{ textAlign: "center", padding: 8 }}>Оплата</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.unit_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{row.courier_name}</td>
                    <td style={{ padding: 8 }}>{row.barcode}</td>
                    <td style={{ padding: 8 }}>{formatDate(row.out_at)}</td>
                    <td style={{ padding: 8 }}>{row.final_ops_status_label}</td>
                    <td style={{ padding: 8 }}>{formatDate(row.final_ops_status_at)}</td>
                    <td style={{ padding: 8, color: "#475569" }}>{row.ops_comment || "—"}</td>
                    <td
                      style={{
                        padding: 8,
                        textAlign: "center",
                        color: row.is_payable ? "#15803d" : "#b91c1c",
                        fontWeight: 700,
                      }}
                    >
                      {row.is_payable ? "Да" : "Нет"}
                    </td>
                    <td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>{row.payment_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value, color = "#111827" }: { title: string; value: number; color?: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
