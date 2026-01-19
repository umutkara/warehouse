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
  age_hours: number;
};

export default function UnitsListPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");

  useEffect(() => {
    loadUnits();
  }, [ageFilter, statusFilter, searchQuery]);

  async function loadUnits() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ 
        age: ageFilter,
        status: statusFilter,
      });
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

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
    } catch (e: any) {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
  }

  function formatAge(hours: number): string {
    if (hours < 1) return "< 1ч";
    if (hours < 24) return `${hours}ч`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours === 0) return `${days}д`;
    return `${days}д ${remainingHours}ч`;
  }

  function getAgeColor(hours: number): string {
    if (hours > 168) return "#dc2626"; // > 7 days - red
    if (hours > 48) return "#f59e0b"; // > 48h - orange
    if (hours > 24) return "#eab308"; // > 24h - yellow
    return "#10b981"; // < 24h - green
  }

  const statusColors: Record<string, string> = {
    receiving: "#3b82f6",
    storage: "#10b981",
    picking: "#f59e0b",
    shipping: "#ef4444",
    out: "#8b5cf6",
    bin: "#a855f7",
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: "center", padding: 40 }}>Загрузка...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Список заказов</h1>
          <p style={styles.subtitle}>Всего заказов на складе: {units.length}</p>
        </div>

        <button onClick={loadUnits} style={styles.refreshButton}>
          🔄 Обновить
        </button>
      </div>

      {/* Search */}
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

      {/* Status Filter */}
      <div style={styles.filters}>
        <div style={styles.filterLabel}>Статус:</div>
        <div style={styles.filterButtons}>
          <button
            onClick={() => setStatusFilter("all")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "all" ? styles.filterButtonActive : {}),
            }}
          >
            Все
          </button>
          <button
            onClick={() => setStatusFilter("receiving")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "receiving" ? styles.filterButtonActive : {}),
            }}
          >
            Приёмка
          </button>
          <button
            onClick={() => setStatusFilter("storage")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "storage" ? styles.filterButtonActive : {}),
            }}
          >
            Хранение
          </button>
          <button
            onClick={() => setStatusFilter("picking")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "picking" ? styles.filterButtonActive : {}),
            }}
          >
            Пикинг
          </button>
          <button
            onClick={() => setStatusFilter("shipping")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "shipping" ? styles.filterButtonActive : {}),
            }}
          >
            Отгрузка
          </button>
          <button
            onClick={() => setStatusFilter("out")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "out" ? styles.filterButtonActive : {}),
            }}
          >
            OUT
          </button>
          <button
            onClick={() => setStatusFilter("bin")}
            style={{
              ...styles.filterButton,
              ...(statusFilter === "bin" ? styles.filterButtonActive : {}),
            }}
          >
            Bin
          </button>
        </div>
      </div>

      {/* Age Filter */}
      <div style={styles.filters}>
        <div style={styles.filterLabel}>Фильтр по времени:</div>
        <div style={styles.filterButtons}>
          <button
            onClick={() => setAgeFilter("all")}
            style={{
              ...styles.filterButton,
              ...(ageFilter === "all" ? styles.filterButtonActive : {}),
            }}
          >
            Все
          </button>
          <button
            onClick={() => setAgeFilter("24h")}
            style={{
              ...styles.filterButton,
              ...(ageFilter === "24h" ? styles.filterButtonActive : {}),
            }}
          >
            &gt; 24 часов
          </button>
          <button
            onClick={() => setAgeFilter("48h")}
            style={{
              ...styles.filterButton,
              ...(ageFilter === "48h" ? styles.filterButtonActive : {}),
            }}
          >
            &gt; 48 часов
          </button>
          <button
            onClick={() => setAgeFilter("7d")}
            style={{
              ...styles.filterButton,
              ...(ageFilter === "7d" ? styles.filterButtonActive : {}),
            }}
          >
            &gt; 7 дней
          </button>
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
              <th style={styles.th}>Ячейка</th>
              <th style={styles.th}>На складе</th>
              <th style={styles.th}>Создан</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {units.length === 0 && !loading && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                  {searchQuery
                    ? `Не найдено заказов с номером "${searchQuery}"`
                    : "Нет заказов"}
                </td>
              </tr>
            )}
            {units.map((unit) => (
              <tr
                key={unit.id}
                style={styles.tableRow}
                onClick={() => router.push(`/app/units/${unit.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                }}
              >
                <td style={styles.td}>
                  <div style={styles.barcode}>{unit.barcode}</div>
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
  searchContainer: {
    display: "flex",
    gap: 8,
    marginBottom: "var(--spacing-lg)",
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
};
