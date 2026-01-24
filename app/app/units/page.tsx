"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  product_name?: string;
  partner_name?: string;
  price?: number;
  cell_code?: string;
  cell_type?: string;
  created_at: string;
  age_hours: number;
  meta?: {
    merchant_rejections?: Array<{
      rejected_at: string;
      reason: string;
      scenario: string;
      shipment_id: string;
      courier_name: string;
      return_number: number;
    }>;
    merchant_rejection_count?: number;
    service_center_returns?: Array<{
      returned_at: string;
      reason: string;
      scenario: string;
      shipment_id: string;
      courier_name: string;
      return_number: number;
    }>;
    service_center_return_count?: number;
    ops_status?: string;
  };
};

// OPS statuses (must match backend and unit detail page)
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

type OpsStatusCode = keyof typeof OPS_STATUS_LABELS;

function getOpsStatusText(status: string | null | undefined): string {
  if (!status) return "OPS статус не назначен";
  return OPS_STATUS_LABELS[status as OpsStatusCode] || status;
}

// ⚡ Force dynamic for real-time data
export const dynamic = 'force-dynamic';

export default function UnitsListPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [opsStatusFilter, setOpsStatusFilter] = useState<string>("all");
  const [userRole, setUserRole] = useState<string>("guest");
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [loadingUnit, setLoadingUnit] = useState(false);
  const [opsStatus, setOpsStatus] = useState<string>("");
  const [opsStatusComment, setOpsStatusComment] = useState<string>("");
  const [savingOpsStatus, setSavingOpsStatus] = useState(false);

  // ⚡ OPTIMIZATION: Memoized load function
  const loadUnits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ 
        age: ageFilter,
        status: statusFilter,
      });
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

      const res = await fetch(`/api/units/list?${params.toString()}`, {
        next: { revalidate: 30 } // ⚡ Cache for 30 seconds
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const json = await res.json();
        setError(json.error || "Ошибка загрузки");
        return;
      }

      const json = await res.json();
      setUnits(json.units || []);
    } catch (e: any) {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [ageFilter, statusFilter, searchQuery, router]);

  // Client-side filter by OPS статус
  const filteredUnits = useMemo(() => {
    return units.filter((unit) => {
      const currentOps = unit.meta?.ops_status || null;

      if (opsStatusFilter === "no_status") {
        return !currentOps;
      }

      if (opsStatusFilter !== "all" && opsStatusFilter) {
        return currentOps === opsStatusFilter;
      }

      // "all" – no OPS filter
      return true;
    });
  }, [units, opsStatusFilter]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    async function loadRole() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.role) {
          setUserRole(json.role);
        }
      } catch {
        setUserRole("guest");
      }
    }
    loadRole();
  }, []);

  useEffect(() => {
    if (!selectedUnit?.id) return;
    const unitId = selectedUnit.id;
    async function loadUnitDetails() {
      setLoadingUnit(true);
      try {
        const res = await fetch(`/api/units/${unitId}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.unit) {
          const unit = json.unit as Unit;
          setSelectedUnit(unit);
          setOpsStatus(unit.meta?.ops_status || "");
          setOpsStatusComment(unit.meta?.ops_status_comment || "");
        }
      } catch {
        // ignore
      } finally {
        setLoadingUnit(false);
      }
    }
    loadUnitDetails();
  }, [selectedUnit?.id]);

  // ⚡ OPTIMIZATION: Memoized handlers
  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
  }, []);

  const handleExportToExcel = useCallback(async () => {
    try {
      const params = new URLSearchParams({ 
        age: ageFilter,
        status: statusFilter,
      });
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

      const res = await fetch(`/api/units/export-excel?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        setError("Ошибка экспорта");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `units_on_warehouse_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      setError("Ошибка экспорта");
    }
  }, [ageFilter, statusFilter, searchQuery]);

  const canEditOpsStatus = ["ops", "logistics", "admin", "head"].includes(userRole);

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
    } catch (e: any) {
      setError(e.message || "Ошибка обновления OPS статуса");
    } finally {
      setSavingOpsStatus(false);
    }
  }

  // ⚡ OPTIMIZATION: Memoized helper function
  const formatAge = useCallback((hours: number): string => {
    if (hours < 1) return "< 1ч";
    if (hours < 24) return `${hours}ч`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours === 0) return `${days}д`;
    return `${days}д ${remainingHours}ч`;
  }, []);

  function getAgeColor(hours: number): string {
    if (hours > 168) return "#dc2626"; // > 7 days - red
    if (hours > 48) return "#f59e0b"; // > 48h - orange
    if (hours > 24) return "#eab308"; // > 24h - yellow
    return "#10b981"; // < 24h - green
  }

  const statusColors: Record<string, string> = {
    receiving: "#3b82f6",
    stored: "#10b981",
    picking: "#f59e0b",
    shipped: "#ef4444",
    out: "#8b5cf6",
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: "center", padding: 40 }}>Загрузка...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Список заказов</h1>
          <p style={styles.subtitle}>
            Всего заказов на складе: {units.length}
            {opsStatusFilter !== "all" && (
              <>
                {" "}
                • По текущему OPS фильтру: {filteredUnits.length}
              </>
            )}
          </p>
        </div>

        <button onClick={loadUnits} style={styles.refreshButton}>
          🔄 Обновить
        </button>
      </div>

      {/* Search and Export */}
      <div style={styles.searchAndExportContainer}>
        <form onSubmit={handleSearch} style={styles.searchContainer}>
          <input
            type="text"
            placeholder="🔍 Поиск по номеру заказа..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={styles.searchInput}
          />
          <button type="submit" style={styles.searchButton}>
            Найти
          </button>
          {searchQuery && (
            <button type="button" onClick={clearSearch} style={styles.clearButton}>
              ✕
            </button>
          )}
        </form>

        {statusFilter === "on_warehouse" && (
          <button onClick={handleExportToExcel} style={styles.exportButton}>
            📊 Экспорт в Excel
          </button>
        )}
      </div>

      {/* Status Filter */}
      <div style={styles.filters}>
        <div style={styles.filterLabel}>Статус:</div>
        <div style={styles.filterButtons}>
          <button
            onClick={() => setStatusFilter("all")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "all" ? styles.filterButtonActive : {}),
            }}
          >
            Все
          </button>
          <button
            onClick={() => setStatusFilter("on_warehouse")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "on_warehouse" ? styles.filterButtonActive : {}),
            }}
          >
            На складе
          </button>
          <button
            onClick={() => setStatusFilter("receiving")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "receiving" ? styles.filterButtonActive : {}),
            }}
          >
            Приёмка
          </button>
          <button
            onClick={() => setStatusFilter("stored")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "stored" ? styles.filterButtonActive : {}),
            }}
          >
            Хранение
          </button>
          <button
            onClick={() => setStatusFilter("picking")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "picking" ? styles.filterButtonActive : {}),
            }}
          >
            Пикинг
          </button>
          <button
            onClick={() => setStatusFilter("shipped")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "shipped" ? styles.filterButtonActive : {}),
            }}
          >
            Отгрузка
          </button>
          <button
            onClick={() => setStatusFilter("out")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "out" ? styles.filterButtonActive : {}),
            }}
          >
            OUT
          </button>
        </div>
      </div>

      {/* Age Filter */}
      <div style={styles.filters}>
        <div style={styles.filterLabel}>Фильтр по времени:</div>
        <div style={styles.filterButtons}>
          <button
            onClick={() => setAgeFilter("all")}
            style={{
              ...styles.filterButton,
              ...(ageFilter === "all" ? styles.filterButtonActive : {}),
            }}
          >
            Все
          </button>
          <button
            onClick={() => setAgeFilter("24h")}
            style={{
              ...styles.filterButton,
              ...(ageFilter === "24h" ? styles.filterButtonActive : {}),
            }}
          >
            &gt; 24 часов
          </button>
          <button
            onClick={() => setAgeFilter("48h")}
            style={{
              ...styles.filterButton,
              ...(ageFilter === "48h" ? styles.filterButtonActive : {}),
            }}
          >
            &gt; 48 часов
          </button>
          <button
            onClick={() => setAgeFilter("7d")}
            style={{
              ...styles.filterButton,
              ...(ageFilter === "7d" ? styles.filterButtonActive : {}),
            }}
          >
            &gt; 7 дней
          </button>
        </div>
      </div>

      {/* OPS Status Filter */}
      <div style={styles.filters}>
        <div style={styles.filterLabel}>OPS статус:</div>
        <div>
          <select
            value={opsStatusFilter}
            onChange={(e) => setOpsStatusFilter(e.target.value)}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              fontSize: 13,
              minWidth: 260,
            }}
          >
            <option value="all">Все OPS статусы</option>
            <option value="no_status">Без OPS статуса</option>
            <option disabled>──────────</option>
            {Object.entries(OPS_STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Штрихкод</th>
              <th style={styles.th}>Товар</th>
              <th style={styles.th}>Партнер</th>
              <th style={styles.th}>Цена</th>
              <th style={styles.th}>Статус</th>
              <th style={styles.th}>Ячейка</th>
              <th style={styles.th}>На складе</th>
              <th style={styles.th}>Создан</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {filteredUnits.length === 0 && !loading && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                  {searchQuery || opsStatusFilter !== "all"
                    ? "По выбранным фильтрам заказы не найдены"
                    : "Нет заказов"}
                </td>
              </tr>
            )}
            {filteredUnits.map((unit) => (
              <tr
                key={unit.id}
                style={styles.tableRow}
                onClick={() => setSelectedUnit(unit)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                }}
              >
                <td style={styles.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={styles.barcode}>{unit.barcode}</div>
                    {unit.meta?.merchant_rejection_count && unit.meta.merchant_rejection_count > 0 && (
                      <span
                        style={styles.merchantRejectionBadge}
                        title={`Мерчант не принял ${unit.meta.merchant_rejection_count} раз(а)`}
                      >
                        🚫 Мерчант не принял ({unit.meta.merchant_rejection_count})
                      </span>
                    )}
                    {unit.meta?.service_center_return_count && unit.meta.service_center_return_count > 0 && (
                      <span
                        style={styles.serviceCenterBadge}
                        title={`Вернулся с сервисного центра ${unit.meta.service_center_return_count} раз(а)`}
                      >
                        🔧 С сервиса ({unit.meta.service_center_return_count})
                      </span>
                    )}
                  </div>
                </td>
                <td style={styles.td}>
                  <div style={styles.productName}>{unit.product_name || "—"}</div>
                </td>
                <td style={styles.td}>
                  <div style={styles.partnerName}>{unit.partner_name || "—"}</div>
                </td>
                <td style={styles.td}>
                  <div style={styles.price}>
                    {unit.price ? `${unit.price.toFixed(2)} ₽` : "—"}
                  </div>
                </td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.statusBadge,
                      background: statusColors[unit.status] || "#e5e7eb",
                    }}
                  >
                    {unit.status}
                  </span>
                </td>
                <td style={styles.td}>
                  {unit.cell_code ? (
                    <div>
                      <div style={styles.cellCode}>{unit.cell_code}</div>
                      <div style={styles.cellType}>{unit.cell_type}</div>
                    </div>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>—</span>
                  )}
                </td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.ageBadge,
                      color: getAgeColor(unit.age_hours),
                    }}
                  >
                    {formatAge(unit.age_hours)}
                  </span>
                </td>
                <td style={styles.td}>
                  <div style={styles.date}>
                    {new Date(unit.created_at).toLocaleDateString("ru-RU")}
                  </div>
                  <div style={styles.time}>
                    {new Date(unit.created_at).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </td>
                <td style={styles.td}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/app/units/${unit.id}`);
                    }}
                    style={styles.viewButton}
                  >
                    →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUnit && (
        <div style={styles.modalOverlay} onClick={() => setSelectedUnit(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalTitle}>Заказ {selectedUnit.barcode}</div>
                <div style={styles.modalSubtitle}>OPS статус</div>
              </div>
              <button style={styles.modalClose} onClick={() => setSelectedUnit(null)}>
                ×
              </button>
            </div>

            {loadingUnit ? (
              <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Загрузка...</div>
            ) : (
              <div style={{ padding: 20, display: "grid", gap: 12 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Текущий статус: <strong>{getOpsStatusText(selectedUnit.meta?.ops_status)}</strong>
                </div>

                {selectedUnit.meta?.ops_status_comment && (
                  <div style={{ fontSize: 12, color: "#374151", background: "#f3f4f6", padding: 8, borderRadius: 6 }}>
                    <strong>Комментарий:</strong> {selectedUnit.meta.ops_status_comment}
                  </div>
                )}

                {canEditOpsStatus ? (
                  <>
                    <select
                      value={opsStatus}
                      onChange={(e) => setOpsStatus(e.target.value)}
                      disabled={savingOpsStatus}
                      style={styles.modalSelect}
                    >
                      <option value="">— Выберите статус —</option>
                      {Object.entries(OPS_STATUS_LABELS).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={opsStatusComment}
                      onChange={(e) => setOpsStatusComment(e.target.value)}
                      placeholder="Комментарий (опционально)"
                      style={styles.modalTextarea}
                      disabled={savingOpsStatus}
                    />
                    <button
                      onClick={handleUpdateOpsStatus}
                      disabled={savingOpsStatus || !opsStatus}
                      style={{
                        ...styles.modalSave,
                        background: savingOpsStatus || !opsStatus ? "#e5e7eb" : "#2563eb",
                        color: savingOpsStatus || !opsStatus ? "#6b7280" : "#fff",
                        cursor: savingOpsStatus || !opsStatus ? "not-allowed" : "pointer",
                      }}
                    >
                      {savingOpsStatus ? "Сохранение..." : "Сохранить"}
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>Нет прав на изменение OPS статуса.</div>
                )}

                <button
                  onClick={() => router.push(`/app/units/${selectedUnit.id}`)}
                  style={styles.modalDetails}
                >
                  Подробнее →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 1600,
    margin: "0 auto",
    padding: "var(--spacing-xl)",
  } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "var(--spacing-lg)",
  } as React.CSSProperties,
  title: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 4,
  } as React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
  } as React.CSSProperties,
  refreshButton: {
    padding: "8px 16px",
    background: "#fff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  } as React.CSSProperties,
  searchAndExportContainer: {
    display: "flex",
    gap: 16,
    marginBottom: "var(--spacing-lg)",
    alignItems: "center",
  } as React.CSSProperties,
  searchContainer: {
    display: "flex",
    gap: 8,
    flex: 1,
    padding: 16,
    background: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
  } as React.CSSProperties,
  searchInput: {
    flex: 1,
    padding: "8px 16px",
    fontSize: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: 6,
    outline: "none",
  } as React.CSSProperties,
  searchButton: {
    padding: "8px 24px",
    background: "#2563eb",
    color: "#fff",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "background 0.2s",
  } as React.CSSProperties,
  clearButton: {
    padding: "8px 16px",
    background: "#f3f4f6",
    color: "#6b7280",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "all 0.2s",
  } as React.CSSProperties,
  exportButton: {
    padding: "10px 20px",
    background: "#10b981",
    color: "#fff",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    boxShadow: "0 2px 4px rgba(16, 185, 129, 0.3)",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  filters: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: "var(--spacing-lg)",
    padding: 16,
    background: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
  } as React.CSSProperties,
  filterLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#374151",
  } as React.CSSProperties,
  filterButtons: {
    display: "flex",
    gap: 8,
  } as React.CSSProperties,
  filterButton: {
    padding: "6px 16px",
    background: "#fff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
    transition: "all 0.2s",
  } as React.CSSProperties,
  filterButtonActive: {
    background: "#2563eb",
    color: "#fff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#2563eb",
  } as React.CSSProperties,
  error: {
    padding: 16,
    background: "#fee",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#fcc",
    borderRadius: 8,
    color: "#c00",
    marginBottom: 16,
  } as React.CSSProperties,
  tableContainer: {
    background: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
  } as React.CSSProperties,
  tableHeader: {
    background: "#f9fafb",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "#e5e7eb",
  } as React.CSSProperties,
  th: {
    padding: "12px 16px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  } as React.CSSProperties,
  tableRow: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#f3f4f6",
    cursor: "pointer",
    transition: "background 0.15s",
  } as React.CSSProperties,
  td: {
    padding: "12px 16px",
    fontSize: 14,
  } as React.CSSProperties,
  barcode: {
    fontWeight: 700,
    color: "#111827",
  } as React.CSSProperties,
  productName: {
    color: "#374151",
  } as React.CSSProperties,
  partnerName: {
    color: "#6b7280",
    fontSize: 13,
  } as React.CSSProperties,
  price: {
    fontWeight: 600,
    color: "#111827",
  } as React.CSSProperties,
  statusBadge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
  } as React.CSSProperties,
  cellCode: {
    fontWeight: 600,
    color: "#111827",
    fontSize: 13,
  } as React.CSSProperties,
  cellType: {
    fontSize: 11,
    color: "#9ca3af",
  } as React.CSSProperties,
  ageBadge: {
    fontSize: 13,
    fontWeight: 700,
  } as React.CSSProperties,
  date: {
    fontSize: 13,
    color: "#374151",
  } as React.CSSProperties,
  time: {
    fontSize: 11,
    color: "#9ca3af",
  } as React.CSSProperties,
  viewButton: {
    padding: "6px 12px",
    background: "#f3f4f6",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 700,
    color: "#374151",
  } as React.CSSProperties,
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  } as React.CSSProperties,
  modal: {
    background: "#fff",
    borderRadius: 12,
    width: "100%",
    maxWidth: 520,
    boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
  } as React.CSSProperties,
  modalHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
  } as React.CSSProperties,
  modalSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  } as React.CSSProperties,
  modalClose: {
    border: "none",
    background: "transparent",
    fontSize: 20,
    cursor: "pointer",
    color: "#6b7280",
  } as React.CSSProperties,
  modalSelect: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    fontSize: 13,
  } as React.CSSProperties,
  modalTextarea: {
    width: "100%",
    minHeight: 80,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    fontSize: 13,
    fontFamily: "inherit",
  } as React.CSSProperties,
  modalSave: {
    padding: "8px 12px",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
  } as React.CSSProperties,
  modalDetails: {
    padding: "8px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    background: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    justifySelf: "start",
  } as React.CSSProperties,
  merchantRejectionBadge: {
    padding: "2px 8px",
    background: "#dc2626",
    color: "#fff",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
    display: "inline-block",
  } as React.CSSProperties,
  serviceCenterBadge: {
    padding: "2px 8px",
    background: "#f59e0b",
    color: "#fff",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
    display: "inline-block",
  } as React.CSSProperties,
};
