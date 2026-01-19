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
  created_at: string;
  cell_code?: string;
  meta?: any;
};

export default function StoredStatusPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadUnits();
  }, []);

  async function loadUnits() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/units/list?status=stored", { cache: "no-store" });

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
  }

  const filteredUnits = units.filter((unit) =>
    unit.barcode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          📦 Storage - Одобренные к возврату мерчанту
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
          Клиент одобрил возврат средств. Заказы готовы к отправке мерчанту. Ожидают создания задания OPS для перемещения в picking (ворота).
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
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Всего в Storage</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#10b981" }}>{filteredUnits.length}</div>
        </div>
      </div>

      {/* Units Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Загрузка...</div>
      ) : error ? (
        <div style={{ padding: 20, background: "#fef2f2", color: "#dc2626", borderRadius: 8 }}>{error}</div>
      ) : filteredUnits.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 12, border: "1px dashed #e5e7eb" }}>
          {searchQuery ? "Заказы не найдены" : "Нет заказов в Storage"}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ padding: 16, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Штрихкод</th>
                <th style={{ padding: 16, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Товар</th>
                <th style={{ padding: 16, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Ячейка</th>
                <th style={{ padding: 16, textAlign: "right", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Цена</th>
                <th style={{ padding: 16, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Размещен</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnits.map((unit) => (
                <tr
                  key={unit.id}
                  onClick={() => router.push(`/app/units/${unit.id}`)}
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
                  <td style={{ padding: 16, fontFamily: "monospace", fontSize: 13, color: "#059669" }}>
                    {unit.cell_code || "—"}
                  </td>
                  <td style={{ padding: 16, textAlign: "right", fontWeight: 600 }}>
                    {unit.price ? `${unit.price}₽` : "—"}
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
    </div>
  );
}
