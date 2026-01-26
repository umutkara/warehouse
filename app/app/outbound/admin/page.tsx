"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

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
  const [cellCodeToDelete, setCellCodeToDelete] = useState<string>("");
  const [moveBarcode, setMoveBarcode] = useState<string>("");
  const [moveCellCode, setMoveCellCode] = useState<string>("");
  const [clearBarcode, setClearBarcode] = useState<string>("");
  const [clearPickingNote, setClearPickingNote] = useState<string>("");
  const [bulkCellCode, setBulkCellCode] = useState<string>("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ updated: number; errors: Array<{ barcode: string; message: string }> } | null>(null);

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

  async function handleDeleteCell() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cells/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cellCode: cellCodeToDelete }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Ошибка удаления ячейки");
        return;
      }
      setCellCodeToDelete("");
    } catch (e: any) {
      setError(e.message || "Ошибка удаления ячейки");
    } finally {
      setLoading(false);
    }
  }

  async function handleMoveUnit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/units/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: moveBarcode, toCellCode: moveCellCode }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Ошибка перемещения");
        return;
      }
      setMoveBarcode("");
      setMoveCellCode("");
    } catch (e: any) {
      setError(e.message || "Ошибка перемещения");
    } finally {
      setLoading(false);
    }
  }

  async function handleClearUnit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/units/clear-cell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: clearBarcode }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Ошибка очистки ячейки");
        return;
      }
      setClearBarcode("");
    } catch (e: any) {
      setError(e.message || "Ошибка очистки ячейки");
    } finally {
      setLoading(false);
    }
  }

  async function handleClearPicking() {
    if (!confirm("Очистить все picking ячейки? Все заказы будут сняты с ячеек.")) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/units/clear-picking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: clearPickingNote }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Ошибка очистки picking ячеек");
        return;
      }
      setClearPickingNote("");
    } catch (e: any) {
      setError(e.message || "Ошибка очистки picking ячеек");
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkImport(file: File | null) {
    if (!file || !bulkCellCode) return;
    setBulkImporting(true);
    setError(null);
    setBulkResult(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setError("Файл Excel не содержит листов");
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
      const barcodes = rows
        .map((row) => String(row?.[0] ?? "").trim())
        .filter((value) => value.length > 0);

      if (barcodes.length === 0) {
        setError("В файле нет штрихкодов в колонке A");
        return;
      }

      const res = await fetch("/api/admin/units/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cellCode: bulkCellCode, barcodes }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Ошибка массовой записи");
        return;
      }
      setBulkResult({ updated: json.updated || 0, errors: json.errors || [] });
    } catch (e: any) {
      setError(e.message || "Ошибка массовой записи");
    } finally {
      setBulkImporting(false);
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

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 20 }}>
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

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Очистить все picking ячейки</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
          Снимает все заказы с picking ячеек (cell_id = null, статус = receiving).
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            placeholder="Комментарий (опционально)"
            value={clearPickingNote}
            onChange={(e) => setClearPickingNote(e.target.value)}
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
          <button
            onClick={handleClearPicking}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#b91c1c",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Очистить picking
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>🗑️ Удаление ячейки (полное)</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <input
            value={cellCodeToDelete}
            onChange={(e) => setCellCodeToDelete(e.target.value)}
            placeholder="Код ячейки (например, A-01)"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
          <button
            onClick={handleDeleteCell}
            disabled={loading || role !== "admin" || !cellCodeToDelete}
            style={{
              padding: "10px 16px",
              background: loading || !cellCodeToDelete ? "#e5e7eb" : "#dc2626",
              color: loading || !cellCodeToDelete ? "#6b7280" : "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading || !cellCodeToDelete ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Удалить ячейку
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📦 Перемещение заказа (admin)</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <input
            value={moveBarcode}
            onChange={(e) => setMoveBarcode(e.target.value)}
            placeholder="Штрихкод заказа"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
          <input
            value={moveCellCode}
            onChange={(e) => setMoveCellCode(e.target.value)}
            placeholder="Код ячейки назначения"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
          <button
            onClick={handleMoveUnit}
            disabled={loading || role !== "admin" || !moveBarcode || !moveCellCode}
            style={{
              padding: "10px 16px",
              background: loading || !moveBarcode || !moveCellCode ? "#e5e7eb" : "#111827",
              color: loading || !moveBarcode || !moveCellCode ? "#6b7280" : "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading || !moveBarcode || !moveCellCode ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Переместить
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>🧹 Удаление заказа из ячейки</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <input
            value={clearBarcode}
            onChange={(e) => setClearBarcode(e.target.value)}
            placeholder="Штрихкод заказа"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
          <button
            onClick={handleClearUnit}
            disabled={loading || role !== "admin" || !clearBarcode}
            style={{
              padding: "10px 16px",
              background: loading || !clearBarcode ? "#e5e7eb" : "#0f766e",
              color: loading || !clearBarcode ? "#6b7280" : "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading || !clearBarcode ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            Удалить из ячейки
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📄 Массовая запись в ячейку (Excel)</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <input
            value={bulkCellCode}
            onChange={(e) => setBulkCellCode(e.target.value)}
            placeholder="Код ячейки для записи"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={bulkImporting || role !== "admin" || !bulkCellCode}
            onChange={(e) => handleBulkImport(e.target.files?.[0] || null)}
            style={{ fontSize: 12 }}
          />
          {bulkResult && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Обновлено: <strong>{bulkResult.updated}</strong>. Ошибки: <strong>{bulkResult.errors.length}</strong>.
            </div>
          )}
          {bulkResult?.errors?.length ? (
            <ul style={{ fontSize: 12, color: "#b91c1c", margin: 0, paddingLeft: 18 }}>
              {bulkResult.errors.slice(0, 10).map((err, idx) => (
                <li key={idx}>
                  {err.barcode}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
