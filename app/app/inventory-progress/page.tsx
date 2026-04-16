"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ⚡ Force dynamic for real-time inventory progress
export const dynamic = 'force-dynamic';

type Task = {
  id: string;
  cellId: string;
  cellCode: string;
  cellType: string;
  status: "pending" | "scanned";
  scannedBy: string | null;
  scannedAt: string | null;
  scannedByName: string | null;
};

type InventorySessionInfo = {
  sessionId: string;
  sessionStatus: string;
  sessionStartedAt: string;
  sessionClosedAt: string | null;
};

type LostUnit = {
  barcode: string;
  cellCode: string;
  cellType: string;
  scannedBy: string | null;
  scannedByName: string | null;
  scannedAt: string | null;
  unitId: string | null;
  unitStatus: string | null;
  opsStatus: string | null;
  isFound: boolean;
};

export default function InventoryProgressPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lostUnits, setLostUnits] = useState<LostUnit[]>([]);
  const [loadingLostUnits, setLoadingLostUnits] = useState(false);
  const [markingBarcode, setMarkingBarcode] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("guest");
  const [sessionInfo, setSessionInfo] = useState<InventorySessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canMarkFound = ["admin", "head", "manager", "ops", "logistics"].includes(userRole);

  const loadLostUnits = useCallback(
    async (sessionId: string | null | undefined) => {
      if (!sessionId) {
        setLostUnits([]);
        return;
      }
      setLoadingLostUnits(true);
      try {
        const res = await fetch(`/api/inventory/lost-units?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          return;
        }
        const items = Array.isArray(json?.lostUnits) ? json.lostUnits : [];
        setLostUnits(items);
      } finally {
        setLoadingLostUnits(false);
      }
    },
    [],
  );

  async function handleMarkFound(barcode: string) {
    if (!sessionInfo?.sessionId || !barcode) return;
    setMarkingBarcode(barcode);
    setActionMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/inventory/lost-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionInfo.sessionId,
          barcode,
          comment: "Отмечен найденным из кабинета инвентаризации",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Не удалось отметить заказ как найденный");
        return;
      }
      setActionMessage(`Заказ ${barcode} отмечен как найденный`);
      await loadLostUnits(sessionInfo.sessionId);
    } catch (e: any) {
      setError(e?.message || "Не удалось отметить заказ как найденный");
    } finally {
      setMarkingBarcode(null);
    }
  }

  // ⚡ OPTIMIZATION: Memoized load function
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/tasks", { 
        next: { revalidate: 5 } // ⚡ Cache for 5 seconds
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "Ошибка загрузки заданий");
        setLoading(false);
        return;
      }

      const json = await res.json();
      
      if (json.ok) {
        const tasks = Array.isArray(json.tasks) ? json.tasks : [];
        setTasks(json.tasks || []);
        setSessionInfo({
          sessionId: json.sessionId,
          sessionStatus: json.sessionStatus,
          sessionStartedAt: json.sessionStartedAt,
          sessionClosedAt: json.sessionClosedAt,
        });
        await loadLostUnits(json.sessionId || null);
        setError(null);
      } else {
        setError(json.error || "Ошибка загрузки заданий");
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки заданий");
    } finally {
      setLoading(false);
    }
  }, [router, loadLostUnits]);

  useEffect(() => {
    loadTasks();
    // ⚡ OPTIMIZATION: Increased interval from 5s to 10s (less server load)
    // Only refresh if session is active
    const shouldRefresh = sessionInfo?.sessionStatus === "active";
    if (!shouldRefresh) return;
    
    const interval = setInterval(loadTasks, 10000); // 10 seconds instead of 5
    return () => clearInterval(interval);
  }, [loadTasks, sessionInfo?.sessionStatus]);

  useEffect(() => {
    async function loadRole() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.role) setUserRole(json.role);
      } catch {
        setUserRole("guest");
      }
    }
    loadRole();
  }, []);

  // ⚡ OPTIMIZATION: Memoized computed values
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const scannedTasks = useMemo(() => tasks.filter((t) => t.status === "scanned"), [tasks]);
  const totalTasks = tasks.length;
  const progress = useMemo(
    () => (totalTasks > 0 ? Math.round((scannedTasks.length / totalTasks) * 100) : 0),
    [totalTasks, scannedTasks.length]
  );
  const unresolvedLostUnits = useMemo(
    () => lostUnits.filter((item) => !item.isFound),
    [lostUnits],
  );
  const foundLostUnits = useMemo(
    () => lostUnits.filter((item) => item.isFound),
    [lostUnits],
  );

  // ⚡ OPTIMIZATION: Memoized helper function
  const getCellColor = useCallback((cellType: string): string => {
    const colors: Record<string, string> = {
      storage: "#dbeafe",
      shipping: "#fce7f3",
      bin: "#fef3c7",
      picking: "#dcfce7",
      diagnostic: "#e0e7ff",
    };
    return colors[cellType] || "#f3f4f6";
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <Link
            href="/app/inventory"
            style={{
              fontSize: 24,
              textDecoration: "none",
              color: "#2563eb",
            }}
          >
            ←
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Прогресс инвентаризации</h1>
        </div>
        
        {sessionInfo && (
          <div style={{ 
            display: "flex", 
            gap: 12, 
            alignItems: "center",
            paddingLeft: 40,
            flexWrap: "wrap",
          }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: sessionInfo.sessionStatus === "active" 
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                : "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
              color: "#fff",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}>
              <span>{sessionInfo.sessionStatus === "active" ? "🟢" : "⚪"}</span>
              {sessionInfo.sessionStatus === "active" ? "Активна" : "Завершена"}
            </div>
            
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Начата: {new Date(sessionInfo.sessionStartedAt).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            
            {sessionInfo.sessionClosedAt && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Завершена: {new Date(sessionInfo.sessionClosedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
        )}
      </header>

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

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Загрузка...</div>
      ) : (
        <>
          {/* Progress Summary */}
          <div
            style={{
              background: "#fff",
              border: "2px solid #e5e7eb",
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>Общий прогресс</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#1f2937" }}>{progress}%</div>
            </div>

            <div
              style={{
                height: 24,
                background: "#f3f4f6",
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: progress === 100 ? "#10b981" : "#3b82f6",
                  width: `${progress}%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Всего ячеек</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{totalTasks}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Отсканировано</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#10b981" }}>{scannedTasks.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Осталось</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#ef4444" }}>{pendingTasks.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Потерянные</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#dc2626" }}>{unresolvedLostUnits.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Отмечены найденными</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#16a34a" }}>{foundLostUnits.length}</div>
              </div>
            </div>

            {progress === 100 && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  background: "#dcfce7",
                  border: "1px solid #86efac",
                  borderRadius: 8,
                  color: "#166534",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                ✅ Инвентаризация завершена! Все ячейки отсканированы.
              </div>
            )}
          </div>

          {/* Pending Tasks */}
          {pendingTasks.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#ef4444" }}>
                ⏳ Ожидают сканирования ({pendingTasks.length})
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 12,
                }}
              >
                {pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      padding: 12,
                      background: getCellColor(task.cellType),
                      border: "2px solid #fbbf24",
                      borderRadius: 8,
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{task.cellCode}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{task.cellType}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(loadingLostUnits || lostUnits.length > 0) && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#dc2626" }}>
                ⚠️ Потерянные заказы ({unresolvedLostUnits.length})
              </h2>
              {actionMessage && (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #86efac",
                    color: "#166534",
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 10,
                    fontSize: 13,
                  }}
                >
                  {actionMessage}
                </div>
              )}
              {loadingLostUnits ? (
                <div style={{ fontSize: 13, color: "#6b7280" }}>Загрузка потерянных...</div>
              ) : unresolvedLostUnits.length === 0 ? (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#166534",
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  Потерянные заказы не обнаружены.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unresolvedLostUnits.map((item) => (
                    <div
                      key={`${item.barcode}-${item.cellCode}`}
                      style={{
                        padding: 10,
                        background: "#fff",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#991b1b" }}>{item.barcode}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          Ячейка: {item.cellCode} ({item.cellType}) • Сканировал: {item.scannedByName || item.scannedBy || "—"}
                        </div>
                      </div>
                      <button
                        onClick={() => handleMarkFound(item.barcode)}
                        disabled={!canMarkFound || !item.unitId || markingBarcode === item.barcode}
                        style={{
                          border: "none",
                          borderRadius: 6,
                          padding: "8px 12px",
                          background:
                            !canMarkFound || !item.unitId || markingBarcode === item.barcode
                              ? "#d1d5db"
                              : "#16a34a",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor:
                            !canMarkFound || !item.unitId || markingBarcode === item.barcode
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {markingBarcode === item.barcode ? "Сохранение..." : "Отметить найден"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!canMarkFound && unresolvedLostUnits.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
                  Нет прав на изменение статуса потерянных заказов.
                </div>
              )}
              {foundLostUnits.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
                    Уже отмечены найденными ({foundLostUnits.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {foundLostUnits.map((item) => (
                      <span
                        key={`found-${item.barcode}`}
                        style={{
                          fontSize: 12,
                          background: "#ecfdf5",
                          color: "#166534",
                          border: "1px solid #86efac",
                          borderRadius: 9999,
                          padding: "4px 10px",
                        }}
                      >
                        {item.barcode}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scanned Tasks */}
          {scannedTasks.length > 0 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#10b981" }}>
                ✅ Отсканировано ({scannedTasks.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {scannedTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      padding: 12,
                      background: "#fff",
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        background: getCellColor(task.cellType),
                        border: "1px solid #d1d5db",
                        borderRadius: 6,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{task.cellCode}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{task.cellType}</div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>
                      {task.scannedByName && <div>{task.scannedByName}</div>}
                      {task.scannedAt && (
                        <div>
                          {new Date(task.scannedAt).toLocaleString("ru-RU", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 20 }}>✅</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
