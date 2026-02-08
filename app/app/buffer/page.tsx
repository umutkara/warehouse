"use client";

import { useEffect, useMemo, useState } from "react";

type Transfer = {
  id: string;
  unit_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: string;
  created_at: string;
  received_at?: string | null;
  meta?: any;
  unit?: {
    id: string;
    barcode: string;
    status: string;
    cell_id: string | null;
    warehouse_id: string;
    meta?: any;
  } | null;
};

type WarehousesById = Record<string, { id: string; name?: string | null }>;

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByWarehouse(items: Transfer[], key: "from_warehouse_id" | "to_warehouse_id") {
  const map = new Map<string, Transfer[]>();
  for (const t of items) {
    const id = t[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(t);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export default function BufferPage() {
  const [incoming, setIncoming] = useState<Transfer[]>([]);
  const [outgoing, setOutgoing] = useState<Transfer[]>([]);
  const [warehousesById, setWarehousesById] = useState<WarehousesById>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transfers/list", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Ошибка загрузки буфера");
      } else {
        setIncoming(json.incoming || []);
        setOutgoing(json.outgoing || []);
        setWarehousesById(json.warehousesById || {});
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки буфера");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const incomingGroups = useMemo(
    () => groupByWarehouse(incoming, "from_warehouse_id"),
    [incoming]
  );
  const outgoingGroups = useMemo(
    () => groupByWarehouse(outgoing, "to_warehouse_id"),
    [outgoing]
  );

  function warehouseLabel(id: string): string {
    const name = warehousesById[id]?.name;
    return name && name.trim() ? name : `Склад ${id.slice(0, 6)}`;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Буферная зона</h1>
        <button
          onClick={load}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Обновить
        </button>
      </div>

      {loading && <div style={{ marginTop: 16 }}>Загрузка…</div>}
      {error && <div style={{ marginTop: 16, color: "#dc2626" }}>{error}</div>}

      {!loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Входящие</h2>
            {incomingGroups.length === 0 && <div>Нет входящих</div>}
            {incomingGroups.map(([warehouseId, items]) => (
              <div key={warehouseId} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Из: {warehouseLabel(warehouseId)} ({items.length})
                </div>
                <div style={{ border: "1px solid #f1f5f9", borderRadius: 8 }}>
                  {items.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 120px 140px",
                        gap: 8,
                        padding: "8px 12px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.unit?.barcode || "—"}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          Статус: {t.unit?.status || "—"}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {formatDate(t.created_at)}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {t.meta?.scenario ? `Сценарий: ${t.meta.scenario}` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Исходящие</h2>
            {outgoingGroups.length === 0 && <div>Нет исходящих</div>}
            {outgoingGroups.map(([warehouseId, items]) => (
              <div key={warehouseId} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  В: {warehouseLabel(warehouseId)} ({items.length})
                </div>
                <div style={{ border: "1px solid #f1f5f9", borderRadius: 8 }}>
                  {items.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 120px 140px",
                        gap: 8,
                        padding: "8px 12px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.unit?.barcode || "—"}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          Статус: {t.unit?.status || "—"}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {formatDate(t.created_at)}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {t.meta?.scenario ? `Сценарий: ${t.meta.scenario}` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
