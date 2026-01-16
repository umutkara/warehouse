"use client";

import { useEffect, useState } from "react";

type InventoryStatus = {
  active: boolean;
  sessionId: string | null;
  startedBy: string | null;
  startedAt: string | null;
};

type Profile = {
  role: string;
};

export default function InventoryPage() {
  const [status, setStatus] = useState<InventoryStatus | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      const res = await fetch("/api/inventory/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
