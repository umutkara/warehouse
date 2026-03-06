"use client";

import { useEffect, useState } from "react";
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
  age_hours?: number;
  case_state?: "active" | "archived";
  rejection_count: number;
  last_rejection?: {
    rejected_at: string;
    scenario: string;
    courier_name: string;
  };
  ticket: {
    created: boolean;
    ticket_id?: string;
    status?: "open" | "resolved" | "partner_rejected";
    created_at?: string;
    resolved_at?: string;
    notes?: string;
    ticket_number?: number;
    ticket_count?: number;
  };
};

const TICKET_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "open", label: "Открытые" },
  { value: "resolved", label: "Закрытые" },
] as const;

const SCOPE_OPTIONS = [
  { value: "all", label: "Все кейсы" },
  { value: "active", label: "Активные (в rejected)" },
  { value: "archived", label: "Архив (с тикетом)" },
] as const;

const AGE_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "24h", label: "≥ 24 ч" },
  { value: "48h", label: "≥ 48 ч" },
  { value: "7d", label: "≥ 7 д" },
] as const;

const SORT_OPTIONS = [
  { value: "created_desc", label: "Сначала новые" },
  { value: "created_asc", label: "Сначала старые" },
  { value: "age_desc", label: "Дольше на складе" },
  { value: "age_asc", label: "Меньше на складе" },
] as const;

export default function MerchantRejectionsPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageJumpInput, setPageJumpInput] = useState("1");
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ticketStatus, setTicketStatus] = useState<"all" | "open" | "resolved">("all");
  const [scope, setScope] = useState<"all" | "active" | "archived">("all");
  const [ageFilter, setAgeFilter] = useState<"all" | "24h" | "48h" | "7d">("all");
  const [sortBy, setSortBy] = useState<"created_desc" | "created_asc" | "age_desc" | "age_asc">("created_desc");
  const [searchBarcode, setSearchBarcode] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<"create" | "resolve" | "partner_rejected" | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [ticketId, setTicketId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUnits();
  }, [scope, ticketStatus, ageFilter, sortBy, page]);

  useEffect(() => {
    setPage(1);
  }, [scope, ticketStatus, ageFilter, sortBy]);

  useEffect(() => {
    setPageJumpInput(String(page));
  }, [page]);

  async function loadUnits() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (scope !== "all") params.set("scope", scope);
      if (ticketStatus !== "all") params.set("ticket_status", ticketStatus);
      if (ageFilter !== "all") params.set("age", ageFilter);
      if (sortBy !== "created_desc") params.set("sort", sortBy);
      params.set("page", String(page));
      params.set("page_size", "30");
      const q = params.toString();
      const res = await fetch("/api/ops/merchant-rejections/list" + (q ? "?" + q : ""), {
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
      setTotal(Number(json.total || 0));
      setTotalPages(Number(json.total_pages || 1));
      if (typeof json.page === "number" && json.page > 0 && json.page !== page) {
        setPage(json.page);
      }
    } catch (e: any) {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleTicketAction() {
    if (!selectedUnit || !modalAction) return;

    setSubmitting(true);

    try {
      const res = await fetch("/api/ops/merchant-rejections/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: selectedUnit.id,
          action:
            modalAction === "create"
              ? "create_ticket"
              : modalAction === "resolve"
              ? "mark_resolved"
              : "mark_partner_rejected",
          ticket_id: ticketId.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json.error || "Ошибка");
        return;
      }

      // Reload list
      await loadUnits();
      closeModal();
    } catch (e: any) {
      alert("Ошибка: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openCreateTicket(unit: Unit) {
    setSelectedUnit(unit);
    setModalAction("create");
    setTicketId("");
    setNotes("");
    setShowModal(true);
  }

  function openResolveTicket(unit: Unit) {
    setSelectedUnit(unit);
    setModalAction("resolve");
    setNotes("");
    setShowModal(true);
  }

  function openPartnerRejected(unit: Unit) {
    setSelectedUnit(unit);
    setModalAction("partner_rejected");
    setNotes("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setSelectedUnit(null);
    setModalAction(null);
    setTicketId("");
    setNotes("");
  }

  function setAgeSort(direction: "desc" | "asc") {
    setSortBy(direction === "desc" ? "age_desc" : "age_asc");
  }

  function handlePageJump() {
    const raw = pageJumpInput.trim();
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const targetPage = Math.min(totalPages, Math.max(1, Math.floor(parsed)));
    setPage(targetPage);
    setPageJumpInput(String(targetPage));
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: "center", padding: 40 }}>Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.error, marginTop: 40 }}>{error}</div>
      </div>
    );
  }

  const filteredBySearch = searchBarcode.trim()
    ? units.filter((u) => u.barcode.toLowerCase().includes(searchBarcode.trim().toLowerCase()))
    : units;
  const pageFrom = total === 0 ? 0 : (page - 1) * 30 + 1;
  const pageTo = total === 0 ? 0 : Math.min(page * 30, total);
  const activeOnPage = units.filter((u) => u.case_state === "active").length;
  const archivedOnPage = units.filter((u) => u.case_state === "archived").length;
  const openTicketsOnPage = units.filter((u) => u.ticket.created && u.ticket.status === "open").length;
  const resolvedTicketsOnPage = units.filter(
    (u) => u.ticket.created && (u.ticket.status === "resolved" || u.ticket.status === "partner_rejected")
  ).length;

  function resetFilters() {
    setScope("all");
    setTicketStatus("all");
    setAgeFilter("all");
    setSortBy("created_desc");
    setSearchBarcode("");
    setPage(1);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🚫 Мерчант не принял</h1>
        <div style={styles.subtitle}>
          Активные и архивные кейсы мерчант-отказа. Всего: <strong>{total}</strong>
          {searchBarcode.trim() && ` (на странице: ${filteredBySearch.length})`}
        </div>
        <div style={styles.kpiRow}>
          <span style={styles.kpiChip}>Активные: {activeOnPage}</span>
          <span style={styles.kpiChip}>Архив: {archivedOnPage}</span>
          <span style={styles.kpiChip}>Открытые тикеты: {openTicketsOnPage}</span>
          <span style={styles.kpiChip}>Решённые тикеты: {resolvedTicketsOnPage}</span>
        </div>
      </div>

      <div style={styles.filters}>
        <div style={styles.filterRow}>
          <label style={styles.filterLabel}>Режим:</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            style={styles.select}
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label style={styles.filterLabel}>Тикет:</label>
          <select
            value={ticketStatus}
            onChange={(e) => setTicketStatus(e.target.value as typeof ticketStatus)}
            style={styles.select}
          >
            {TICKET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label style={{ ...styles.filterLabel, marginLeft: 16 }}>Время на складе:</label>
          <select
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value as typeof ageFilter)}
            style={styles.select}
          >
            {AGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label style={{ ...styles.filterLabel, marginLeft: 16 }}>Сортировка:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={styles.select}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={styles.filterRow}>
          <label style={styles.filterLabel}>Поиск по заказу:</label>
          <input
            type="text"
            value={searchBarcode}
            onChange={(e) => setSearchBarcode(e.target.value)}
            placeholder="Штрихкод или часть"
            style={styles.searchInput}
          />
          <button
            type="button"
            onClick={resetFilters}
            style={styles.resetBtn}
          >
            Сбросить фильтры
          </button>
        </div>
      </div>

      {filteredBySearch.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{units.length === 0 ? "✅" : "🔍"}</div>
          <div style={{ fontSize: 18, color: "#6b7280" }}>
            {units.length === 0 ? "Нет проблемных заказов" : "По поиску ничего не найдено"}
          </div>
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Заказ</th>
                <th style={styles.th}>Товар / Партнер</th>
                <th style={styles.th}>Ячейка</th>
                <th style={styles.th}>Кейс</th>
                <th style={styles.th}>
                  <div style={styles.sortHeader}>
                    <span>На складе</span>
                    <button
                      type="button"
                      onClick={() => setAgeSort("desc")}
                      style={{
                        ...styles.sortArrow,
                        color: sortBy === "age_desc" ? "#111827" : "#9ca3af",
                      }}
                      title="Сначала дольше на складе"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgeSort("asc")}
                      style={{
                        ...styles.sortArrow,
                        color: sortBy === "age_asc" ? "#111827" : "#9ca3af",
                      }}
                      title="Сначала меньше на складе"
                    >
                      ↑
                    </button>
                  </div>
                </th>
                <th style={styles.th}>Отклонений</th>
                <th style={styles.th}>Последний отказ</th>
                <th style={styles.th}>Тикет</th>
                <th style={styles.th}>Статус</th>
                <th style={styles.th}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredBySearch.map((unit, index) => (
                <tr
                  key={unit.id}
                  style={{
                    ...styles.tr,
                    background: index % 2 === 0 ? "#fff" : "#fcfcfd",
                  }}
                >
                  <td style={styles.td}>
                    <div
                      style={styles.barcode}
                      onClick={() => router.push(`/app/units/${unit.id}`)}
                    >
                      {unit.barcode}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.productName}>
                      {unit.product_name || "—"}
                    </div>
                    <div style={styles.partnerName}>
                      {unit.partner_name || "—"}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.cellCode}>{unit.cell_code || "—"}</div>
                  </td>
                  <td style={styles.td}>
                    {unit.case_state === "active" ? (
                      <span style={styles.caseActive}>Активный</span>
                    ) : (
                      <span style={styles.caseArchived}>Архив</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div
                      style={{
                        ...styles.ageHours,
                        color:
                          unit.age_hours == null
                            ? "#6b7280"
                            : unit.age_hours <= 24
                            ? "#059669"
                            : "#dc2626",
                      }}
                    >
                      {unit.age_hours != null
                        ? unit.age_hours >= 24
                          ? `${Math.floor(unit.age_hours / 24)} д`
                          : `${unit.age_hours} ч`
                        : "—"}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.rejectionCount}>{unit.rejection_count}</div>
                  </td>
                  <td style={styles.td}>
                    {unit.last_rejection ? (
                      <div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {new Date(unit.last_rejection.rejected_at).toLocaleDateString("ru-RU")}
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {unit.last_rejection.scenario || "Сценарий не указан"}
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={styles.td}>
                    {unit.ticket.created ? (
                      <div style={styles.ticketId}>
                        {unit.ticket.ticket_id}
                        {(unit.ticket.ticket_count || 0) > 1
                          ? ` (#${unit.ticket.ticket_number || unit.ticket.ticket_count})`
                          : ""}
                      </div>
                    ) : (
                      <span style={styles.noTicket}>Не создан</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {unit.ticket.created ? (
                      unit.ticket.status === "resolved" ? (
                        <span style={styles.statusResolved}>✅ Решено</span>
                      ) : unit.ticket.status === "partner_rejected" ? (
                        <span style={styles.statusPartnerRejected}>🚫 Отклонен партнером</span>
                      ) : (
                        <span style={styles.statusOpen}>⏳ Открыт</span>
                      )
                    ) : (
                      <span style={styles.statusNone}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {!unit.ticket.created || unit.ticket.status !== "open" ? (
                      <button
                        onClick={() => openCreateTicket(unit)}
                        style={styles.btnCreate}
                      >
                        {unit.ticket.created ? "Создать повторный тикет" : "Создать тикет"}
                      </button>
                    ) : (
                      <div style={styles.actionStack}>
                        <button
                          onClick={() => openResolveTicket(unit)}
                          style={styles.btnResolve}
                        >
                          Отметить решенным
                        </button>
                        <button
                          onClick={() => openPartnerRejected(unit)}
                          style={styles.btnPartnerRejected}
                        >
                          Отклонен партнером
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={styles.pagination}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ ...styles.pageBtn, opacity: page <= 1 ? 0.5 : 1 }}
            >
              ← Назад
            </button>
            <div style={styles.pageInfo}>
              Страница {page} из {totalPages} • Показано {pageFrom}-{pageTo} из {total}
            </div>
            <div style={styles.pageJump}>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageJumpInput}
                onChange={(e) => setPageJumpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePageJump();
                }}
                style={styles.pageJumpInput}
                placeholder="Стр."
              />
              <button
                type="button"
                onClick={handlePageJump}
                style={styles.pageJumpBtn}
              >
                Перейти
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{ ...styles.pageBtn, opacity: page >= totalPages ? 0.5 : 1 }}
            >
              Вперёд →
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && selectedUnit && (
        <div style={styles.modalOverlay} onClick={closeModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {modalAction === "create"
                ? "Создать тикет"
                : modalAction === "resolve"
                ? "Отметить решенным"
                : "Отклонен партнером"}
            </h2>

            <div style={{ marginBottom: 16 }}>
              <div style={styles.label}>Заказ:</div>
              <div style={styles.value}>{selectedUnit.barcode}</div>
            </div>

            {modalAction === "create" && (
              <div style={{ marginBottom: 16 }}>
                <label style={styles.label}>ID тикета (опционально):</label>
                <input
                  type="text"
                  value={ticketId}
                  onChange={(e) => setTicketId(e.target.value)}
                  placeholder="TICKET-123 или оставьте пустым"
                  style={styles.input}
                />
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <label style={styles.label}>Примечания:</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Опишите проблему или решение..."
                rows={4}
                style={styles.textarea}
              />
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={closeModal}
                disabled={submitting}
                style={styles.btnCancel}
              >
                Отмена
              </button>
              <button
                onClick={handleTicketAction}
                disabled={submitting}
                style={styles.btnSubmit}
              >
                {submitting
                  ? "Сохранение..."
                  : modalAction === "create"
                  ? "Создать"
                  : modalAction === "resolve"
                  ? "Отметить"
                  : "Отклонить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "var(--spacing-xl)",
  } as React.CSSProperties,
  header: {
    marginBottom: "var(--spacing-xl)",
  } as React.CSSProperties,
  kpiRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  } as React.CSSProperties,
  kpiChip: {
    fontSize: 12,
    color: "#374151",
    background: "#f3f4f6",
    borderRadius: 9999,
    padding: "4px 10px",
    fontWeight: 600,
  } as React.CSSProperties,
  title: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
  } as React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
  } as React.CSSProperties,
  filters: {
    marginBottom: 20,
    padding: 16,
    background: "#f9fafb",
    borderRadius: 8,
  } as React.CSSProperties,
  filterRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  } as React.CSSProperties,
  filterLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
  } as React.CSSProperties,
  select: {
    padding: "8px 12px",
    fontSize: 13,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: 6,
    background: "#fff",
    minWidth: 140,
  } as React.CSSProperties,
  searchInput: {
    padding: "8px 12px",
    fontSize: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: 6,
    width: 220,
  } as React.CSSProperties,
  resetBtn: {
    marginLeft: "auto",
    padding: "8px 12px",
    fontSize: 12,
    color: "#374151",
    background: "#fff",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
  } as React.CSSProperties,
  ageHours: {
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
  } as React.CSSProperties,
  emptyState: {
    textAlign: "center",
    padding: 80,
    background: "#f9fafb",
    borderRadius: 12,
  } as React.CSSProperties,
  error: {
    padding: 16,
    background: "#fef2f2",
    color: "#dc2626",
    borderRadius: 8,
    textAlign: "center",
  } as React.CSSProperties,
  tableContainer: {
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    overflow: "hidden",
  } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
  } as React.CSSProperties,
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "12px 16px",
    borderTop: "1px solid #e5e7eb",
    background: "#fafafa",
  } as React.CSSProperties,
  pageBtn: {
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    borderRadius: 6,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  } as React.CSSProperties,
  pageInfo: {
    fontSize: 13,
    color: "#4b5563",
  } as React.CSSProperties,
  pageJump: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,
  pageJumpInput: {
    width: 72,
    padding: "6px 8px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: 6,
    fontSize: 13,
  } as React.CSSProperties,
  pageJumpBtn: {
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  } as React.CSSProperties,
  th: {
    padding: 16,
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    background: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e5e7eb",
  } as React.CSSProperties,
  sortHeader: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } as React.CSSProperties,
  sortArrow: {
    borderWidth: 0,
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    fontSize: 12,
    lineHeight: 1,
    fontWeight: 700,
  } as React.CSSProperties,
  tr: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#f3f4f6",
  } as React.CSSProperties,
  td: {
    padding: 16,
    fontSize: 14,
  } as React.CSSProperties,
  barcode: {
    color: "#2563eb",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  productName: {
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 2,
  } as React.CSSProperties,
  partnerName: {
    fontSize: 12,
    color: "#6b7280",
  } as React.CSSProperties,
  cellCode: {
    fontSize: 13,
    fontFamily: "monospace",
    color: "#059669",
  } as React.CSSProperties,
  caseActive: {
    display: "inline-block",
    fontSize: 12,
    color: "#b45309",
    background: "#fef3c7",
    borderRadius: 9999,
    padding: "3px 10px",
    fontWeight: 600,
  } as React.CSSProperties,
  caseArchived: {
    display: "inline-block",
    fontSize: 12,
    color: "#374151",
    background: "#e5e7eb",
    borderRadius: 9999,
    padding: "3px 10px",
    fontWeight: 600,
  } as React.CSSProperties,
  rejectionCount: {
    fontSize: 18,
    fontWeight: 700,
    color: "#dc2626",
  } as React.CSSProperties,
  ticketId: {
    fontSize: 13,
    fontFamily: "monospace",
    color: "#7c3aed",
    fontWeight: 600,
  } as React.CSSProperties,
  noTicket: {
    fontSize: 12,
    color: "#9ca3af",
  } as React.CSSProperties,
  statusResolved: {
    fontSize: 12,
    color: "#059669",
    fontWeight: 600,
  } as React.CSSProperties,
  statusOpen: {
    fontSize: 12,
    color: "#f59e0b",
    fontWeight: 600,
  } as React.CSSProperties,
  statusPartnerRejected: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: 600,
  } as React.CSSProperties,
  statusNone: {
    fontSize: 12,
    color: "#9ca3af",
  } as React.CSSProperties,
  btnCreate: {
    padding: "6px 12px",
    fontSize: 12,
    background: "#2563eb",
    color: "#fff",
    borderWidth: 0,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,
  btnResolve: {
    padding: "6px 12px",
    fontSize: 12,
    background: "#059669",
    color: "#fff",
    borderWidth: 0,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,
  btnPartnerRejected: {
    padding: "6px 12px",
    fontSize: 12,
    background: "#dc2626",
    color: "#fff",
    borderWidth: 0,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,
  actionStack: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } as React.CSSProperties,
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  } as React.CSSProperties,
  modal: {
    background: "#fff",
    borderRadius: 12,
    padding: 24,
    maxWidth: 500,
    width: "90%",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  } as React.CSSProperties,
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 24,
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 8,
  } as React.CSSProperties,
  value: {
    fontSize: 16,
    fontWeight: 600,
    color: "#2563eb",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: 6,
    boxSizing: "border-box",
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: 6,
    boxSizing: "border-box",
    fontFamily: "inherit",
    resize: "vertical",
  } as React.CSSProperties,
  modalActions: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
  } as React.CSSProperties,
  btnCancel: {
    padding: "10px 20px",
    fontSize: 14,
    background: "#fff",
    color: "#374151",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,
  btnSubmit: {
    padding: "10px 20px",
    fontSize: 14,
    background: "#2563eb",
    color: "#fff",
    borderWidth: 0,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,
};
