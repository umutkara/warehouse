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
  rejection_count: number;
  last_rejection?: {
    rejected_at: string;
    scenario: string;
    courier_name: string;
  };
  ticket: {
    created: boolean;
    ticket_id?: string;
    status?: string;
    created_at?: string;
    resolved_at?: string;
    notes?: string;
  };
};

export default function MerchantRejectionsPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<"create" | "resolve" | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [ticketId, setTicketId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUnits();
  }, []);

  async function loadUnits() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ops/merchant-rejections/list", {
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
          action: modalAction === "create" ? "create_ticket" : "mark_resolved",
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

  function closeModal() {
    setShowModal(false);
    setSelectedUnit(null);
    setModalAction(null);
    setTicketId("");
    setNotes("");
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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🚫 Мерчант не принял</h1>
        <div style={styles.subtitle}>
          Всего заказов: <strong>{units.length}</strong>
        </div>
      </div>

      {units.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 18, color: "#6b7280" }}>
            Нет проблемных заказов
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
                <th style={styles.th}>Отклонений</th>
                <th style={styles.th}>Последний отказ</th>
                <th style={styles.th}>Тикет</th>
                <th style={styles.th}>Статус</th>
                <th style={styles.th}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id} style={styles.tr}>
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
                    <div style={styles.rejectionCount}>{unit.rejection_count}</div>
                  </td>
                  <td style={styles.td}>
                    {unit.last_rejection ? (
                      <div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {new Date(unit.last_rejection.rejected_at).toLocaleDateString("ru-RU")}
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {unit.last_rejection.scenario}
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={styles.td}>
                    {unit.ticket.created ? (
                      <div style={styles.ticketId}>{unit.ticket.ticket_id}</div>
                    ) : (
                      <span style={styles.noTicket}>Не создан</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {unit.ticket.created ? (
                      unit.ticket.status === "resolved" ? (
                        <span style={styles.statusResolved}>✅ Решено</span>
                      ) : (
                        <span style={styles.statusOpen}>⏳ Открыт</span>
                      )
                    ) : (
                      <span style={styles.statusNone}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {!unit.ticket.created ? (
                      <button
                        onClick={() => openCreateTicket(unit)}
                        style={styles.btnCreate}
                      >
                        Создать тикет
                      </button>
                    ) : unit.ticket.status === "open" ? (
                      <button
                        onClick={() => openResolveTicket(unit)}
                        style={styles.btnResolve}
                      >
                        Отметить решенным
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && selectedUnit && (
        <div style={styles.modalOverlay} onClick={closeModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {modalAction === "create" ? "Создать тикет" : "Отметить решенным"}
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
                {submitting ? "Сохранение..." : modalAction === "create" ? "Создать" : "Отметить"}
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
  title: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
  } as React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
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
