"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    ops_status_comment?: string;
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

const STATUS_LABELS: Record<string, string> = {
  all: "Все",
  on_warehouse: "На складе",
  receiving: "Приёмка",
  stored: "Хранение",
  picking: "Пикинг",
  shipped: "Отгрузка",
  out: "OUT",
  ff: "FF",
  bin: "BIN",
  shipping: "Shipping",
};
const AGE_LABELS: Record<string, string> = {
  all: "Все",
  "24h": "> 24 ч",
  "48h": "> 48 ч",
  "7d": "> 7 д",
};

const CELL_TYPE_LABELS: Record<string, string> = {
  all: "Все типы",
  bin: "BIN",
  storage: "Storage",
  picking: "Picking",
  shipping: "Shipping",
  rejected: "Rejected",
  ff: "FF",
};

function getInitialFilters(searchParams: URLSearchParams) {
  return {
    age: searchParams.get("age") || "all",
    status: searchParams.get("status") || "all",
    search: searchParams.get("search") || "",
    ops: searchParams.get("ops") || "all",
  };
}

export default function UnitsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = useMemo(() => getInitialFilters(searchParams), []);

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<string>(initial.age);
  const [statusFilter, setStatusFilter] = useState<string>(initial.status);
  const [searchQuery, setSearchQuery] = useState<string>(initial.search);
  const [searchInput, setSearchInput] = useState<string>(initial.search);
  const [opsStatusFilter, setOpsStatusFilter] = useState<string>(initial.ops);
  const [userRole, setUserRole] = useState<string>("guest");
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [loadingUnit, setLoadingUnit] = useState(false);
  const [opsStatus, setOpsStatus] = useState<string>("");
  const [opsStatusComment, setOpsStatusComment] = useState<string>("");
  const [savingOpsStatus, setSavingOpsStatus] = useState(false);
  const [totalUnits, setTotalUnits] = useState<number | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>(initial.status);
  const [exportAge, setExportAge] = useState<string>(initial.age);
  const [exportOps, setExportOps] = useState<string>(initial.ops);
  const [exportSearch, setExportSearch] = useState<string>(initial.search);
  const [exportCellType, setExportCellType] = useState<string>("all");
  const [exportAllUnits, setExportAllUnits] = useState(false);
  const [exportWithHistory, setExportWithHistory] = useState(false);
  const [exportCreatedFrom, setExportCreatedFrom] = useState("");
  const [exportCreatedTo, setExportCreatedTo] = useState("");
  const [exportTrimBarcodeSuffix01, setExportTrimBarcodeSuffix01] = useState(false);

  // Sync filters from URL when URL changes (e.g. back/forward, shared link)
  useEffect(() => {
    const age = searchParams.get("age") || "all";
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const ops = searchParams.get("ops") || "all";
    setAgeFilter(age);
    setStatusFilter(status);
    setSearchQuery(search);
    setSearchInput(search);
    setOpsStatusFilter(ops);
  }, [searchParams]);

  const applyFiltersToUrl = useCallback(
    (updates: { age?: string; status?: string; search?: string; ops?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      const age = updates.age ?? ageFilter;
      const status = updates.status ?? statusFilter;
      const search = updates.search ?? searchQuery;
      const ops = updates.ops ?? opsStatusFilter;
      if (age !== "all") params.set("age", age);
      else params.delete("age");
      if (status !== "all") params.set("status", status);
      else params.delete("status");
      if (search.trim()) params.set("search", search.trim());
      else params.delete("search");
      if (ops !== "all") params.set("ops", ops);
      else params.delete("ops");
      router.replace(`/app/units?${params.toString()}`, { scroll: false });
    },
    [searchParams, ageFilter, statusFilter, searchQuery, opsStatusFilter, router]
  );

  const loadUnits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        age: ageFilter,
        status: statusFilter,
      });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (opsStatusFilter !== "all") params.set("ops", opsStatusFilter);

      const res = await fetch(`/api/units/list?${params.toString()}`, {
        cache: "no-store",
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
      setTotalUnits(typeof json.total === "number" ? json.total : null);
    } catch (e: any) {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [ageFilter, statusFilter, searchQuery, opsStatusFilter, router]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const filteredUnits = units;

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
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchInput.trim();
      setSearchQuery(q);
      applyFiltersToUrl({ search: q });
    },
    [searchInput, applyFiltersToUrl]
  );

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    applyFiltersToUrl({ search: "" });
  }, [applyFiltersToUrl]);

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setStatusFilter("all");
    setAgeFilter("all");
    setOpsStatusFilter("all");
    router.replace("/app/units", { scroll: false });
  }, [router]);

  const hasActiveFilters =
    searchQuery !== "" ||
    statusFilter !== "all" ||
    ageFilter !== "all" ||
    opsStatusFilter !== "all";

  const canExportAllUnits = ["admin", "head"].includes(userRole);

  const openExportModal = useCallback(() => {
    setExportStatus(statusFilter);
    setExportAge(ageFilter);
    setExportOps(opsStatusFilter);
    setExportSearch(searchQuery);
    setExportCellType("all");
    setExportAllUnits(false);
    setExportWithHistory(false);
    setExportCreatedFrom("");
    setExportCreatedTo("");
    setExportTrimBarcodeSuffix01(false);
    setIsExportModalOpen(true);
  }, [statusFilter, ageFilter, opsStatusFilter, searchQuery]);

  const handleExportToExcel = useCallback(async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        age: exportAge,
        status: exportStatus,
      });
      if (exportSearch.trim()) params.set("search", exportSearch.trim());
      if (exportOps !== "all") params.set("ops", exportOps);
      if (exportCellType !== "all") params.set("cellType", exportCellType);
      if (exportAllUnits) params.set("scope", "all");
      if (exportWithHistory) params.set("includeHistory", "1");
      if (exportCreatedFrom) params.set("createdFrom", exportCreatedFrom);
      if (exportCreatedTo) params.set("createdTo", exportCreatedTo);
      if (exportTrimBarcodeSuffix01) params.set("trimBarcodeSuffix01", "1");

      const res = await fetch(`/api/units/export-excel?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        try {
          const json = await res.json();
          setError(json.error || "Ошибка экспорта");
        } catch {
          setError("Ошибка экспорта");
        }
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      a.download = match?.[1] || `units_export_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setIsExportModalOpen(false);
    } catch (e: any) {
      setError("Ошибка экспорта");
    } finally {
      setIsExporting(false);
    }
  }, [exportAge, exportStatus, exportSearch, exportOps, exportCellType, exportAllUnits, exportWithHistory, exportCreatedFrom, exportCreatedTo, exportTrimBarcodeSuffix01]);

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
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div
              style={{
                width: 240,
                height: 24,
                borderRadius: 8,
                background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                backgroundSize: "200% 100%",
                animation: "unitsSkeleton 1.2s ease-in-out infinite",
              }}
            />
            <div
              style={{
                width: 120,
                height: 34,
                borderRadius: 8,
                background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                backgroundSize: "200% 100%",
                animation: "unitsSkeleton 1.2s ease-in-out infinite",
              }}
            />
          </div>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              display: "grid",
              gap: 10,
            }}
          >
            {Array.from({ length: 10 }).map((_, idx) => (
              <div
                key={`units-loading-row-${idx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 1fr 0.6fr 0.7fr 1fr 0.8fr 0.8fr 0.8fr 0.3fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                {Array.from({ length: 10 }).map((__, cellIdx) => (
                  <div
                    key={`units-loading-cell-${idx}-${cellIdx}`}
                    style={{
                      height: 14,
                      borderRadius: 6,
                      background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                      backgroundSize: "200% 100%",
                      animation: "unitsSkeleton 1.2s ease-in-out infinite",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <style>{`
            @keyframes unitsSkeleton {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
        </div>
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
            {hasActiveFilters
              ? `Найдено ${totalUnits ?? filteredUnits.length} заказов`
              : `Всего: ${totalUnits ?? filteredUnits.length} заказов`}
          </p>
        </div>

        <button onClick={loadUnits} style={styles.refreshButton}>
          🔄 Обновить
        </button>
      </div>

      {/* Search + Export */}
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

        <button onClick={openExportModal} style={styles.exportButton}>
          📊 Экспорт в Excel
        </button>
      </div>

      {/* Active filters (chips) + Сбросить всё */}
      {hasActiveFilters && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
            padding: "12px 16px",
            background: "#f8fafc",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
          }}
        >
          <span style={{ fontSize: 13, color: "#64748b", marginRight: 4 }}>Фильтры:</span>
          {searchQuery && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 13,
              }}
            >
              Поиск: &quot;{searchQuery}&quot;
              <button
                type="button"
                onClick={clearSearch}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                  color: "#64748b",
                  fontSize: 16,
                }}
                title="Убрать"
              >
                ×
              </button>
            </span>
          )}
          {statusFilter !== "all" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 13,
              }}
            >
              Статус: {STATUS_LABELS[statusFilter] ?? statusFilter}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  applyFiltersToUrl({ status: "all" });
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                  color: "#64748b",
                  fontSize: 16,
                }}
                title="Убрать"
              >
                ×
              </button>
            </span>
          )}
          {ageFilter !== "all" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 13,
              }}
            >
              Время: {AGE_LABELS[ageFilter] ?? ageFilter}
              <button
                type="button"
                onClick={() => {
                  setAgeFilter("all");
                  applyFiltersToUrl({ age: "all" });
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                  color: "#64748b",
                  fontSize: 16,
                }}
                title="Убрать"
              >
                ×
              </button>
            </span>
          )}
          {opsStatusFilter !== "all" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "#fff",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 13,
              }}
            >
              OPS: {opsStatusFilter === "no_status" ? "Без статуса" : getOpsStatusText(opsStatusFilter)}
              <button
                type="button"
                onClick={() => {
                  setOpsStatusFilter("all");
                  applyFiltersToUrl({ ops: "all" });
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                  color: "#64748b",
                  fontSize: 16,
                }}
                title="Убрать"
              >
                ×
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={clearAllFilters}
            style={{
              marginLeft: 8,
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid #94a3b8",
              borderRadius: 8,
              color: "#64748b",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Сбросить всё
          </button>
        </div>
      )}

      {/* Status Filter */}
      <div style={styles.filters}>
        <div style={styles.filterLabel}>Статус:</div>
        <div style={styles.filterButtons}>
          {(["all", "on_warehouse", "receiving", "stored", "picking", "shipped", "out", "ff"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                applyFiltersToUrl({ status: s });
              }}
              style={{
                ...styles.filterButton,
                ...(statusFilter === s ? styles.filterButtonActive : {}),
              }}
            >
              {STATUS_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Age Filter */}
      <div style={styles.filters}>
        <div style={styles.filterLabel}>Время на складе:</div>
        <div style={styles.filterButtons}>
          {(["all", "24h", "48h", "7d"] as const).map((a) => (
            <button
              key={a}
              onClick={() => {
                setAgeFilter(a);
                applyFiltersToUrl({ age: a });
              }}
              style={{
                ...styles.filterButton,
                ...(ageFilter === a ? styles.filterButtonActive : {}),
              }}
            >
              {AGE_LABELS[a] ?? a}
            </button>
          ))}
        </div>
      </div>

      {/* OPS Status Filter */}
      <div style={styles.filters}>
        <div style={styles.filterLabel}>OPS статус:</div>
        <div>
          <select
            value={opsStatusFilter}
            onChange={(e) => {
              const v = e.target.value;
              setOpsStatusFilter(v);
              applyFiltersToUrl({ ops: v });
            }}
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
              <th style={styles.th}>OPS статус</th>
              <th style={styles.th}>Ячейка</th>
              <th style={styles.th}>На складе</th>
              <th style={styles.th}>Создан</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {filteredUnits.length === 0 && !loading && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
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
                    {unit.meta?.ops_status === "partner_rejected_return" && (
                      <span
                        style={styles.merchantRejectionBadge}
                        title="Партнер не принял"
                      >
                        🚫 Партнер не принял
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
                  <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>
                    {getOpsStatusText(unit.meta?.ops_status ?? null)}
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
                  {(unit.status === "shipped" || unit.status === "out") && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        color: "#64748b",
                        fontWeight: 500,
                      }}
                      title="Время на складе зафиксировано на момент выхода"
                    >
                      вышел
                    </span>
                  )}
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

      {isExportModalOpen && (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            if (!isExporting) setIsExportModalOpen(false);
          }}
        >
          <div style={styles.exportModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalTitle}>Экспорт заказов</div>
                <div style={styles.modalSubtitle}>Гибкие параметры выгрузки</div>
              </div>
              <button
                style={styles.modalClose}
                onClick={() => {
                  if (!isExporting) setIsExportModalOpen(false);
                }}
                disabled={isExporting}
              >
                ×
              </button>
            </div>

            <div style={styles.exportModalBody}>
              <div style={styles.exportInfoBanner}>
                Выберите фильтры для Excel-выгрузки. Можно экспортировать только текущий склад или все units в системе (для admin/head).
              </div>

              <div style={styles.exportFormGrid}>
                <label style={styles.exportField}>
                  <span style={styles.exportLabel}>Статус заказа</span>
                  <select value={exportStatus} onChange={(e) => setExportStatus(e.target.value)} style={styles.modalSelect}>
                    <option value="all">Все</option>
                    {Object.entries(STATUS_LABELS)
                      .filter(([code]) => code !== "all")
                      .map(([code, label]) => (
                        <option key={`export-status-${code}`} value={code}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>

                <label style={styles.exportField}>
                  <span style={styles.exportLabel}>Время на складе</span>
                  <select value={exportAge} onChange={(e) => setExportAge(e.target.value)} style={styles.modalSelect}>
                    {Object.entries(AGE_LABELS).map(([code, label]) => (
                      <option key={`export-age-${code}`} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={styles.exportField}>
                  <span style={styles.exportLabel}>OPS статус</span>
                  <select value={exportOps} onChange={(e) => setExportOps(e.target.value)} style={styles.modalSelect}>
                    <option value="all">Все</option>
                    <option value="no_status">Без статуса</option>
                    {Object.entries(OPS_STATUS_LABELS).map(([code, label]) => (
                      <option key={`export-ops-${code}`} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={styles.exportField}>
                  <span style={styles.exportLabel}>Тип ячейки</span>
                  <select
                    value={exportCellType}
                    onChange={(e) => setExportCellType(e.target.value)}
                    style={styles.modalSelect}
                  >
                    {Object.entries(CELL_TYPE_LABELS).map(([code, label]) => (
                      <option key={`export-cell-type-${code}`} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ ...styles.exportField, gridColumn: "1 / -1" }}>
                  <span style={styles.exportLabel}>Поиск по номеру заказа</span>
                  <input
                    value={exportSearch}
                    onChange={(e) => setExportSearch(e.target.value)}
                    placeholder="Например: 003102929781901"
                    style={styles.exportInput}
                  />
                </label>

                <label style={styles.exportField}>
                  <span style={styles.exportLabel}>Дата добавления на склад: от</span>
                  <input
                    type="date"
                    value={exportCreatedFrom}
                    onChange={(e) => setExportCreatedFrom(e.target.value)}
                    style={styles.exportInput}
                  />
                </label>

                <label style={styles.exportField}>
                  <span style={styles.exportLabel}>Дата добавления на склад: до</span>
                  <input
                    type="date"
                    value={exportCreatedTo}
                    onChange={(e) => setExportCreatedTo(e.target.value)}
                    style={styles.exportInput}
                  />
                </label>
              </div>

              <label style={styles.exportCheckboxRow}>
                <input
                  type="checkbox"
                  checked={exportWithHistory}
                  onChange={(e) => setExportWithHistory(e.target.checked)}
                />
                <span>Добавить историю изменений (перемещения из журнала unit_moves)</span>
              </label>

              <label style={styles.exportCheckboxRow}>
                <input
                  type="checkbox"
                  checked={exportTrimBarcodeSuffix01}
                  onChange={(e) => setExportTrimBarcodeSuffix01(e.target.checked)}
                />
                <span>
                  Нормализовать штрихкоды: для 3...01 убрать последние 2 цифры; для 00... убрать первые 00 и последние 2 цифры
                </span>
              </label>

              <label
                style={{
                  ...styles.exportCheckboxRow,
                  opacity: canExportAllUnits ? 1 : 0.6,
                  cursor: canExportAllUnits ? "pointer" : "not-allowed",
                }}
              >
                <input
                  type="checkbox"
                  checked={exportAllUnits}
                  onChange={(e) => setExportAllUnits(e.target.checked)}
                  disabled={!canExportAllUnits}
                />
                <span>Экспортировать все units в системе (не только текущий склад)</span>
              </label>
              {!canExportAllUnits && (
                <div style={styles.exportMutedText}>Опция доступна только ролям admin/head.</div>
              )}

              <div style={styles.exportActions}>
                <button
                  type="button"
                  style={styles.exportCancelButton}
                  onClick={() => setIsExportModalOpen(false)}
                  disabled={isExporting}
                >
                  Отмена
                </button>
                <button type="button" style={styles.exportSubmitButton} onClick={handleExportToExcel} disabled={isExporting}>
                  {isExporting ? "Подготовка выгрузки..." : "Скачать Excel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <div style={{ padding: 20, display: "grid", gap: 10 }}>
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`unit-modal-loading-${idx}`}
                    style={{
                      height: 14,
                      borderRadius: 6,
                      background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                      backgroundSize: "200% 100%",
                      animation: "unitsSkeleton 1.2s ease-in-out infinite",
                    }}
                  />
                ))}
              </div>
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
  exportModal: {
    background: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 760,
    boxShadow: "0 24px 48px rgba(15, 23, 42, 0.24)",
    overflow: "hidden",
  } as React.CSSProperties,
  exportModalBody: {
    padding: "20px 22px",
    display: "grid",
    gap: 14,
    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  } as React.CSSProperties,
  exportInfoBanner: {
    background: "#ecfeff",
    border: "1px solid #a5f3fc",
    color: "#0f766e",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.45,
  } as React.CSSProperties,
  exportFormGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  } as React.CSSProperties,
  exportField: {
    display: "grid",
    gap: 6,
  } as React.CSSProperties,
  exportLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    letterSpacing: "0.01em",
  } as React.CSSProperties,
  exportInput: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    fontSize: 13,
    outline: "none",
  } as React.CSSProperties,
  exportCheckboxRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 13,
    color: "#334155",
    lineHeight: 1.35,
  } as React.CSSProperties,
  exportMutedText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: -8,
  } as React.CSSProperties,
  exportActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  } as React.CSSProperties,
  exportCancelButton: {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    color: "#334155",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  exportSubmitButton: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    background: "#0f766e",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(15, 118, 110, 0.22)",
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
