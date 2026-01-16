"use client";

import { useEffect, useState } from "react";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  created_at: string;
};

export default function ShippingPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    // Загружаем units со статусом shipped (финальный статус)
    const r = await fetch(`/api/units/list?status=shipped`, { cache: "no-store" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? "Ошибка загрузки");
      return;
    }
    const j = await r.json();
    setUnits(j.units ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Отгрузка</h2>
        <button onClick={load} style={{ marginLeft: "auto" }}>
          Обновить
        </button>
      </div>

      {err && <div style={{ color: "crimson" }}>{err}</div>}

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Заказы в отгрузке (финальный статус)</div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Штрихкод</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Создан</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{u.barcode}</td>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
                  {new Date(u.created_at).toLocaleString()}
                </td>
                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
                  <span style={{ color: "#666", fontStyle: "italic" }}>Отгрузка финальная</span>
                </td>
              </tr>
            ))}

            {units.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 8, color: "#666" }}>
                  Нет заказов в отгрузке
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}