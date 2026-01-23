"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

// ⚡ Force dynamic for real-time data
export const dynamic = 'force-dynamic';

type Unit = {
  id: string;
  barcode: string;
  status: string;
  product_name?: string;
  partner_name?: string;
  price?: number;
  created_at: string;
  cell_code?: string;
  meta?: {
    ops_status?: string;
    ops_status_comment?: string;
  };
};

// OPS statuses (must match backend)
const OPS_STATUS_LABELS: Record<string, string> = {
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
  in_progress: "В работе",
  no_report: "Отчета нет",
};

function getOpsStatusText(status: string | null | undefined): string {
  if (!status) return "OPS статус не назначен";
  return OPS_STATUS_LABELS[status] || status;
}

function getOpsStatusColor(status: string | null | undefined): string {
  if (!status) return "#6b7280";

  // Problematic statuses - red/orange
  if (["partner_rejected_return", "client_rejected", "warehouse_did_not_issue", "case_cancelled_cc", "no_report"].includes(status)) {
    return "#dc2626";
  }

  // Good statuses - green/blue
  if (["partner_accepted_return", "client_accepted", "delivered_to_rc", "delivered_to_pudo"].includes(status)) {
    return "#16a34a";
  }

  // Process statuses - yellow/blue
  if (["in_progress", "sent_to_client", "sent_to_sc", "postponed_1", "postponed_2"].includes(status)) {
    return "#0284c7";
  }

  return "#6b7280";
}

export default function OutStatusPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // OPS status editing state
  const [opsStatus, setOpsStatus] = useState<string>("");
  const [opsStatusComment, setOpsStatusComment] = useState<string>("");
  const [savingOpsStatus, setSavingOpsStatus] = useState(false);

  const canEditOpsStatus = userRole && ["logistics", "admin", "head"].includes(userRole);

  // Load user role
  useEffect(() => {
    async function loadUserRole() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.role) {
          setUserRole(json.role);
        }
      } catch (e) {
        console.error("Failed to load user role:", e);
      }
    }
    loadUserRole();
  }, []);

  // ⚡ OPTIMIZATION: Memoized load function
  const loadUnits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/units/list?status=out", { 
        cache: "no-store"
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const json = await res.json();

      if (res.ok) {
        setUnits(json.units || []);
      } else {
        setError(json.error || "Ошибка загрузки");
      }
    } catch (e: any) {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  // Load unit details when modal opens
  useEffect(() => {
    if (!selectedUnit) return;
    
    const unitId = selectedUnit.id;
    async function loadUnitDetails() {
      try {
        const res = await fetch(`/api/units/${unitId}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.unit) {
          setSelectedUnit(json.unit);
          setOpsStatus(json.unit.meta?.ops_status || "");
          setOpsStatusComment(json.unit.meta?.ops_status_comment || "");
        }
      } catch (e) {
        console.error("Failed to load unit details:", e);
      }
    }
    loadUnitDetails();
  }, [selectedUnit?.id]);

  // ⚡ OPTIMIZATION: Memoized filtered units
  const filteredUnits = useMemo(
    () => units.filter((unit) => unit.barcode.toLowerCase().includes(searchQuery.toLowerCase())),
    [units, searchQuery]
  );

  // Handle OPS status update
  async function handleUpdateOpsStatus() {
    if (!selectedUnit || !opsStatus) return;

    setSavingOpsStatus(true);
    setError(null);

    try {
      const res = await fetch("/api/units/ops-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selectedUnit.id,
          status: opsStatus,
          comment: opsStatusComment.trim() || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Ошибка обновления OPS статуса");
        return;
      }

      // Update local state
      setSelectedUnit((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          meta: {
            ...prev.meta,
            ops_status: opsStatus,
            ops_status_comment: opsStatusComment.trim() || undefined,
          },
        };
      });

      // Update in list
      setUnits((prev) =>
        prev.map((u) =>
          u.id === selectedUnit.id
            ? {
                ...u,
                meta: {
                  ...u.meta,
                  ops_status: opsStatus,
                  ops_status_comment: opsStatusComment.trim() || undefined,
                },
              }
            : u
        )
      );

      // Clear error after success
      setTimeout(() => setError(null), 2000);
    } catch (e: any) {
      setError(e.message || "Ошибка обновления OPS статуса");
    } finally {
      setSavingOpsStatus(false);
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          🚚 OUT - Заказы в доставке
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
          Заказы отправленные курьерам. Нажмите на заказ для просмотра деталей и редактирования OPS статуса.
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="🔍 Поиск по штрихкоду..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "10px 16px",
            fontSize: 14,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            outline: "none",
          }}
        />
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Всего в OUT</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#8b5cf6" }}>{filteredUnits.length}</div>
        </div>
      </div>

      {/* Units Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Загрузка...</div>
      ) : error ? (
        <div style={{ padding: 20, background: "#fef2f2", color: "#dc2626", borderRadius: 8 }}>{error}</div>
      ) : filteredUnits.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 12, border: "1px dashed #e5e7eb" }}>
          {searchQuery ? "Заказы не найдены" : "Нет заказов в OUT"}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ padding: 16, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Штрихкод</th>
                <th style={{ padding: 16, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Товар</th>
                <th style={{ padding: 16, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>OPS Статус</th>
                <th style={{ padding: 16, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Отправлен</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnits.map((unit) => (
                <tr
                  key={unit.id}
                  onClick={() => setSelectedUnit(unit)}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f9fafb";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td style={{ padding: 16, fontWeight: 600, color: "#2563eb" }}>{unit.barcode}</td>
                  <td style={{ padding: 16 }}>
                    <div style={{ fontSize: 14, marginBottom: 2 }}>{unit.product_name || "—"}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>{unit.partner_name || "—"}</div>
                  </td>
                  <td style={{ padding: 16 }}>
                    {unit.meta?.ops_status ? (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "6px 12px",
                          background: `${getOpsStatusColor(unit.meta.ops_status)}15`,
                          color: getOpsStatusColor(unit.meta.ops_status),
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          border: `1px solid ${getOpsStatusColor(unit.meta.ops_status)}`,
                        }}
                      >
                        {getOpsStatusText(unit.meta.ops_status)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: 16, fontSize: 12, color: "#6b7280" }}>
                    {new Date(unit.created_at).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {selectedUnit && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedUnit(null);
              setError(null);
            }
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 600,
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Заказ {selectedUnit.barcode}</h2>
              <button
                onClick={() => {
                  setSelectedUnit(null);
                  setError(null);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "#666",
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: 24 }}>
              {error && (
                <div style={{ padding: 12, background: "#fef2f2", color: "#dc2626", borderRadius: 8, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* Unit Info */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>Информация о заказе</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Название товара</div>
                    <div style={{ fontSize: 14 }}>{selectedUnit.product_name || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Партнер</div>
                    <div style={{ fontSize: 14 }}>{selectedUnit.partner_name || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Цена</div>
                    <div style={{ fontSize: 14 }}>
                      {selectedUnit.price ? `${selectedUnit.price.toFixed(2)} ₽` : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Создан</div>
                    <div style={{ fontSize: 14 }}>
                      {new Date(selectedUnit.created_at).toLocaleString("ru-RU")}
                    </div>
                  </div>
                </div>
              </div>

              {/* OPS Status Block */}
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>OPS Статус заказа</div>
                
                {/* Current Status Display */}
                <div style={{ marginBottom: canEditOpsStatus ? 16 : 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
                    Текущий статус:
                  </div>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "8px 16px",
                      background: selectedUnit.meta?.ops_status ? `${getOpsStatusColor(selectedUnit.meta.ops_status)}15` : "#f3f4f6",
                      color: selectedUnit.meta?.ops_status ? getOpsStatusColor(selectedUnit.meta.ops_status) : "#6b7280",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      border: `2px solid ${selectedUnit.meta?.ops_status ? getOpsStatusColor(selectedUnit.meta.ops_status) : "#d1d5db"}`,
                    }}
                  >
                    {getOpsStatusText(selectedUnit.meta?.ops_status)}
                  </div>
                  {selectedUnit.meta?.ops_status_comment && (
                    <div style={{ marginTop: 8, padding: 8, background: "#f3f4f6", borderRadius: 6, fontSize: 13 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Комментарий:</div>
                      <div style={{ color: "#374151" }}>{selectedUnit.meta.ops_status_comment}</div>
                    </div>
                  )}
                </div>

                {/* Edit Form (only for logistics, admin, head) */}
                {canEditOpsStatus && (
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
                      Изменить статус:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <select
                        value={opsStatus}
                        onChange={(e) => setOpsStatus(e.target.value)}
                        disabled={savingOpsStatus}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          fontSize: 14,
                          background: "#fff",
                        }}
                      >
                        <option value="">— Выберите статус —</option>
                        <option value="partner_accepted_return">Партнер принял на возврат</option>
                        <option value="partner_rejected_return">Партнер не принял на возврат</option>
                        <option value="sent_to_sc">Передан в СЦ</option>
                        <option value="delivered_to_rc">Товар доставлен на РЦ</option>
                        <option value="client_accepted">Клиент принял</option>
                        <option value="client_rejected">Клиент не принял</option>
                        <option value="sent_to_client">Товар отправлен клиенту</option>
                        <option value="delivered_to_pudo">Товар доставлен на ПУДО</option>
                        <option value="case_cancelled_cc">Кейс отменен (Направлен КК)</option>
                        <option value="postponed_1">Перенос</option>
                        <option value="postponed_2">Перенос 2</option>
                        <option value="warehouse_did_not_issue">Склад не выдал</option>
                        <option value="in_progress">В работе</option>
                        <option value="no_report">Отчета нет</option>
                      </select>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                          Комментарий (опционально):
                        </label>
                        <textarea
                          value={opsStatusComment}
                          onChange={(e) => setOpsStatusComment(e.target.value)}
                          disabled={savingOpsStatus}
                          placeholder="Введите комментарий к статусу..."
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            border: "1px solid #d1d5db",
                            borderRadius: 6,
                            fontSize: 14,
                            background: "#fff",
                            minHeight: 80,
                            resize: "vertical",
                            fontFamily: "inherit",
                          }}
                        />
                      </div>
                      <button
                        onClick={handleUpdateOpsStatus}
                        disabled={savingOpsStatus || !opsStatus || (opsStatus === selectedUnit.meta?.ops_status && opsStatusComment.trim() === (selectedUnit.meta?.ops_status_comment || ""))}
                        style={{
                          padding: "10px 16px",
                          background: savingOpsStatus || !opsStatus || (opsStatus === selectedUnit.meta?.ops_status && opsStatusComment.trim() === (selectedUnit.meta?.ops_status_comment || "")) ? "#d1d5db" : "#2563eb",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: savingOpsStatus || !opsStatus || (opsStatus === selectedUnit.meta?.ops_status && opsStatusComment.trim() === (selectedUnit.meta?.ops_status_comment || "")) ? "not-allowed" : "pointer",
                          width: "100%",
                        }}
                      >
                        {savingOpsStatus ? "Сохранение..." : "Сохранить"}
                      </button>
                      {opsStatus && opsStatus === selectedUnit.meta?.ops_status && opsStatusComment.trim() === (selectedUnit.meta?.ops_status_comment || "") && (
                        <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                          Статус и комментарий уже установлены
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
