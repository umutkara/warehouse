"use client";

import { useEffect, useState } from "react";

// ⚡ Force dynamic for real-time inventory status
export const dynamic = 'force-dynamic';

type InventoryStatus = {
  active: boolean;
  sessionId: string | null;
  startedBy: string | null;
  startedAt: string | null;
};

type Profile = {
  role: string;
};

const INVENTORY_CELL_TYPES = [
  { value: "bin", label: "BIN" },
  { value: "storage", label: "Storage" },
  { value: "shipping", label: "Shipping" },
  { value: "picking", label: "Picking" },
  { value: "rejected", label: "Rejected" },
  { value: "ff", label: "FF" },
  { value: "surplus", label: "Surplus" },
];

export default function InventoryPage() {
  const [status, setStatus] = useState<InventoryStatus | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [cellCodesInput, setCellCodesInput] = useState("");
  const [selectedCellTypes, setSelectedCellTypes] = useState<string[]>([]);

  useEffect(() => {
    loadProfile();
    loadStatus();
  }, []);

  async function loadProfile() {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const json = await res.json();
        setProfile({ role: json.role || "guest" });
      }
    } catch (e) {
      console.error("Ошибка загрузки профиля:", e);
    }
  }

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/status", { cache: "no-store" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Ошибка загрузки статуса");
        return;
      }
      const json = await res.json();
      setStatus({
        active: json.active || false,
        sessionId: json.sessionId || null,
        startedBy: json.startedBy || null,
        startedAt: json.startedAt || null,
      });
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки статуса");
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const parsedCellCodes = Array.from(
        new Set(
          cellCodesInput
            .split(/[,\s]+/)
            .map((v) => v.trim().toUpperCase())
            .filter((v) => v.length > 0),
        ),
      );
      const payload: Record<string, unknown> = {};
      if (parsedCellCodes.length > 0) payload.cellCodes = parsedCellCodes;
      if (selectedCellTypes.length > 0) payload.cellTypes = selectedCellTypes;

      const res = await fetch("/api/inventory/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Ошибка запуска инвентаризации");
        return;
      }
      setSuccess("Инвентаризация успешно запущена");
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || "Ошибка запуска инвентаризации");
    } finally {
      setBusy(false);
    }
  }

  function toggleCellType(cellType: string) {
    setSelectedCellTypes((prev) =>
      prev.includes(cellType) ? prev.filter((t) => t !== cellType) : [...prev, cellType],
    );
  }

  async function handleCancel() {
    if (!window.confirm("Все изменения за эту сессию будут отменены. Юниты вернутся в исходные ячейки. Продолжить?")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/inventory/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Ошибка отмены инвентаризации");
        return;
      }
      setSuccess("Инвентаризация отменена, все изменения откачены");
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || "Ошибка отмены инвентаризации");
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/inventory/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Ошибка завершения инвентаризации");
        return;
      }
      setSuccess("Инвентаризация успешно завершена");
      await loadStatus();
    } catch (e: any) {
      setError(e?.message || "Ошибка завершения инвентаризации");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateReport() {
    setGeneratingReport(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/inventory/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: status?.sessionId }),
      });
      
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Ошибка генерации отчёта");
        return;
      }

      const json = await res.json();
      
      if (json.ok && json.publicUrl) {
        // Download the file programmatically to avoid popup blockers
        const link = document.createElement("a");
        link.href = json.publicUrl;
        link.download = json.fileName || "inventory-report.csv";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setSuccess(`Отчёт сгенерирован: ${json.fileName}`);
      } else {
        setError("Ошибка генерации отчёта");
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка генерации отчёта");
    } finally {
      setGeneratingReport(false);
    }
  }

  const canManage = profile?.role && ["admin", "head", "manager"].includes(profile.role);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Инвентаризация</h1>

      {error && (
        <div
          style={{
            background: "#fee",
            border: "1px solid #fcc",
            color: "#c00",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            background: "#efe",
            border: "1px solid #cfc",
            color: "#0c0",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {success}
        </div>
      )}

      {loading ? (
        <div>Загрузка...</div>
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>Статус:</div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: status?.active ? "#c00" : "#0c0",
              }}
            >
              {status?.active ? "Активна" : "Не активна"}
            </div>
          </div>

          {status?.active && status.startedAt && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>Начата:</div>
              <div style={{ fontSize: 16 }}>
                {new Date(status.startedAt).toLocaleString("ru-RU", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {status.startedBy && (
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                  Пользователь ID: {status.startedBy}
                </div>
              )}
            </div>
          )}

          {canManage && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {!status?.active && (
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                    background: "#f9fafb",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    Фильтр запуска (необязательно)
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                    Оставьте пустым, чтобы запустить инвентаризацию всех активных ячеек.
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>
                      Коды ячеек (через запятую или пробел): например A1, A2
                    </div>
                    <input
                      value={cellCodesInput}
                      onChange={(e) => setCellCodesInput(e.target.value)}
                      placeholder="A1, A2"
                      style={{
                        width: "100%",
                        border: "1px solid #d1d5db",
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 13,
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
                      Типы ячеек:
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {INVENTORY_CELL_TYPES.map((item) => {
                        const checked = selectedCellTypes.includes(item.value);
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => toggleCellType(item.value)}
                            style={{
                              border: checked ? "1px solid #2563eb" : "1px solid #d1d5db",
                              background: checked ? "#eff6ff" : "#fff",
                              color: "#111827",
                              borderRadius: 9999,
                              padding: "4px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 12 }}>
                {!status?.active ? (
                  <button
                    onClick={handleStart}
                    disabled={busy}
                    style={{
                      background: "#0066cc",
                      color: "#fff",
                      border: "none",
                      padding: "10px 20px",
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {busy ? "Запуск..." : "Начать инвентаризацию"}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleStop}
                      disabled={busy}
                      style={{
                        background: "#c00",
                        color: "#fff",
                        border: "none",
                        padding: "10px 20px",
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy ? "Завершение..." : "Завершить инвентаризацию"}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={busy}
                      style={{
                        background: "#ea580c",
                        color: "#fff",
                        border: "none",
                        padding: "10px 20px",
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy ? "Откат..." : "Отменить инвентаризацию"}
                    </button>
                  </>
                )}
              </div>

              {status?.sessionId && (
                <>
                  <a
                    href="/app/inventory-progress"
                    style={{
                      display: "block",
                      textAlign: "center",
                      background: status?.active 
                        ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                        : "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
                      color: "#fff",
                      border: "none",
                      padding: "10px 20px",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      textDecoration: "none",
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
                    }}
                  >
                    📊 {status?.active ? "Посмотреть прогресс" : "Просмотреть результаты"}
                  </a>

                  <button
                    onClick={handleGenerateReport}
                    disabled={generatingReport}
                    style={{
                      background: generatingReport 
                        ? "#d1d5db"
                        : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                      color: "#fff",
                      border: "none",
                      padding: "10px 20px",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: generatingReport ? "not-allowed" : "pointer",
                      opacity: generatingReport ? 0.6 : 1,
                      boxShadow: generatingReport ? "none" : "0 2px 8px rgba(139, 92, 246, 0.3)",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!generatingReport) {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(139, 92, 246, 0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!generatingReport) {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(139, 92, 246, 0.3)";
                      }
                    }}
                  >
                    {generatingReport ? "Генерация..." : "📥 Скачать отчёт"}
                  </button>
                </>
              )}
            </div>
          )}

          {!canManage && status?.active && (
            <div style={{ fontSize: 14, color: "#666" }}>
              Инвентаризация активна. Перемещения заблокированы.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
