"use client";

import { useState, useMemo } from "react";

type Hub = {
  id: string;
  name: string;
  address: string;
  orders: DemoOrder[];
};

type DemoOrder = {
  id: string;
  barcode: string;
  acceptance?: string;
  shipping?: string;
  driverFirstName?: string;
  driverLastName?: string;
};

// Демо-данные: хабы и заказы
const MOCK_HUBS: Hub[] = [
  {
    id: "hub-1",
    name: "Хаб Баку Центр",
    address: "ул. Низами 28, Баку",
    orders: [
      { id: "o1", barcode: "001234567890" },
      { id: "o2", barcode: "001234567891" },
      { id: "o3", barcode: "001234567892" },
    ],
  },
  {
    id: "hub-2",
    name: "Хаб Сураханı",
    address: "Район Сураханı, Баку",
    orders: [
      { id: "o4", barcode: "001234567893" },
      { id: "o5", barcode: "001234567894" },
    ],
  },
  {
    id: "hub-3",
    name: "Хаб Сумгаит",
    address: "пр. Гейдара Алиева 15, Сумгаит",
    orders: [
      { id: "o6", barcode: "001234567895" },
      { id: "o7", barcode: "001234567896" },
      { id: "o8", barcode: "001234567897" },
      { id: "o9", barcode: "001234567898" },
    ],
  },
  {
    id: "hub-4",
    name: "Хаб Гянджа",
    address: "ул. Ататюрка 42, Гянджа",
    orders: [
      { id: "o10", barcode: "001234567899" },
      { id: "o11", barcode: "001234567900" },
    ],
  },
];

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  );
}

export default function DemoHubsPage() {
  const [selectedHubId, setSelectedHubId] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [ordersByHub, setOrdersByHub] = useState<Record<string, DemoOrder[]>>(() => {
    const map: Record<string, DemoOrder[]> = {};
    MOCK_HUBS.forEach((h) => {
      map[h.id] = h.orders.map((o) => ({ ...o }));
    });
    return map;
  });

  const filteredHubs = useMemo(() => {
    if (selectedHubId === "all") return MOCK_HUBS;
    return MOCK_HUBS.filter((h) => h.id === selectedHubId);
  }, [selectedHubId]);

  const toggleExpand = (hubId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(hubId)) next.delete(hubId);
      else next.add(hubId);
      return next;
    });
  };

  const updateOrder = (hubId: string, orderId: string, field: keyof DemoOrder, value: string) => {
    setOrdersByHub((prev) => {
      const hubOrders = prev[hubId] ?? [];
      const next = hubOrders.map((o) =>
        o.id === orderId ? { ...o, [field]: value } : o
      );
      return { ...prev, [hubId]: next };
    });
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827" }}>
          Хабы
        </h1>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 20,
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.03em",
          }}
        >
          Демо
        </span>
      </div>

      {/* Filter */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: "16px 20px",
          marginBottom: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#6b7280",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Выборка по хабам
        </label>
        <select
          value={selectedHubId}
          onChange={(e) => setSelectedHubId(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "10px 14px",
            fontSize: 15,
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#fff",
            color: "#111827",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="all">Все хабы</option>
          {MOCK_HUBS.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </div>

      {/* Hub list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filteredHubs.map((hub) => {
          const isExpanded = expandedIds.has(hub.id);
          const orders = ordersByHub[hub.id] ?? hub.orders;

          return (
            <div
              key={hub.id}
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              {/* Hub row (clickable) */}
              <button
                type="button"
                onClick={() => toggleExpand(hub.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  border: "none",
                  background: isExpanded ? "#f8fafc" : "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded) e.currentTarget.style.background = "#fff";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {hub.name.charAt(0)}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "#111827" }}>
                      {hub.name}
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                      {hub.address} · {orders.length} заказов
                    </div>
                  </div>
                </div>
                <ChevronDown open={isExpanded} />
              </button>

              {/* Expanded: orders table */}
              {isExpanded && (
                <div
                  style={{
                    borderTop: "1px solid #e5e7eb",
                    padding: "16px 20px 20px",
                    background: "#fafbfc",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#6b7280",
                      marginBottom: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Заказы
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 14,
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                          <th
                            style={{
                              padding: "10px 12px",
                              textAlign: "left",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Заказ
                          </th>
                          <th
                            style={{
                              padding: "10px 12px",
                              textAlign: "left",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Принятия
                          </th>
                          <th
                            style={{
                              padding: "10px 12px",
                              textAlign: "left",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Отправки
                          </th>
                          <th
                            style={{
                              padding: "10px 12px",
                              textAlign: "left",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Имя водителя
                          </th>
                          <th
                            style={{
                              padding: "10px 12px",
                              textAlign: "left",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Фамилия водителя
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order) => (
                          <tr
                            key={order.id}
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            <td
                              style={{
                                padding: "12px",
                                fontWeight: 500,
                                color: "#111827",
                                fontFamily: "monospace",
                              }}
                            >
                              {order.barcode}
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <input
                                type="text"
                                placeholder="Дата/время"
                                value={order.acceptance ?? ""}
                                onChange={(e) =>
                                  updateOrder(hub.id, order.id, "acceptance", e.target.value)
                                }
                                style={{
                                  width: "100%",
                                  minWidth: 120,
                                  padding: "8px 10px",
                                  fontSize: 14,
                                  border: "1px solid #d1d5db",
                                  borderRadius: 6,
                                  outline: "none",
                                }}
                              />
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <input
                                type="text"
                                placeholder="Дата/время"
                                value={order.shipping ?? ""}
                                onChange={(e) =>
                                  updateOrder(hub.id, order.id, "shipping", e.target.value)
                                }
                                style={{
                                  width: "100%",
                                  minWidth: 120,
                                  padding: "8px 10px",
                                  fontSize: 14,
                                  border: "1px solid #d1d5db",
                                  borderRadius: 6,
                                  outline: "none",
                                }}
                              />
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <input
                                type="text"
                                placeholder="Имя"
                                value={order.driverFirstName ?? ""}
                                onChange={(e) =>
                                  updateOrder(hub.id, order.id, "driverFirstName", e.target.value)
                                }
                                style={{
                                  width: "100%",
                                  minWidth: 100,
                                  padding: "8px 10px",
                                  fontSize: 14,
                                  border: "1px solid #d1d5db",
                                  borderRadius: 6,
                                  outline: "none",
                                }}
                              />
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <input
                                type="text"
                                placeholder="Фамилия"
                                value={order.driverLastName ?? ""}
                                onChange={(e) =>
                                  updateOrder(hub.id, order.id, "driverLastName", e.target.value)
                                }
                                style={{
                                  width: "100%",
                                  minWidth: 100,
                                  padding: "8px 10px",
                                  fontSize: 14,
                                  border: "1px solid #d1d5db",
                                  borderRadius: 6,
                                  outline: "none",
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
