"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const OPS_STATUS_LABELS: Record<string, string> = {
  in_progress: "В работе",
  partner_accepted_return: "Партнер принял на возврат",
  partner_rejected_return: "Партнер не принял на возврат",
  sent_to_sc: "Передан в СЦ",
  delivered_to_rc: "Товар доставлен на РЦ",
  client_accepted: "Клиент принял",
  client_rejected: "Клиент не принял",
  sent_to_client: "Товар отправлен клиенту",
  delivered_to_pudo: "Товар доставлен на ПУДО",
  case_cancelled_cc: "Кейс отменен (Направлен КК)",
  postponed_1: "Перенос",
  postponed_2: "Перенос 2",
  warehouse_did_not_issue: "Склад не выдал",
  no_report: "Отчета нет",
};

export default function OutboundAdminPage() {
  const router = useRouter();
  const [date, setDate] = useState<string>("");
  const [status, setStatus] = useState<string>("in_progress");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ total: number; updated: number; skipped: number } | null>(null);
  const [role, setRole] = useState<string>("guest");

  useEffect(() => {
    async function loadRole() {
      const res = await fetch("/api/me");
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.role) {
        setRole(json.role);
      }
    }
    loadRole();
  }, []);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/out-ops-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          status,
          overwriteExisting,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.error || "Ошибка выполнения");
        return;
      }

      setResult({
        total: json.total || 0,
        updated: json.updated || 0,
        skipped: json.skipped || 0,
      });
    } catch (e: any) {
      setError(e.message || "Ошибка выполнения");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "var(--spacing-xl)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.push("/app/outbound")}
          style={{
            padding: "6px 12px",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
        >
          ← Назад
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Админ панель: массовый OPS статус (OUT)</h1>
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
        Роль пользователя: <strong>{role}</strong>. Доступ только для admin.
      </div>

      {role !== "admin" && (
        <div style={{ background: "#fee", border: "1px solid #fcc", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          Доступ запрещен. Требуется роль admin.
        </div>
      )}

      {error && (
        <div style={{ background: "#fee", border: "1px solid #fcc", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ background: "#ecfdf3", border: "1px solid #86efac", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          Всего отправок: <strong>{result.total}</strong>. Обновлено: <strong>{result.updated}</strong>. Пропущено:{" "}
          <strong>{result.skipped}</strong>.
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Дата отправки (OUT)</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>OPS статус</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6, background: "#fff" }}
            >
              {Object.entries(OPS_STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6b7280" }}>
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
            />
            Перезаписывать существующие OPS статусы
          </label>

          <button
            onClick={handleSubmit}
            disabled={loading || !date || role !== "admin"}
            style={{
              padding: "10px 16px",
              background: loading || !date ? "#e5e7eb" : "#111827",
              color: loading || !date ? "#6b7280" : "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading || !date ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Обновление..." : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
