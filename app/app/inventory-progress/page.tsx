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

export default function InventoryProgressPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessionInfo, setSessionInfo] = useState<InventorySessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setTasks(json.tasks || []);
        setSessionInfo({
          sessionId: json.sessionId,
          sessionStatus: json.sessionStatus,
          sessionStartedAt: json.sessionStartedAt,
          sessionClosedAt: json.sessionClosedAt,
        });
        setError(null);
      } else {
        setError(json.error || "Ошибка загрузки заданий");
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки заданий");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadTasks();
    // ⚡ OPTIMIZATION: Increased interval from 5s to 10s (less server load)
    // Only refresh if session is active
    const shouldRefresh = sessionInfo?.sessionStatus === "active";
    if (!shouldRefresh) return;
    
    const interval = setInterval(loadTasks, 10000); // 10 seconds instead of 5
    return () => clearInterval(interval);
  }, [loadTasks, sessionInfo?.sessionStatus]);

  // ⚡ OPTIMIZATION: Memoized computed values
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const scannedTasks = useMemo(() => tasks.filter((t) => t.status === "scanned"), [tasks]);
  const totalTasks = tasks.length;
  const progress = useMemo(
    () => (totalTasks > 0 ? Math.round((scannedTasks.length / totalTasks) * 100) : 0),
    [totalTasks, scannedTasks.length]
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
