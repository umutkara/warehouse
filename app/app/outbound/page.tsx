"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Shipment = {
  id: string;
  courier_name: string;
  out_at: string;
  status: string;
  unit: {
    id: string;
    barcode: string;
  } | null;
  out_by_profile: {
    full_name: string;
    role: string;
  } | null;
};

export default function OutPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("guest");

  useEffect(() => {
    loadShipments();
    loadRole();
  }, []);

  async function loadRole() {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.role) {
        setRole(json.role);
      }
    } catch {
      setRole("guest");
    }
  }

  async function loadShipments() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/logistics/out-shipments?status=out", { cache: "no-store" });
      
      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 403) {
        setError("У вас нет доступа к этому разделу");
        setLoading(false);
        return;
      }

      const json = await res.json();
      
      if (res.ok && json.ok) {
        setShipments(json.shipments || []);
      } else {
        setError(json.error || "Ошибка загрузки отправок");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--spacing-xl)" }}>
      <div style={{ marginBottom: "var(--spacing-xl)" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: "var(--spacing-sm)" }}>
          OUT - Заказы в доставке
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          Заказы, отправленные курьерами. Только просмотр.
        </p>
        <p style={{ color: "#f59e0b", fontSize: 13, marginTop: 8, fontWeight: 600 }}>
          ⚠️ Возвраты обрабатываются через ТСД → Приёмка (обычным способом)
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "#fee",
            border: "1px solid #fcc",
            borderRadius: "var(--radius-md)",
            padding: "var(--spacing-md)",
            marginBottom: "var(--spacing-lg)",
            color: "#c00",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-md)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>
          Активные отправки ({shipments.length})
        </h2>
        <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
          {role === "admin" && (
            <button
              onClick={() => router.push("/app/outbound/admin")}
              style={{
                padding: "var(--spacing-sm) var(--spacing-md)",
                background: "#111827",
                color: "#fff",
                border: "1px solid #111827",
                borderRadius: "var(--radius-md)",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              🛠️ Админ панель
            </button>
          )}
          <button
            onClick={loadShipments}
            disabled={loading}
            style={{
              padding: "var(--spacing-sm) var(--spacing-md)",
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: "var(--radius-md)",
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Загрузка..." : "🔄 Обновить"}
          </button>
        </div>
      </div>

      {loading && shipments.length === 0 ? (
        <div style={{ fontSize: 14, color: "#666", textAlign: "center", padding: "var(--spacing-xl)" }}>
          Загрузка...
        </div>
      ) : shipments.length === 0 ? (
        <div
          style={{
            background: "#f9f9f9",
            border: "1px solid #ddd",
            borderRadius: "var(--radius-md)",
            padding: "var(--spacing-xl)",
            textAlign: "center",
            color: "#666",
          }}
        >
          Нет заказов в доставке
        </div>
      ) : (
        <div style={{ display: "grid", gap: "var(--spacing-md)" }}>
          {shipments.map((shipment) => (
            <div
              key={shipment.id}
              style={{
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-md)",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--spacing-md)" }}>
                {/* Заказ */}
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Заказ</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    📦 {shipment.unit?.barcode || "—"}
                  </div>
                </div>

                {/* Курьер */}
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Курьер</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    🚗 {shipment.courier_name}
                  </div>
                </div>

                {/* Отправлено */}
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Отправлено</div>
                  <div style={{ fontSize: 14 }}>
                    🕒 {formatDate(shipment.out_at)}
                  </div>
                  {shipment.out_by_profile && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      {shipment.out_by_profile.full_name} ({shipment.out_by_profile.role})
                    </div>
                  )}
                </div>
              </div>

              {/* Статус */}
              <div style={{ marginTop: "var(--spacing-md)", paddingTop: "var(--spacing-md)", borderTop: "1px solid #eee" }}>
                <div
                  style={{
                    display: "inline-block",
                    padding: "6px 12px",
                    background: "#dcfce7",
                    color: "#166534",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  ✓ В ДОСТАВКЕ
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
