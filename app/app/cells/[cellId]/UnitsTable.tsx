"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  created_at: string;
};

export default function UnitsTable({ units }: { units: Unit[] }) {
  const router = useRouter();

  if (units.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#666" }}>
        Ячейка пуста
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Штрихкод</th>
          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Статус</th>
          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Создан</th>
          <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 8 }}>Действие</th>
        </tr>
      </thead>
      <tbody>
        {units.map((unit) => (
          <tr
            key={unit.id}
            onClick={() => router.push(`/app/units/${unit.id}`)}
            style={{ cursor: "pointer" }}
          >
            <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{unit.barcode}</td>
            <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{unit.status}</td>
            <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
              {new Date(unit.created_at).toLocaleString()}
            </td>
            <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
              <Link
                href={`/app/units/${unit.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "inline-block",
                  padding: "6px 12px",
                  background: "#0066cc",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                Открыть
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
