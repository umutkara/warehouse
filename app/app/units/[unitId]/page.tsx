"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  product_name?: string;
  partner_name?: string;
  price?: number;
  photos?: Array<{
    url: string;
    filename: string;
    uploaded_at: string;
    uploaded_by_name?: string;
  }>;
  cell_id?: string;
  created_at: string;
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
  };
};

type HistoryEvent = {
  event_type: string;
  created_at: string;
  details: any;
};

export default function UnitDetailPage() {
  const router = useRouter();
  const params = useParams();
  const unitId = params.unitId as string;

  const [unit, setUnit] = useState<Unit | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [productName, setProductName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  // Photo upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    loadUnit();
    loadHistory();
  }, [unitId]);

  async function loadUnit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/units/${unitId}`);
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        setError(json.error || "Ошибка загрузки");
        return;
      }

      setUnit(json.unit);
      setProductName(json.unit.product_name || "");
      setPartnerName(json.unit.partner_name || "");
      setPrice(json.unit.price ? String(json.unit.price) : "");
    } catch (e: any) {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch(`/api/units/${unitId}/history`);
      const json = await res.json();

      if (res.ok) {
        setHistory(json.history || []);
      } else {
        console.error("Failed to load history:", json.error);
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  }

  async function handleSave() {
    if (!unit) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/units/${unitId}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: productName.trim() || null,
          partner_name: partnerName.trim() || null,
          price: price.trim() ? parseFloat(price) : null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Ошибка сохранения");
        return;
      }

      setUnit(json.unit);
      setEditing(false);
      await loadHistory(); // Reload history to show update event
    } catch (e: any) {
      setError("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("photo", file);

      const res = await fetch(`/api/units/${unitId}/upload-photo`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setUploadError(json.error || "Ошибка загрузки фото");
        return;
      }

      // Update unit with new photos
      setUnit((prev) => (prev ? { ...prev, photos: json.photos } : null));
      await loadHistory(); // Show upload event
    } catch (e: any) {
      setUploadError("Ошибка загрузки фото");
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = "";
    }
  }

  async function handleDeletePhoto(filename: string) {
    if (!confirm("Удалить фото?")) return;

    try {
      const res = await fetch(
        `/api/units/${unitId}/upload-photo?filename=${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      );

      const json = await res.json();

      if (res.ok) {
        setUnit((prev) => (prev ? { ...prev, photos: json.photos } : null));
        await loadHistory();
      }
    } catch (e) {
      console.error("Failed to delete photo:", e);
    }
  }

  function renderHistoryEvent(event: HistoryEvent, idx: number) {
    const date = new Date(event.created_at).toLocaleString("ru-RU");
    const uniqueKey = `${event.event_type}-${event.created_at}-${idx}`;

    switch (event.event_type) {
      case "move":
        const { from_cell, to_cell, actor_name, actor_role, note, source } = event.details;
        return (
          <div key={uniqueKey} style={styles.historyItem}>
            <div style={styles.historyIcon}>📦</div>
            <div style={{ flex: 1 }}>
              <div style={styles.historyTitle}>Перемещение</div>
              <div style={styles.historyText}>
                {from_cell || "—"} → {to_cell || "—"}
              </div>
              {note && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  Примечание: {note}
                </div>
              )}
              {source && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  Источник: {source}
                </div>
              )}
              <div style={styles.historyMeta}>
                {actor_name} ({actor_role}) • {date}
              </div>
            </div>
          </div>
        );

      case "shipment":
        const { status, courier_name, shipped_by, returned_by, return_reason, returned_at } = event.details;
        if (status === "out") {
          return (
            <div key={`${uniqueKey}-out`} style={styles.historyItem}>
              <div style={styles.historyIcon}>🚚</div>
              <div style={{ flex: 1 }}>
                <div style={styles.historyTitle}>Отправка в OUT</div>
                <div style={styles.historyText}>Курьер: {courier_name}</div>
                <div style={styles.historyMeta}>
                  {shipped_by} • {date}
                </div>
              </div>
            </div>
          );
        } else if (status === "returned" && returned_at) {
          return (
            <div key={`${uniqueKey}-returned`} style={styles.historyItem}>
              <div style={styles.historyIcon}>↩️</div>
              <div style={{ flex: 1 }}>
                <div style={styles.historyTitle}>Возврат из OUT</div>
                {return_reason && <div style={styles.historyText}>{return_reason}</div>}
                <div style={styles.historyMeta}>
                  {returned_by} • {new Date(returned_at).toLocaleString("ru-RU")}
                </div>
              </div>
            </div>
          );
        }
        break;

      case "audit":
        const { action, summary, actor_name: auditActor, actor_role: auditRole, meta } = event.details;
        let icon = "📝";
        let bgColor = "#f9fafb";
        let borderColor = "#e5e7eb";

        // Special handling for merchant rejection and service center return
        if (action === "logistics.merchant_rejection") {
          icon = "🚫";
          bgColor = "#fef2f2";
          borderColor = "#fecaca";
        } else if (action === "logistics.service_center_return") {
          icon = "🔧";
          bgColor = "#fef3c7";
          borderColor = "#fde047";
        } else if (action === "unit.create") {
          icon = "✨";
          bgColor = "#f0fdf4";
          borderColor = "#bbf7d0";
        } else if (action === "unit.photo_uploaded") {
          icon = "📷";
        } else if (action === "unit.photo_deleted") {
          icon = "🗑️";
        } else if (action === "unit.update") {
          icon = "✏️";
        } else if (action?.includes("picking_task")) {
          icon = "📋";
          bgColor = "#f0fdf4";
          borderColor = "#bbf7d0";
        } else if (action?.includes("logistics")) {
          icon = "🚚";
          bgColor = "#f5f3ff";
          borderColor = "#ddd6fe";
        }

        return (
          <div
            key={uniqueKey}
            style={{
              ...styles.historyItem,
              background: bgColor,
              borderColor: borderColor,
            }}
          >
            <div style={styles.historyIcon}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={styles.historyTitle}>{summary || action}</div>
              {/* Show scenario if present */}
              {meta?.scenario && (
                <div style={styles.historyScenario}>
                  Сценарий: {meta.scenario}
                </div>
              )}
              {/* Show courier if present */}
              {meta?.courier_name && (
                <div style={styles.historyCourier}>
                  Курьер: {meta.courier_name}
                </div>
              )}
              <div style={styles.historyMeta}>
                {auditActor} ({auditRole}) • {date}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: "center", padding: 40 }}>Загрузка...</div>
      </div>
    );
  }

  if (error && !unit) {
    return (
      <div style={styles.container}>
        <div style={{ color: "#dc2626", padding: 20 }}>{error}</div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div style={styles.container}>
        <div style={{ padding: 20 }}>Заказ не найден</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => router.back()} style={styles.backButton}>
          ← Назад
        </button>
        <h1 style={styles.title}>Заказ {unit.barcode}</h1>
      </div>

      {/* Merchant Rejection Alert */}
      {unit.meta?.merchant_rejections && unit.meta.merchant_rejections.length > 0 && (
        <div style={styles.merchantRejectionAlert}>
          <div style={styles.merchantRejectionHeader}>
            <span style={{ fontSize: 24 }}>🚫</span>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              Возврат от мерчанта ({unit.meta.merchant_rejection_count || unit.meta.merchant_rejections.length})
            </h3>
          </div>
          <div style={styles.merchantRejectionBody}>
            {unit.meta.merchant_rejections.map((rejection, idx) => (
              <div
                key={idx}
                style={{
                  padding: 12,
                  background: idx === 0 ? "#fff" : "#fef2f2",
                  borderRadius: 8,
                  marginBottom: idx < unit.meta!.merchant_rejections!.length - 1 ? 12 : 0,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "#fecaca",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8, color: "#dc2626" }}>
                  Возврат #{rejection.return_number}
                </div>
                <div style={styles.merchantRejectionRow}>
                  <span style={styles.merchantRejectionLabel}>Дата отказа:</span>
                  <span style={styles.merchantRejectionValue}>
                    {new Date(rejection.rejected_at).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div style={styles.merchantRejectionRow}>
                  <span style={styles.merchantRejectionLabel}>Сценарий:</span>
                  <span style={styles.merchantRejectionValue}>
                    {rejection.scenario}
                  </span>
                </div>
                <div style={styles.merchantRejectionRow}>
                  <span style={styles.merchantRejectionLabel}>Курьер:</span>
                  <span style={styles.merchantRejectionValue}>
                    {rejection.courier_name}
                  </span>
                </div>
                <div style={styles.merchantRejectionRow}>
                  <span style={styles.merchantRejectionLabel}>Причина:</span>
                  <span style={styles.merchantRejectionValue}>
                    {rejection.reason}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service Center Return Alert */}
      {unit.meta?.service_center_returns && unit.meta.service_center_returns.length > 0 && (
        <div style={styles.serviceCenterAlert}>
          <div style={styles.serviceCenterHeader}>
            <span style={{ fontSize: 24 }}>🔧</span>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              Возврат с сервисного центра ({unit.meta.service_center_return_count || unit.meta.service_center_returns.length})
            </h3>
          </div>
          <div style={styles.serviceCenterBody}>
            {unit.meta.service_center_returns.map((returnInfo, idx) => (
              <div
                key={idx}
                style={{
                  padding: 12,
                  background: idx === 0 ? "#fff" : "#fffbeb",
                  borderRadius: 8,
                  marginBottom: idx < unit.meta!.service_center_returns!.length - 1 ? 12 : 0,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "#fed7aa",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8, color: "#f59e0b" }}>
                  Возврат #{returnInfo.return_number}
                </div>
                <div style={styles.serviceCenterRow}>
                  <span style={styles.serviceCenterLabel}>Дата возврата:</span>
                  <span style={styles.serviceCenterValue}>
                    {new Date(returnInfo.returned_at).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div style={styles.serviceCenterRow}>
                  <span style={styles.serviceCenterLabel}>Сценарий:</span>
                  <span style={styles.serviceCenterValue}>
                    {returnInfo.scenario}
                  </span>
                </div>
                <div style={styles.serviceCenterRow}>
                  <span style={styles.serviceCenterLabel}>Курьер:</span>
                  <span style={styles.serviceCenterValue}>
                    {returnInfo.courier_name}
                  </span>
                </div>
                <div style={styles.serviceCenterRow}>
                  <span style={styles.serviceCenterLabel}>Причина:</span>
                  <span style={styles.serviceCenterValue}>
                    {returnInfo.reason}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.grid}>
        {/* Left Column - Info */}
        <div style={styles.column}>
          {/* Photos */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Фотографии</h2>
              <label style={styles.uploadButton}>
                {uploading ? "Загрузка..." : "+ Добавить"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {uploadError && (
              <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{uploadError}</div>
            )}

            <div style={styles.photosGrid}>
              {(!unit.photos || unit.photos.length === 0) && (
                <div style={{ fontSize: 14, color: "#9ca3af" }}>Нет фото</div>
              )}
              {unit.photos?.map((photo, idx) => (
                <div key={idx} style={styles.photoCard}>
                  <div style={styles.photoContainer}>
                    <img src={photo.url} alt={`Photo ${idx + 1}`} style={styles.photo} />
                  </div>
                  <button
                    onClick={() => handleDeletePhoto(photo.filename)}
                    style={styles.deletePhotoButton}
                    title="Удалить фото"
                  >
                    🗑️
                  </button>
                  <div style={styles.photoMeta}>
                    {photo.uploaded_by_name && (
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{photo.uploaded_by_name}</div>
                    )}
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      {new Date(photo.uploaded_at).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Информация</h2>
              {!editing && (
                <button onClick={() => setEditing(true)} style={styles.editButton}>
                  ✏️ Редактировать
                </button>
              )}
            </div>

            {error && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{error}</div>}

            {editing ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={styles.label}>Название товара</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    style={styles.input}
                    placeholder="Например: iPhone 15 Pro"
                  />
                </div>

                <div>
                  <label style={styles.label}>Партнер (мерч)</label>
                  <input
                    type="text"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    style={styles.input}
                    placeholder="Например: Apple Store"
                  />
                </div>

                <div>
                  <label style={styles.label}>Цена</label>
                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    style={styles.input}
                    placeholder="0.00"
                  />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleSave} disabled={saving} style={styles.saveButton}>
                    {saving ? "Сохранение..." : "Сохранить"}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setProductName(unit.product_name || "");
                      setPartnerName(unit.partner_name || "");
                      setPrice(unit.price ? String(unit.price) : "");
                    }}
                    style={styles.cancelButton}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={styles.infoLabel}>Название товара</div>
                  <div style={styles.infoValue}>{unit.product_name || "—"}</div>
                </div>

                <div>
                  <div style={styles.infoLabel}>Партнер</div>
                  <div style={styles.infoValue}>{unit.partner_name || "—"}</div>
                </div>

                <div>
                  <div style={styles.infoLabel}>Цена</div>
                  <div style={styles.infoValue}>
                    {unit.price ? `${unit.price.toFixed(2)} ₽` : "—"}
                  </div>
                </div>

                <div>
                  <div style={styles.infoLabel}>Статус</div>
                  <div style={styles.infoValue}>
                    <span style={styles.statusBadge}>{unit.status}</span>
                  </div>
                </div>

                <div>
                  <div style={styles.infoLabel}>Создан</div>
                  <div style={styles.infoValue}>
                    {new Date(unit.created_at).toLocaleString("ru-RU")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - History */}
        <div style={styles.column}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>История перемещений</h2>

            <div style={styles.historyContainer}>
              {history.length === 0 && (
                <div style={{ fontSize: 14, color: "#9ca3af", textAlign: "center", padding: 20 }}>
                  История пуста
                </div>
              )}
              {history.map((event, idx) => renderHistoryEvent(event, idx))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "var(--spacing-xl)",
  },
  header: {
    marginBottom: "var(--spacing-xl)",
  },
  backButton: {
    padding: "8px 16px",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    marginBottom: 16,
  } as React.CSSProperties,
  title: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 0,
  } as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "var(--spacing-lg)",
  } as React.CSSProperties,
  column: {
    display: "grid",
    gap: "var(--spacing-lg)",
    alignContent: "start",
  } as React.CSSProperties,
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "var(--spacing-lg)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  } as React.CSSProperties,
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "var(--spacing-md)",
  } as React.CSSProperties,
  cardTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
  } as React.CSSProperties,
  uploadButton: {
    padding: "6px 12px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  } as React.CSSProperties,
  editButton: {
    padding: "6px 12px",
    background: "#fff",
    color: "#2563eb",
    border: "1px solid #2563eb",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  } as React.CSSProperties,
  photosGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: 12,
  } as React.CSSProperties,
  photoCard: {
    position: "relative",
  } as React.CSSProperties,
  photoContainer: {
    width: "100%",
    paddingBottom: "100%",
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
    background: "#f3f4f6",
  } as React.CSSProperties,
  photo: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  } as React.CSSProperties,
  deletePhotoButton: {
    position: "absolute",
    top: 4,
    right: 4,
    background: "rgba(0,0,0,0.6)",
    border: "none",
    borderRadius: 4,
    padding: 4,
    cursor: "pointer",
    fontSize: 12,
  } as React.CSSProperties,
  photoMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "#6b7280",
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    color: "#374151",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
  } as React.CSSProperties,
  saveButton: {
    flex: 1,
    padding: "8px 16px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  } as React.CSSProperties,
  cancelButton: {
    flex: 1,
    padding: "8px 16px",
    background: "#fff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  } as React.CSSProperties,
  infoLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    marginBottom: 4,
  } as React.CSSProperties,
  infoValue: {
    fontSize: 14,
    color: "#111827",
  } as React.CSSProperties,
  statusBadge: {
    display: "inline-block",
    padding: "4px 12px",
    background: "#dbeafe",
    color: "#1e40af",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
  } as React.CSSProperties,
  historyContainer: {
    display: "grid",
    gap: 12,
    maxHeight: 600,
    overflow: "auto",
  } as React.CSSProperties,
  historyItem: {
    display: "flex",
    gap: 12,
    padding: 12,
    background: "#f9fafb",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
  } as React.CSSProperties,
  historyIcon: {
    fontSize: 24,
    flexShrink: 0,
  } as React.CSSProperties,
  historyTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#111827",
    marginBottom: 2,
  } as React.CSSProperties,
  historyText: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 4,
  } as React.CSSProperties,
  historyMeta: {
    fontSize: 11,
    color: "#9ca3af",
  } as React.CSSProperties,
  historyScenario: {
    fontSize: 12,
    color: "#059669",
    fontWeight: 600,
    marginTop: 4,
    padding: "2px 8px",
    background: "#d1fae5",
    borderRadius: 4,
    display: "inline-block",
  } as React.CSSProperties,
  historyCourier: {
    fontSize: 12,
    color: "#7c3aed",
    fontWeight: 600,
    marginTop: 4,
    padding: "2px 8px",
    background: "#ede9fe",
    borderRadius: 4,
    display: "inline-block",
    marginLeft: 8,
  } as React.CSSProperties,
  merchantRejectionAlert: {
    background: "#fef2f2",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#dc2626",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    boxShadow: "0 4px 6px rgba(220, 38, 38, 0.1)",
  } as React.CSSProperties,
  merchantRejectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#fecaca",
  } as React.CSSProperties,
  merchantRejectionBody: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } as React.CSSProperties,
  merchantRejectionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,
  merchantRejectionLabel: {
    fontWeight: 600,
    fontSize: 14,
    color: "#7f1d1d",
    minWidth: 120,
  } as React.CSSProperties,
  merchantRejectionValue: {
    fontSize: 14,
    color: "#1f2937",
  } as React.CSSProperties,
  serviceCenterAlert: {
    background: "#fffbeb",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#f59e0b",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    boxShadow: "0 4px 6px rgba(245, 158, 11, 0.1)",
  } as React.CSSProperties,
  serviceCenterHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#fed7aa",
  } as React.CSSProperties,
  serviceCenterBody: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } as React.CSSProperties,
  serviceCenterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,
  serviceCenterLabel: {
    fontWeight: 600,
    fontSize: 14,
    color: "#92400e",
    minWidth: 120,
  } as React.CSSProperties,
  serviceCenterValue: {
    fontSize: 14,
    color: "#1f2937",
  } as React.CSSProperties,
};
