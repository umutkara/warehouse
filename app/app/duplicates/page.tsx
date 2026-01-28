"use client";

import { useEffect, useMemo, useState } from "react";

type DuplicateUnit = {
  id: string;
  barcode: string;
  status: string | null;
  cell_code: string | null;
  cell_type: string | null;
};

type DuplicateGroup = {
  key: string;
  units: DuplicateUnit[];
};

export const dynamic = "force-dynamic";

export default function DuplicatesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [totalUnits, setTotalUnits] = useState<number>(0);

  useEffect(() => {
    async function loadDuplicates() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/units/duplicates", { cache: "no-store" });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          setError(json.error || "Ошибка загрузки");
          return;
        }

        setGroups(Array.isArray(json.duplicates) ? json.duplicates : []);
        setTotalUnits(typeof json.total_units === "number" ? json.total_units : 0);
      } catch (e: any) {
        setError(e.message || "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    loadDuplicates();
  }, []);

  const totalDuplicates = useMemo(() => {
    return groups.reduce((sum, group) => sum + group.units.length, 0);
  }, [groups]);

  if (loading) {
    return <div style={{ padding: 24 }}>Загрузка...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Дубли по 11 цифрам</h1>
      <div style={{ color: "#6b7280", marginBottom: 16 }}>
        Всего units на складе: {totalUnits} • Найдено дублей: {groups.length} • Всего записей в дублях: {totalDuplicates}
      </div>

      {error && (
        <div style={{ color: "crimson", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!error && groups.length === 0 && (
        <div style={{ color: "#6b7280" }}>Дубли не найдены.</div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {groups.map((group) => (
          <div key={group.key} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>
              Подпись: <span style={{ fontFamily: "monospace" }}>{group.key}</span> • {group.units.length} шт.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {group.units.map((unit) => (
                <div
                  key={unit.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(140px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr)",
                    gap: 12,
                    background: "#f9fafb",
                    padding: "8px 10px",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontFamily: "monospace" }}>{unit.barcode}</div>
                  <div>{unit.cell_code || "—"}</div>
                  <div>{unit.cell_type || "—"}</div>
                  <div>{unit.status || "—"}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
