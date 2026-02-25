"use client";

import { useState } from "react";

type Section =
  | "hub_flow"
  | "statuses"
  | "cells"
  | "tasks"
  | "tsd"
  | "tsd_move"
  | "ops"
  | "logistics"
  | "inventory"
  | "meta"
  | "moves"
  | "tickets"
  | "shipments";

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<Section>("statuses");

  const sections = [
    { id: "hub_flow" as Section, title: "🔁 Основной склад ↔ Хаб", icon: "🔁" },
    { id: "statuses" as Section, title: "📦 Статусы заказов", icon: "📦" },
    { id: "cells" as Section, title: "🗄️ Типы ячеек", icon: "🗄️" },
    { id: "tasks" as Section, title: "✅ Статусы задач", icon: "✅" },
    { id: "tsd" as Section, title: "📱 ТСД Отгрузка", icon: "📱" },
    { id: "tsd_move" as Section, title: "🔄 ТСД Перемещение", icon: "🔄" },
    { id: "inventory" as Section, title: "📋 Инвентаризация", icon: "📋" },
    { id: "ops" as Section, title: "👔 Инструкции для OPS", icon: "👔" },
    { id: "logistics" as Section, title: "🚛 Инструкции для логистов", icon: "🚛" },
    { id: "meta" as Section, title: "🔧 units.meta", icon: "🔧" },
    { id: "moves" as Section, title: "🔄 unit_moves", icon: "🔄" },
    { id: "tickets" as Section, title: "🎫 Тикеты", icon: "🎫" },
    { id: "shipments" as Section, title: "🚚 Отправки", icon: "🚚" },
  ];

  return (
    <div style={{ display: "flex", height: "100%", background: "#f9fafb" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 280,
          background: "#fff",
          borderRight: "1px solid #e5e7eb",
          padding: "24px 16px",
          overflowY: "auto",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: "#111827" }}>
          📖 Справочник системы
        </h1>
        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                border: "none",
                background: activeSection === section.id ? "#eff6ff" : "transparent",
                color: activeSection === section.id ? "#2563eb" : "#374151",
                fontSize: 14,
                fontWeight: activeSection === section.id ? 600 : 500,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (activeSection !== section.id) {
                  e.currentTarget.style.background = "#f3f4f6";
                }
              }}
              onMouseLeave={(e) => {
                if (activeSection !== section.id) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {section.title}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, padding: 32, overflowY: "auto" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {activeSection === "hub_flow" && <HubFlowSection />}
          {activeSection === "statuses" && <StatusesSection />}
          {activeSection === "cells" && <CellsSection />}
          {activeSection === "tasks" && <TasksSection />}
          {activeSection === "tsd" && <TsdSection />}
          {activeSection === "tsd_move" && <TsdMoveSection />}
          {activeSection === "inventory" && <InventorySection />}
          {activeSection === "ops" && <OpsSection />}
          {activeSection === "logistics" && <LogisticsSection />}
          {activeSection === "meta" && <MetaSection />}
          {activeSection === "moves" && <MovesSection />}
          {activeSection === "tickets" && <TicketsSection />}
          {activeSection === "shipments" && <ShipmentsSection />}
        </div>
      </main>
    </div>
  );
}

function StatusesSection() {
  const statuses = [
    { 
      name: "bin", 
      color: "#f59e0b", 
      icon: "📥",
      desc: "Заказ принят от курьера",
      detail: "Курьер сдал товар (новый заказ или возврат), складчик принял в BIN ячейку. Ожидает решения: отправить мерчанту или на диагностику."
    },
    { 
      name: "rejected", 
      color: "#ef4444", 
      icon: "🛑",
      desc: "Отложен/отклонён на складе",
      detail: "Заказ принят в REJECTED-ячейку. Не участвует в стандартном размещении и требует отдельного решения."
    },
    { 
      name: "stored", 
      color: "#10b981", 
      icon: "📦",
      desc: "Одобрен к возврату мерчанту",
      detail: "Клиент одобрил возврат средств. Заказ размещен в storage, готов к отправке мерчанту. Ожидает создания задания OPS."
    },
    { 
      name: "shipping", 
      color: "#8b5cf6", 
      icon: "🔬",
      desc: "Отправлен на диагностику",
      detail: "Клиент заказал диагностику. Заказ размещен в shipping, готов к отправке в сервисный центр. Ожидает создания задания OPS."
    },
    { 
      name: "picking", 
      color: "#dc2626", 
      icon: "🚪",
      desc: "В воротах (Gate) - обработка логистами",
      detail: "OPS создал задание → заказ попал в picking (ворота). Логисты обрабатывают и готовят к отправке в OUT."
    },
    { 
      name: "out", 
      color: "#6b7280", 
      icon: "🚚",
      desc: "Отправлен со склада (в доставке)",
      detail: "Заказ покинул склад. Либо доставлен успешно, либо вернется обратно (мерчант не принял / из сервиса) → снова bin."
    },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>📦 Статусы заказов (unit_status)</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Статус заказа автоматически меняется в зависимости от типа ячейки, в которой находится заказ. 
        Это основа системы возвратного потока.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        {statuses.map((status) => (
          <div
            key={status.name}
            style={{
              background: "#fff",
              border: "2px solid #e5e7eb",
              borderRadius: 12,
              padding: 20,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 32 }}>{status.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "6px 12px",
                      background: status.color,
                      color: "#fff",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "monospace",
                    }}
                  >
                    {status.name}
                  </div>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: status.color,
                      opacity: 0.3,
                    }}
                  />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
                  {status.desc}
                </div>
                <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.6 }}>{status.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          padding: 20,
          background: "#fffbeb",
          border: "2px solid #fbbf24",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 12 }}>
          💡 Ключевое правило:
        </div>
        <div style={{ fontSize: 14, color: "#78350f", lineHeight: 1.8, marginBottom: 12 }}>
          <strong>Статус = Тип ячейки</strong>
        </div>
        <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
          Когда заказ перемещается в ячейку, его статус автоматически становится равным типу этой ячейки:
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>Ячейка типа "bin" → статус "bin"</li>
            <li>Ячейка типа "rejected" → статус "rejected"</li>
            <li>Ячейка типа "storage" → статус "stored"</li>
            <li>Ячейка типа "shipping" → статус "shipping"</li>
            <li>Ячейка типа "picking" → статус "picking"</li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: 16, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#111827" }}>🔄 Типичные маршруты:</h3>
        
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#374151", lineHeight: 2 }}>
            <strong style={{ color: "#f59e0b" }}>📥 Новый заказ:</strong>
            <div style={{ marginLeft: 20, marginTop: 4 }}>
              Курьер привез → bin (приемка) → [принимается решение]
            </div>
          </div>

          <div style={{ fontSize: 13, color: "#374151", lineHeight: 2 }}>
            <strong style={{ color: "#10b981" }}>✅ Возврат мерчанту:</strong>
            <div style={{ marginLeft: 20, marginTop: 4 }}>
              bin → stored → picking → out
            </div>
          </div>
          
          <div style={{ fontSize: 13, color: "#374151", lineHeight: 2 }}>
            <strong style={{ color: "#8b5cf6" }}>🔬 На диагностику:</strong>
            <div style={{ marginLeft: 20, marginTop: 4 }}>
              bin → shipping → picking → out
            </div>
          </div>
          
          <div style={{ fontSize: 13, color: "#374151", lineHeight: 2 }}>
            <strong style={{ color: "#dc2626" }}>🔁 Мерчант не принял (возврат):</strong>
            <div style={{ marginLeft: 20, marginTop: 4 }}>
              out → bin (возврат от курьера) → stored → picking → out (повторная отправка)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HubFlowSection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>🔁 Основной склад ↔ Хаб</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Простая схема: <strong>отправили → попало в буфер → приняли → исчезло из буфера</strong>.
        Буфер — это список передач со статусом <code>in_transit</code>.
      </p>

      {/* Diagram */}
      <div
        style={{
          background: "#fff",
          border: "2px solid #e5e7eb",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Основной склад</div>
            <div style={{ marginTop: 8, color: "#6b7280" }}>OUT → Буфер</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                display: "inline-block",
                padding: "8px 16px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                fontWeight: 700,
              }}
            >
              Буфер (in_transit)
            </div>
            <div style={{ marginTop: 8, color: "#6b7280" }}>Входящие / Исходящие</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Хаб</div>
            <div style={{ marginTop: 8, color: "#6b7280" }}>Приняли (BIN)</div>
          </div>
        </div>

        <div style={{ marginTop: 16, textAlign: "center", color: "#2563eb", fontWeight: 600 }}>
          Основной склад → Буфер → Хаб
        </div>
        <div style={{ marginTop: 8, textAlign: "center", color: "#2563eb", fontWeight: 600 }}>
          Хаб → Буфер → Основной склад
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Основной склад → Хаб</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: "#374151" }}>
            <li>Логист назначает курьера, заказ уходит в <strong>OUT</strong>.</li>
            <li>Система создаёт передачу <strong>transfer</strong> в буфере хаба.</li>
            <li>Хаб принимает заказ через приёмку (BIN).</li>
            <li>Передача закрывается, заказ исчезает из буфера.</li>
          </ol>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Хаб → Основной склад</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: "#374151" }}>
            <li>Хаб отправляет заказ через TSD «Отправка (Хаб)» из BIN.</li>
            <li>Система создаёт передачу <strong>transfer</strong> на основной склад.</li>
            <li>Основной склад принимает заказ через приёмку (BIN).</li>
            <li>Передача закрывается, заказ исчезает из буфера.</li>
          </ol>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 12,
          background: "#f8fafc",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          color: "#6b7280",
          fontSize: 13,
        }}
      >
        Буфер показывает только передачи <strong>in_transit</strong>. Как только приёмка прошла — запись
        закрывается и исчезает.
      </div>
    </div>
  );
}

function CellsSection() {
  const cellTypes = [
    { name: "bin", color: "#f59e0b", desc: "Зона приёмки от курьеров", icon: "📥", detail: "Курьеры сдают товар (новые заказы или возвраты), складчики принимают в эту ячейку" },
    { name: "rejected", color: "#ef4444", desc: "Отклонённые/отложенные", icon: "🛑", detail: "Заказы, которые временно не идут в стандартный поток (например, требуется разбор)" },
    { name: "storage", color: "#10b981", desc: "Одобренные возвраты для мерчанта", icon: "📦", detail: "Клиент одобрил возврат средств, заказ готов к отправке мерчанту (из bin)" },
    { name: "shipping", color: "#8b5cf6", desc: "Заказы на диагностику", icon: "🔬", detail: "Клиент отправил на диагностику, размещаются сюда (из bin)" },
    { name: "picking", color: "#dc2626", desc: "Ворота (Gate) для отправки", icon: "🚪", detail: "OPS создал задание → логисты обрабатывают → отправляют в OUT" },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>🗄️ Типы ячеек (cell_type)</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Система возвратного потока. Каждая ячейка имеет своё назначение в процессе обработки возвратов от курьеров до отправки.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        {cellTypes.map((type) => (
          <div
            key={type.name}
            style={{
              background: "#fff",
              border: "2px solid #e5e7eb",
              borderRadius: 12,
              padding: 24,
              display: "flex",
              gap: 20,
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: 48 }}>{type.icon}</div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: type.color,
                  marginBottom: 8,
                  fontFamily: "monospace",
                }}
              >
                {type.name}
              </div>
              <div style={{ fontSize: 14, color: "#111827", fontWeight: 600, marginBottom: 6 }}>
                {type.desc}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
                {type.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#111827" }}>📍 Маршруты заказов:</h3>
        
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <div style={{ padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fbbf24" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
              📥 Новый заказ от курьера:
            </div>
            <div style={{ fontSize: 13, color: "#78350f", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "4px 8px", background: "#fef3c7", borderRadius: 4, fontWeight: 600 }}>Курьер привез</span>
              <span>→</span>
              <span style={{ padding: "4px 8px", background: "#fef3c7", borderRadius: 4, fontWeight: 600 }}>bin (приемка)</span>
              <span>→</span>
              <span style={{ fontSize: 12, color: "#78350f" }}>принимается решение</span>
            </div>
          </div>

          <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
              ✅ Возврат мерчанту (одобрен клиентом):
            </div>
            <div style={{ fontSize: 13, color: "#14532d", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "4px 8px", background: "#dcfce7", borderRadius: 4, fontWeight: 600 }}>bin</span>
              <span>→</span>
              <span style={{ padding: "4px 8px", background: "#dcfce7", borderRadius: 4, fontWeight: 600 }}>storage</span>
              <span>→</span>
              <span style={{ padding: "4px 8px", background: "#dcfce7", borderRadius: 4, fontWeight: 600 }}>picking (gate)</span>
              <span>→</span>
              <span style={{ padding: "4px 8px", background: "#dcfce7", borderRadius: 4, fontWeight: 600 }}>out</span>
            </div>
          </div>

          <div style={{ padding: 16, background: "#f5f3ff", borderRadius: 8, border: "1px solid #d8b4fe" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#6b21a8", marginBottom: 8 }}>
              🔬 На диагностику (в сервисный центр):
            </div>
            <div style={{ fontSize: 13, color: "#581c87", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "4px 8px", background: "#ede9fe", borderRadius: 4, fontWeight: 600 }}>bin</span>
              <span>→</span>
              <span style={{ padding: "4px 8px", background: "#ede9fe", borderRadius: 4, fontWeight: 600 }}>shipping</span>
              <span>→</span>
              <span style={{ padding: "4px 8px", background: "#ede9fe", borderRadius: 4, fontWeight: 600 }}>picking (gate)</span>
              <span>→</span>
              <span style={{ padding: "4px 8px", background: "#ede9fe", borderRadius: 4, fontWeight: 600 }}>out</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fbbf24" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 4 }}>
            💡 Важно:
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
            <strong>picking</strong> — это ворота (gate). OPS создает задание → заказ попадает в picking → логисты обрабатывают и отправляют в OUT.
            Это финальная точка перед отправкой со склада.
          </div>
        </div>
      </div>
    </div>
  );
}

function TasksSection() {
  const taskStatuses = [
    { name: "open", color: "#3b82f6", desc: "Задача создана, ожидает взятия в работу" },
    { name: "in_progress", color: "#f59e0b", desc: "Задача в процессе выполнения" },
    { name: "done", color: "#10b981", desc: "Задача выполнена" },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>✅ Статусы задач (picking_tasks.status)</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Задачи на отгрузку создаются OPS и выполняются в ТСД (терминал сбора данных). Статус отражает текущее состояние выполнения.
      </p>

      {taskStatuses.map((status) => (
        <div
          key={status.name}
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div
              style={{
                padding: "4px 12px",
                background: status.color,
                color: "#fff",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {status.name}
            </div>
          </div>
          <p style={{ color: "#374151", fontSize: 14 }}>{status.desc}</p>
        </div>
      ))}

      <div style={{ marginTop: 24, background: "#f0f9ff", borderRadius: 12, padding: 20, border: "1px solid #bfdbfe" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#1e40af" }}>Жизненный цикл задачи:</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "#1e3a8a" }}>
          <span style={{ padding: "6px 12px", background: "#dbeafe", borderRadius: 6, fontWeight: 600 }}>open</span>
          <span>→</span>
          <span style={{ padding: "6px 12px", background: "#dbeafe", borderRadius: 6, fontWeight: 600 }}>in_progress</span>
          <span>→</span>
          <span style={{ padding: "6px 12px", background: "#dbeafe", borderRadius: 6, fontWeight: 600 }}>done</span>
        </div>
        <p style={{ marginTop: 12, fontSize: 13, color: "#1e40af" }}>
          1. OPS создает задачу (open) → 2. Работник берет в ТСД (in_progress) → 3. Завершает (done)
        </p>
      </div>

      {/* Новая логика: массовые задания */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#111827" }}>
          📦 Массовые задания (новая логика)
        </h3>
        
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #2563eb", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#2563eb", marginBottom: 12 }}>
            🎯 Ключевое изменение:
          </div>
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <strong>1 задание = 1 picking ячейка + множество заказов (от 1 до ∞)</strong>
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8, lineHeight: 1.6 }}>
            Раньше: 1 задание = 1 заказ (создавались десятки заданий)<br/>
            Теперь: 1 задание = все заказы для одной picking ячейки (эффективнее)
          </div>
        </div>

        {/* Структура базы данных */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb", marginBottom: 16 }}>
          <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🗄️ Структура в базе данных:</h4>
          
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#2563eb" }}>
              picking_tasks (основная таблица заданий)
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#f9fafb", borderRadius: 8, overflow: "hidden" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>target_picking_cell_id</td>
                  <td style={{ padding: 12 }}>UUID целевой picking ячейки</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>scenario</td>
                  <td style={{ padding: 12 }}>Сценарий: "Склад → Мерчант WB"</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>created_by_name</td>
                  <td style={{ padding: 12 }}>Имя создателя (OPS)</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>picked_by</td>
                  <td style={{ padding: 12 }}>Кто взял в работу (складчик)</td>
                </tr>
                <tr>
                  <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>picked_at</td>
                  <td style={{ padding: 12 }}>Когда взято в работу</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#10b981" }}>
              picking_task_units (связь заданий с заказами)
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#f9fafb", borderRadius: 8, overflow: "hidden" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: 12, fontFamily: "monospace", color: "#10b981" }}>picking_task_id</td>
                  <td style={{ padding: 12 }}>ID задания</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: 12, fontFamily: "monospace", color: "#10b981" }}>unit_id</td>
                  <td style={{ padding: 12 }}>ID заказа</td>
                </tr>
                <tr>
                  <td style={{ padding: 12, fontFamily: "monospace", color: "#10b981" }}>from_cell_id</td>
                  <td style={{ padding: 12 }}>Откуда брали (snapshot)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Жизненный цикл с новой логикой */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb", marginBottom: 16 }}>
          <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🔄 Жизненный цикл (новая логика):</h4>
          
          <div style={{ display: "grid", gap: 16 }}>
            {/* Шаг 1 */}
            <div style={{ padding: 16, background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>
                1️⃣ OPS создает задание [status: open]
              </div>
              <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.6 }}>
                • Выбирает N заказов (1-100)<br/>
                • Выбирает picking ячейку (PICK-01)<br/>
                • Пишет сценарий: "Склад → Мерчант WB"<br/>
                • Создается ОДНО задание с N заказами
              </div>
            </div>

            {/* Шаг 2 */}
            <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8, border: "1px solid #fbbf24" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
                2️⃣ Складчик сканирует FROM ячейку [status: in_progress]
              </div>
              <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
                • Выбирает задание в ТСД<br/>
                • Сканирует FROM ячейку (STOR-12)<br/>
                • ⚡ <strong>Задание автоматически берется в работу!</strong><br/>
                • 🔒 Блокируется для других пользователей<br/>
                • picked_by = user_id, picked_at = now()
              </div>
            </div>

            {/* Шаг 3 */}
            <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
                3️⃣ Складчик сканирует заказы (от 1 до N)
              </div>
              <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6 }}>
                • Сканирует заказы один за другим<br/>
                • Может отсканировать все или часть<br/>
                • Система показывает прогресс: 3/10
              </div>
            </div>

            {/* Шаг 4 */}
            <div style={{ padding: 16, background: "#dcfce7", borderRadius: 8, border: "1px solid #86efac" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
                4️⃣ Складчик сканирует TO ячейку [status: done]
              </div>
              <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6 }}>
                • Сканирует picking ячейку из задания<br/>
                • Все отсканированные заказы перемещаются массово<br/>
                • completed_by = user_id, completed_at = now()<br/>
                • Задание завершено ✅
              </div>
            </div>
          </div>
        </div>

        {/* Важные моменты */}
        <div style={{ background: "#fffbeb", borderRadius: 12, padding: 20, border: "2px solid #fbbf24" }}>
          <h4 style={{ fontSize: 16, fontWeight: 700, color: "#92400e", marginBottom: 12 }}>
            ⚠️ Важные особенности:
          </h4>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 2 }}>
            <div>✅ <strong>Взятие в работу при скане FROM</strong> - задача блокируется сразу</div>
            <div>✅ <strong>Несколько заданий на одну ячейку</strong> - OPS может создавать без конфликтов</div>
            <div>✅ <strong>Массовое перемещение</strong> - все заказы движутся одним действием</div>
            <div>✅ <strong>Частичное выполнение</strong> - можно отсканировать не все заказы</div>
            <div>❌ <strong>Заказы НЕ добавляются</strong> к существующим заданиям - всегда создается новое</div>
          </div>
        </div>

        {/* Пример */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb", marginTop: 16 }}>
          <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📖 Пример работы:</h4>
          
          <div style={{ fontFamily: "monospace", fontSize: 12, background: "#f9fafb", padding: 16, borderRadius: 8, lineHeight: 1.8 }}>
            <div style={{ color: "#2563eb", marginBottom: 8 }}>10:00 - OPS создал:</div>
            <div style={{ paddingLeft: 20, marginBottom: 12 }}>
              Задание 1: 5 заказов → PICK-01 [open]
            </div>

            <div style={{ color: "#f59e0b", marginBottom: 8 }}>10:05 - Иван сканировал FROM:</div>
            <div style={{ paddingLeft: 20, marginBottom: 12 }}>
              Задание 1 → [in_progress] 🔒
            </div>

            <div style={{ color: "#2563eb", marginBottom: 8 }}>10:10 - OPS создал еще:</div>
            <div style={{ paddingLeft: 20, marginBottom: 12 }}>
              Задание 2: 3 заказа → PICK-01 [open]<br/>
              ✅ Та же ячейка, но нет конфликта!
            </div>

            <div style={{ color: "#10b981", marginBottom: 8 }}>10:15 - Иван завершил:</div>
            <div style={{ paddingLeft: 20, marginBottom: 12 }}>
              Задание 1 → [done] ✅<br/>
              5 заказов перемещены в PICK-01
            </div>

            <div style={{ color: "#10b981" }}>10:20 - Петр видит:</div>
            <div style={{ paddingLeft: 20 }}>
              Только Задание 2 [open]<br/>
              (Задание 1 завершено)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TsdSection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>📱 ТСД Отгрузка (Shipping Tasks)</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Режим работы терминала сбора данных для выполнения заданий на отгрузку. 
        Складчик сканирует ячейки и заказы, перемещая их из storage/shipping в picking.
      </p>

      {/* Процесс работы */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #2563eb", marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#2563eb" }}>
          🔄 Процесс работы (4 шага)
        </h3>

        {/* Шаг 1 */}
        <div style={{ marginBottom: 16, padding: 16, background: "#f0f9ff", borderRadius: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>
            Шаг 1: Выбрать задание
          </div>
          <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.6 }}>
            Складчик видит список доступных заданий:<br/>
            • 📦 Количество заказов<br/>
            • 👤 Кто создал (имя OPS)<br/>
            • 🎯 Сценарий отправки<br/>
            • → Picking ячейка назначения
          </div>
        </div>

        {/* Шаг 2 */}
        <div style={{ marginBottom: 16, padding: 16, background: "#fffbeb", borderRadius: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            Шаг 2: Сканировать FROM ячейку ⚡
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
            Сканирует любую storage/shipping ячейку (откуда берет заказы).<br/>
            <strong style={{ color: "#dc2626" }}>ВАЖНО: Задача автоматически берется в работу!</strong><br/>
            • Status → in_progress<br/>
            • Блокируется для других пользователей<br/>
            • OPS может создавать новые задания на ту же ячейку без конфликта
          </div>
        </div>

        {/* Шаг 3 */}
        <div style={{ marginBottom: 16, padding: 16, background: "#f0fdf4", borderRadius: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
            Шаг 3: Сканировать заказы (от 1 до N)
          </div>
          <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6 }}>
            Сканирует штрихкоды заказов один за другим:<br/>
            • Только заказы из текущего задания принимаются<br/>
            • Проверка на дубликаты<br/>
            • Показывает прогресс: "3/10 отсканировано"<br/>
            • Можно отсканировать не все (частичное выполнение)
          </div>
        </div>

        {/* Шаг 4 */}
        <div style={{ padding: 16, background: "#dcfce7", borderRadius: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
            Шаг 4: Сканировать TO ячейку
          </div>
          <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6 }}>
            Сканирует picking ячейку из задания:<br/>
            • Должна совпадать с target_picking_cell_id<br/>
            • Все отсканированные заказы перемещаются автоматически<br/>
            • Каждый заказ: API вызов /api/units/move-by-scan<br/>
            • Задание завершается → status: done
          </div>
        </div>
      </div>

      {/* Ограничения */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🚫 Ограничения и проверки:</h3>
        
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, padding: 12, background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
            <strong style={{ color: "#991b1b" }}>FROM ячейка:</strong>
            <div style={{ color: "#7f1d1d", marginTop: 4 }}>
              Должна быть типа storage или shipping. Нельзя брать из bin или picking.
            </div>
          </div>

          <div style={{ fontSize: 13, padding: 12, background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
            <strong style={{ color: "#991b1b" }}>Заказы:</strong>
            <div style={{ color: "#7f1d1d", marginTop: 4 }}>
              Только заказы из текущего задания. Чужие заказы отклоняются с ошибкой.
            </div>
          </div>

          <div style={{ fontSize: 13, padding: 12, background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
            <strong style={{ color: "#991b1b" }}>TO ячейка:</strong>
            <div style={{ color: "#7f1d1d", marginTop: 4 }}>
              Должна быть picking типа и совпадать с target_picking_cell_id из задания.
            </div>
          </div>

          <div style={{ fontSize: 13, padding: 12, background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
            <strong style={{ color: "#991b1b" }}>Инвентаризация:</strong>
            <div style={{ color: "#7f1d1d", marginTop: 4 }}>
              Если активна инвентаризация - все перемещения блокируются (HTTP 423).
            </div>
          </div>
        </div>
      </div>

      {/* Визуальная схема */}
      <div style={{ background: "#f9fafb", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📊 Визуальная схема:</h3>
        
        <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center", flexWrap: "wrap", padding: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#10b981" }}>STOR-12</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>storage</div>
          </div>
          
          <div style={{ fontSize: 20, color: "#2563eb" }}>→</div>
          
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#2563eb" }}>ТСД</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Сканирование</div>
          </div>
          
          <div style={{ fontSize: 20, color: "#2563eb" }}>→</div>
          
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚪</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>PICK-01</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>picking (gate)</div>
          </div>
          
          <div style={{ fontSize: 20, color: "#2563eb" }}>→</div>
          
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚚</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>OUT</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Отгрузка</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TsdMoveSection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>🔄 ТСД Перемещение</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Режим работы терминала сбора данных для перемещения заказов между ячейками склада. 
        Складчик может перемещать заказы из BIN в STORAGE/SHIPPING, между STORAGE и SHIPPING, а также возвращать заказы из PICKING в BIN (возврат в приёмку; задание OPS при этом остаётся активным).
      </p>

      {/* Процесс работы */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #10b981", marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#10b981" }}>
          🔄 Процесс работы (3 шага)
        </h3>

        {/* Шаг 1 */}
        <div style={{ marginBottom: 16, padding: 16, background: "#f0fdf4", borderRadius: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
            Шаг 1: Сканировать FROM ячейку (откуда)
          </div>
          <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6 }}>
            Складчик сканирует ячейку, из которой будет брать заказы:<br/>
            <strong>✅ Разрешенные типы:</strong> BIN, STORAGE, SHIPPING, PICKING (для возврата в BIN)<br/>
            <strong>❌ Запрещенные:</strong> RECEIVING<br/><br/>
            <strong style={{ color: "#dc2626" }}>Важно для BIN:</strong> Если выбрана ячейка типа BIN (например, B1), то можно сканировать только заказы, которые находятся именно в этой ячейке B1, а не в других BIN ячейках!
          </div>
        </div>

        {/* Шаг 2 */}
        <div style={{ marginBottom: 16, padding: 16, background: "#fffbeb", borderRadius: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            Шаг 2: Сканировать заказы (от 1 до бесконечности)
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
            Сканирует штрихкоды заказов один за другим:<br/><br/>
            
            <strong>📦 Проверки в режиме ОНЛАЙН:</strong><br/>
            
            <strong>1️⃣ Заказ существует в системе</strong><br/>
            • Если заказ не найден → ❌ ОШИБКА<br/><br/>
            
            <strong>2️⃣ Проверка для BIN ячеек (особая логика):</strong><br/>
            • Заказ должен быть в конкретной FROM ячейке (например, в B1)<br/>
            • Если заказ в другой BIN (B2, B3) → ❌ ОШИБКА<br/>
            • Если заказ в STORAGE/SHIPPING/PICKING → ❌ ОШИБКА<br/>
            • ✅ Можно брать только заказы из выбранной BIN ячейки<br/><br/>
            <strong>2️⃣ Для PICKING (возврат в приёмку):</strong><br/>
            • FROM = picking ячейка, TO = BIN. Заказ вернётся в приёмку; задание OPS остаётся активным.<br/><br/>
            
            <strong>3️⃣ Проверка на дубликат:</strong><br/>
            • Если заказ уже отсканирован → ❌ ОШИБКА: "дубликат"<br/><br/>
            
            <strong>4️⃣ Для STORAGE/SHIPPING:</strong><br/>
            • Только базовые проверки (существование, дубликаты)<br/>
            • Без проверки конкретной ячейки
          </div>
        </div>

        {/* Шаг 3 */}
        <div style={{ padding: 16, background: "#dcfce7", borderRadius: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
            Шаг 3: Сканировать TO ячейку (куда)
          </div>
          <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6 }}>
            Сканирует ячейку назначения:<br/>
            • Проверяется матрица разрешенных перемещений (см. ниже)<br/>
            • Если перемещение разрешено → все отсканированные заказы автоматически перемещаются<br/>
            • Каждый заказ: API вызов /api/units/move-by-scan<br/>
            • После успешного перемещения список очищается → готов к новому перемещению
          </div>
        </div>
      </div>

      {/* Матрица разрешенных перемещений */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #2563eb", marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#2563eb" }}>
          📊 Матрица разрешенных перемещений
        </h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                <th style={{ padding: 12, textAlign: "left", border: "1px solid #e5e7eb", fontWeight: 700 }}>FROM ↓ / TO →</th>
                <th style={{ padding: 12, textAlign: "center", border: "1px solid #e5e7eb", fontWeight: 700 }}>BIN</th>
                <th style={{ padding: 12, textAlign: "center", border: "1px solid #e5e7eb", fontWeight: 700 }}>STORAGE</th>
                <th style={{ padding: 12, textAlign: "center", border: "1px solid #e5e7eb", fontWeight: 700 }}>SHIPPING</th>
                <th style={{ padding: 12, textAlign: "center", border: "1px solid #e5e7eb", fontWeight: 700 }}>PICKING</th>
                <th style={{ padding: 12, textAlign: "center", border: "1px solid #e5e7eb", fontWeight: 700 }}>RECEIVING</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", fontWeight: 600 }}>BIN</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#d1fae5", color: "#065f46" }}>✅</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#d1fae5", color: "#065f46" }}>✅</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
              </tr>
              <tr>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", fontWeight: 600 }}>STORAGE</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#dbeafe", color: "#1e40af" }}>✅</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#d1fae5", color: "#065f46" }}>✅</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
              </tr>
              <tr>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", fontWeight: 600 }}>SHIPPING</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#d1fae5", color: "#065f46" }}>✅</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#dbeafe", color: "#1e40af" }}>✅</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
              </tr>
              <tr>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", fontWeight: 600 }}>PICKING</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#d1fae5", color: "#065f46" }}>✅<br/><span style={{ fontSize: 11 }}>возврат в приёмку</span></td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
              </tr>
              <tr>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", fontWeight: 600 }}>RECEIVING</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
                <td style={{ padding: 12, border: "1px solid #e5e7eb", textAlign: "center", background: "#fee2e2", color: "#991b1b" }}>❌</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, padding: 12, background: "#eff6ff", borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: "#1e40af", lineHeight: 1.6 }}>
            <strong>Легенда:</strong><br/>
            🟢 <strong style={{ color: "#065f46" }}>Зеленый</strong> — Основное направление (в т.ч. PICKING→BIN: возврат в приёмку; задание OPS остаётся активным)<br/>
            🔵 <strong style={{ color: "#1e40af" }}>Синий</strong> — Перемещение внутри типа (STORAGE→STORAGE, SHIPPING→SHIPPING)<br/>
            🔴 <strong style={{ color: "#991b1b" }}>Красный</strong> — Запрещено
          </div>
        </div>
      </div>

      {/* Примеры использования */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📝 Примеры использования:</h3>
        
        <div style={{ display: "grid", gap: 16 }}>
          {/* Пример 1 */}
          <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
              ✅ Пример 1: Перемещение из BIN в STORAGE
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6, fontFamily: "monospace" }}>
              FROM: B1 (bin)<br/>
              Сканирует: ORD-001 (в ячейке B1) → ✅ Добавлен<br/>
              Сканирует: ORD-002 (в ячейке B1) → ✅ Добавлен<br/>
              Сканирует: ORD-999 (в ячейке B2) → ❌ ОШИБКА: не в ячейке B1<br/>
              TO: S5 (storage) → ✅ УСПЕХ: 2 заказа перемещены
            </div>
          </div>

          {/* Пример 2 */}
          <div style={{ padding: 16, background: "#eff6ff", borderRadius: 8, border: "1px solid #93c5fd" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>
              ✅ Пример 2: Перемещение STORAGE → SHIPPING
            </div>
            <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.6, fontFamily: "monospace" }}>
              FROM: S5 (storage)<br/>
              Сканирует: ORD-111 → ✅ Добавлен<br/>
              Сканирует: ORD-222 → ✅ Добавлен<br/>
              TO: SH3 (shipping) → ✅ УСПЕХ: 2 заказа перемещены
            </div>
          </div>

          {/* Пример 3: PICKING → BIN */}
          <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
              ✅ Пример 3: Возврат из PICKING в BIN
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6, fontFamily: "monospace" }}>
              FROM: PICK-01 (picking)<br/>
              Сканирует: ORD-555 → ✅ Добавлен<br/>
              TO: B1 (bin) → ✅ УСПЕХ: заказ возвращён в приёмку (задание OPS остаётся активным)
            </div>
          </div>

          {/* Пример 4: Запрещённое */}
          <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>
              ❌ Пример 4: Запрещенное перемещение
            </div>
            <div style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.6, fontFamily: "monospace" }}>
              FROM: S5 (storage)<br/>
              Сканирует: ORD-333 → ✅ Добавлен<br/>
              TO: B1 (bin) → ❌ ОШИБКА: Из STORAGE можно только в SHIPPING или другую STORAGE
            </div>
          </div>
        </div>
      </div>

      {/* Визуальная схема */}
      <div style={{ background: "#f9fafb", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📊 Визуальная схема потоков:</h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* BIN → STORAGE/SHIPPING */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 12 }}>Из BIN:</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center", padding: 16, background: "#fef3c7", borderRadius: 8, minWidth: 100 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📥</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>BIN</div>
                <div style={{ fontSize: 10, color: "#92400e" }}>B1, B2, B3...</div>
              </div>
              <div style={{ fontSize: 20, color: "#10b981" }}>→</div>
              <div style={{ textAlign: "center", padding: 16, background: "#d1fae5", borderRadius: 8, minWidth: 100 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📦</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>STORAGE</div>
                <div style={{ fontSize: 10, color: "#065f46" }}>S1, S2...</div>
              </div>
              <div style={{ fontSize: 16, color: "#6b7280" }}>или</div>
              <div style={{ textAlign: "center", padding: 16, background: "#dbeafe", borderRadius: 8, minWidth: 100 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>🚢</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>SHIPPING</div>
                <div style={{ fontSize: 10, color: "#1e40af" }}>SH1, SH2...</div>
              </div>
            </div>
          </div>

          {/* STORAGE ↔ SHIPPING */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 12 }}>Между STORAGE и SHIPPING:</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center", padding: 16, background: "#d1fae5", borderRadius: 8, minWidth: 100 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📦</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>STORAGE</div>
              </div>
              <div style={{ fontSize: 20, color: "#2563eb" }}>↔</div>
              <div style={{ textAlign: "center", padding: 16, background: "#dbeafe", borderRadius: 8, minWidth: 100 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>🚢</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>SHIPPING</div>
              </div>
            </div>
          </div>

          {/* Внутри типа */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 12 }}>Внутри одного типа:</div>
            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ textAlign: "center", padding: 12, background: "#d1fae5", borderRadius: 8, minWidth: 80 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>STORAGE-1</div>
                </div>
                <div style={{ fontSize: 16, color: "#2563eb" }}>→</div>
                <div style={{ textAlign: "center", padding: 12, background: "#d1fae5", borderRadius: 8, minWidth: 80 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>STORAGE-2</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ textAlign: "center", padding: 12, background: "#dbeafe", borderRadius: 8, minWidth: 80 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>SHIPPING-1</div>
                </div>
                <div style={{ fontSize: 16, color: "#2563eb" }}>→</div>
                <div style={{ textAlign: "center", padding: 12, background: "#dbeafe", borderRadius: 8, minWidth: 80 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>SHIPPING-2</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventorySection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>📋 Инвентаризация</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Полная инструкция по проведению инвентаризации склада. Автоматические задания, прогресс, отчёты.
      </p>

      {/* Для менеджеров */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #8b5cf6", marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#8b5cf6" }}>
          👨‍💼 Инструкция для менеджеров
        </h3>

        <div style={{ display: "grid", gap: 16 }}>
          {/* Шаг 1 */}
          <div style={{ padding: 16, background: "#f5f3ff", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#6b21a8", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#8b5cf6", color: "#fff", fontSize: 14 }}>1</span>
              Запустить инвентаризацию
            </div>
            <div style={{ fontSize: 13, color: "#581c87", lineHeight: 1.6, marginLeft: 36 }}>
              • Откройте раздел <strong>"Инвентаризация"</strong> в меню<br/>
              • Нажмите кнопку <strong>"Начать инвентаризацию"</strong><br/>
              • Система автоматически создаст задания на все активные ячейки<br/>
              • Все перемещения на складе будут заблокированы до завершения
            </div>
          </div>

          {/* Шаг 2 */}
          <div style={{ padding: 16, background: "#dbeafe", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#2563eb", color: "#fff", fontSize: 14 }}>2</span>
              Отслеживать прогресс
            </div>
            <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.6, marginLeft: 36 }}>
              • Нажмите кнопку <strong>"📊 Посмотреть прогресс"</strong><br/>
              • Увидите список всех ячеек и их статус<br/>
              • <strong>Зелёные ячейки</strong> - уже отсканированы<br/>
              • <strong>Жёлтые ячейки</strong> - ещё не проверены<br/>
              • Страница обновляется автоматически каждые 5 секунд
            </div>
          </div>

          {/* Шаг 3 */}
          <div style={{ padding: 16, background: "#dcfce7", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#10b981", color: "#fff", fontSize: 14 }}>3</span>
              Автоматическое завершение
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6, marginLeft: 36 }}>
              • Когда все ячейки будут отсканированы, инвентаризация <strong>автоматически завершится</strong><br/>
              • Перемещения снова станут доступны<br/>
              • Можно завершить вручную кнопкой <strong>"Завершить инвентаризацию"</strong> (не рекомендуется)
            </div>
          </div>

          {/* Шаг 4 */}
          <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#f59e0b", color: "#fff", fontSize: 14 }}>4</span>
              Скачать отчёт
            </div>
            <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6, marginLeft: 36 }}>
              • Нажмите кнопку <strong>"📥 Скачать отчёт"</strong><br/>
              • Получите CSV файл со всеми данными<br/>
              • Отчёт содержит: какие ячейки проверены, расхождения, недостачи, излишки<br/>
              • Файл автоматически сохраняется на сервере
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fbbf24" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            ⚠️ Важно знать:
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.8 }}>
            • Во время инвентаризации все перемещения заблокированы<br/>
            • Складчики видят только режим "Инвентаризация" в ТСД<br/>
            • Нельзя создавать новые задания на отгрузку<br/>
            • Завершайте инвентаризацию только когда все ячейки проверены
          </div>
        </div>
      </div>

      {/* Для складчиков */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #2563eb", marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#2563eb" }}>
          👷 Инструкция для складчиков (ТСД)
        </h3>

        <div style={{ display: "grid", gap: 16 }}>
          {/* Шаг 1 */}
          <div style={{ padding: 16, background: "#eff6ff", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#2563eb", color: "#fff", fontSize: 14 }}>1</span>
              Открыть режим инвентаризации
            </div>
            <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.6, marginLeft: 36 }}>
              • Откройте ТСД<br/>
              • Выберите режим <strong>"Инвентаризация"</strong><br/>
              • Если инвентаризация не активна - увидите сообщение об ошибке
            </div>
          </div>

          {/* Шаг 2 */}
          <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#f59e0b", color: "#fff", fontSize: 14 }}>2</span>
              Отсканировать ячейку
            </div>
            <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6, marginLeft: 36 }}>
              • Отсканируйте штрихкод ячейки или введите код вручную<br/>
              • Например: <strong>STOR-01</strong>, <strong>BIN-A1</strong><br/>
              • Ячейка отобразится на экране
            </div>
          </div>

          {/* Шаг 3 */}
          <div style={{ padding: 16, background: "#dcfce7", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#10b981", color: "#fff", fontSize: 14 }}>3</span>
              Сканировать все заказы в ячейке
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6, marginLeft: 36 }}>
              • Сканируйте штрихкод каждого заказа в этой ячейке<br/>
              • Список отсканированных заказов появится на экране<br/>
              • Можно сканировать сколько угодно заказов<br/>
              • Если заказа нет в базе - он отметится как "неизвестный"
            </div>
          </div>

          {/* Шаг 4 */}
          <div style={{ padding: 16, background: "#f5f3ff", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#6b21a8", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#8b5cf6", color: "#fff", fontSize: 14 }}>4</span>
              Сохранить результат
            </div>
            <div style={{ fontSize: 13, color: "#581c87", lineHeight: 1.6, marginLeft: 36 }}>
              • Нажмите кнопку <strong>"Сохранить ячейку"</strong><br/>
              • Система покажет расхождения:<br/>
              &nbsp;&nbsp;- <strong style={{ color: "#ef4444" }}>Не найдено</strong> - заказы которые должны быть, но их нет<br/>
              &nbsp;&nbsp;- <strong style={{ color: "#f59e0b" }}>Лишние</strong> - заказы которых не должно быть<br/>
              &nbsp;&nbsp;- <strong style={{ color: "#6b7280" }}>Неизвестные</strong> - заказы которых нет в базе<br/>
              • База данных автоматически обновится<br/>
              • Переходите к следующей ячейке
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fbbf24" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            💡 Полезные кнопки:
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.8 }}>
            • <strong>"Очистить список"</strong> - удалить все отсканированные штрихкоды (до сохранения)<br/>
            • <strong>"Сменить ячейку"</strong> - начать сканировать другую ячейку<br/>
            • <strong>"Сбросить"</strong> - начать всё заново
          </div>
        </div>
      </div>

      {/* Что происходит в системе */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🔧 Что происходит в системе:</h3>
        
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              1. При запуске инвентаризации
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Создаются задания на все активные ячейки со статусом "pending" (ожидание). Все перемещения блокируются.
            </div>
          </div>

          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              2. При сканировании ячейки
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Статус задания меняется на "scanned" (отсканировано). Данные по заказам записываются в базу. База данных синхронизируется с реальностью.
            </div>
          </div>

          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              3. Когда все ячейки отсканированы
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Инвентаризация автоматически завершается. Перемещения разблокируются. Можно скачать полный отчёт.
            </div>
          </div>

          <div style={{ padding: 12, background: "#dcfce7", borderRadius: 6, border: "1px solid #86efac" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 4 }}>
              ✅ Результат
            </div>
            <div style={{ fontSize: 13, color: "#14532d" }}>
              База данных полностью соответствует физическому наличию заказов на складе. Все расхождения зафиксированы в отчёте.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpsSection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>👔 Инструкции для OPS</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Простые пошаговые инструкции для менеджеров OPS. Здесь описано как создавать задания и работать с проблемными заказами.
      </p>

      {/* Создание заданий на отгрузку */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #2563eb", marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#2563eb" }}>
          📝 Как создать задание на отгрузку
        </h3>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
          Задание - это список заказов, которые нужно переместить складчикам из хранения в ворота (picking).
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          {/* Шаг 1 */}
          <div style={{ padding: 16, background: "#eff6ff", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#2563eb", color: "#fff", fontSize: 14 }}>1</span>
              Откройте страницу "Создать задание"
            </div>
            <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.6, marginLeft: 36 }}>
              В меню слева найдите раздел <strong>"Создать задание"</strong> и нажмите на него.
            </div>
          </div>

          {/* Шаг 2 */}
          <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#10b981", color: "#fff", fontSize: 14 }}>2</span>
              Выберите заказы
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6, marginLeft: 36 }}>
              • В списке появятся заказы из ячеек <strong>хранения</strong> и <strong>диагностики</strong><br/>
              • Отметьте галочками те заказы, которые нужно отправить<br/>
              • Можно выбрать сразу все кнопкой "Выбрать все"<br/>
              • Нажмите на штрихкод заказа чтобы посмотреть детали (фото, описание)
            </div>
          </div>

          {/* Шаг 3 */}
          <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#f59e0b", color: "#fff", fontSize: 14 }}>3</span>
              Выберите ворота (picking ячейку)
            </div>
            <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6, marginLeft: 36 }}>
              • В выпадающем списке <strong>"Целевая ячейка picking"</strong> выберите ворота<br/>
              • Например: PICK-01, PICK-02 и т.д.<br/>
              • Это место куда складчик переместит заказы
            </div>
          </div>

          {/* Шаг 4 */}
          <div style={{ padding: 16, background: "#f5f3ff", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#6b21a8", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#8b5cf6", color: "#fff", fontSize: 14 }}>4</span>
              Укажите куда везем (Сценарий)
            </div>
            <div style={{ fontSize: 13, color: "#581c87", lineHeight: 1.6, marginLeft: 36 }}>
              • <strong>КУДА (категория):</strong> выберите Pudo, Мерчант или Сервис<br/>
              • <strong>Точка назначения:</strong> выберите конкретное место<br/>
              • Например: "Склад Возвратов → Мерчант → Merchant 1"<br/>
              • Это поможет логистам понять куда везти заказы
            </div>
          </div>

          {/* Шаг 5 */}
          <div style={{ padding: 16, background: "#dcfce7", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#10b981", color: "#fff", fontSize: 14 }}>5</span>
              Создайте задание
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6, marginLeft: 36 }}>
              • Нажмите кнопку <strong>"Создать задания"</strong><br/>
              • Появится сообщение об успешном создании<br/>
              • Задание появится у складчиков в ТСД для выполнения
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fbbf24" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            💡 Полезные советы:
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.8 }}>
            • Можно создавать несколько заданий на одни и те же ворота - это нормально<br/>
            • Складчики будут брать задания по очереди<br/>
            • Ваше имя будет показано в задании, чтобы складчик знал кто создал
          </div>
        </div>
      </div>

      {/* Работа с мерчант не принял */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #dc2626", marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#dc2626" }}>
          🚫 Работа с заказами "Мерчант не принял"
        </h3>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
          Когда курьер привозит заказ обратно потому что мерчант отказался его принять, заказ попадает в этот список.
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          {/* Где найти */}
          <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>
              📍 Где найти эти заказы:
            </div>
            <div style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.6 }}>
              В меню слева найдите раздел <strong>"Мерчант не принял"</strong>
            </div>
          </div>

          {/* Что показывает */}
          <div style={{ padding: 16, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 12 }}>
              📊 Что вы увидите в списке:
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 2 }}>
              • <strong>Штрихкод заказа</strong> - номер для поиска<br/>
              • <strong>Количество возвратов</strong> - сколько раз вернули (1), (2), (3)...<br/>
              • <strong>Ячейка BIN</strong> - где сейчас находится заказ<br/>
              • <strong>Тикет</strong> - создан ли тикет на проблему<br/>
              • <strong>Статус решения</strong> - решена ли проблема
            </div>
          </div>

          {/* Действие 1: Создать тикет */}
          <div style={{ padding: 16, background: "#eff6ff", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>
              🎫 Как создать тикет на проблемный заказ:
            </div>
            <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.8 }}>
              <strong>1.</strong> Найдите заказ в списке<br/>
              <strong>2.</strong> Нажмите кнопку <strong>"Создать тикет"</strong><br/>
              <strong>3.</strong> В окошке напишите примечание: в чем проблема, что делать<br/>
              <strong>4.</strong> Нажмите <strong>"Создать"</strong><br/>
              <strong>5.</strong> Тикет создан! Теперь можно работать над решением
            </div>
          </div>

          {/* Действие 2: Решить тикет */}
          <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
              ✅ Как отметить что проблема решена:
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.8 }}>
              <strong>1.</strong> Когда разобрались с заказом (связались с мерчантом, нашли решение)<br/>
              <strong>2.</strong> Нажмите кнопку <strong>"Решить"</strong> рядом с заказом<br/>
              <strong>3.</strong> В окошке напишите что сделали, как решили проблему<br/>
              <strong>4.</strong> Нажмите <strong>"Решить тикет"</strong><br/>
              <strong>5.</strong> Тикет закрыт! Заказ можно отправлять снова
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fbbf24" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            ⏱️ Важные метрики (следите за временем):
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.8 }}>
            • <strong>Время до тикета:</strong> как быстро создали тикет после возврата<br/>
            • <strong>Время решения:</strong> как быстро решили проблему<br/>
            • Старайтесь работать быстро - это влияет на показатели склада!
          </div>
        </div>
      </div>

      {/* Что делать если */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>❓ Частые вопросы:</h3>
        
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              Можно ли создать несколько заданий на одни ворота?
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Да! Это нормально. Складчики будут брать их по очереди.
            </div>
          </div>

          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              Что если складчик уже работает над заданием?
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Когда складчик начинает работу, задание блокируется. Другие его не увидят. Можете создавать новые.
            </div>
          </div>

          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              Как узнать выполнено ли задание?
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Можно проверить в разделе SLA - там видно все завершенные задания с временем выполнения.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogisticsSection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>🚛 Инструкции для логистов</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Простая инструкция для логистов. Здесь описано как отгружать заказы со склада.
      </p>

      {/* Отгрузка заказов */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "2px solid #10b981", marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: "#10b981" }}>
          📦 Как отгрузить заказы
        </h3>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
          Ваша задача - взять заказы из ворот (picking ячеек) и отправить их курьерам или на доставку.
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          {/* Шаг 1 */}
          <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#10b981", color: "#fff", fontSize: 14 }}>1</span>
              Откройте страницу "Логистика"
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6, marginLeft: 36 }}>
              В меню слева найдите раздел <strong>"Логистика"</strong> и нажмите на него.<br/>
              Появится список заказов готовых к отгрузке.
            </div>
          </div>

          {/* Шаг 2 */}
          <div style={{ padding: 16, background: "#eff6ff", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#2563eb", color: "#fff", fontSize: 14 }}>2</span>
              Что показывает список
            </div>
            <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.8, marginLeft: 36 }}>
              • <strong>Штрихкод</strong> - номер заказа<br/>
              • <strong>Ячейка</strong> - где лежит (PICK-01, PICK-02...)<br/>
              • <strong>Сценарий</strong> - куда везем (Мерчант, Сервис, Pudo)<br/>
              • <strong>Статус</strong> - picking (готов к отгрузке)
            </div>
          </div>

          {/* Шаг 3 */}
          <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#f59e0b", color: "#fff", fontSize: 14 }}>3</span>
              Выберите заказ для отгрузки
            </div>
            <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6, marginLeft: 36 }}>
              • Нажмите на строку с заказом<br/>
              • Откроется окошко с деталями<br/>
              • Проверьте информацию: штрихкод, ячейку, сценарий
            </div>
          </div>

          {/* Шаг 4 */}
          <div style={{ padding: 16, background: "#f5f3ff", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#6b21a8", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#8b5cf6", color: "#fff", fontSize: 14 }}>4</span>
              Введите данные курьера
            </div>
            <div style={{ fontSize: 13, color: "#581c87", lineHeight: 1.6, marginLeft: 36 }}>
              В поле <strong>"Имя курьера / Сценарий"</strong> введите:<br/>
              • Имя курьера (например: Иван, Петр)<br/>
              • Или название службы доставки<br/>
              • Или скопируйте сценарий который показан выше
            </div>
          </div>

          {/* Шаг 5 */}
          <div style={{ padding: 16, background: "#dcfce7", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "#10b981", color: "#fff", fontSize: 14 }}>5</span>
              Отгрузите заказ
            </div>
            <div style={{ fontSize: 13, color: "#14532d", lineHeight: 1.8, marginLeft: 36 }}>
              • Нажмите кнопку <strong>"Отгрузить"</strong><br/>
              • Заказ переместится в статус <strong>OUT</strong> (отправлен)<br/>
              • Появится сообщение об успешной отгрузке<br/>
              • Окошко закроется, заказ исчезнет из списка<br/>
              • Можно брать следующий заказ!
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fbbf24" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            ⚠️ Важно помнить:
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.8 }}>
            • Обязательно проверяйте ячейку - заказ должен физически там находиться<br/>
            • Обязательно вводите имя курьера - это нужно для отслеживания<br/>
            • Если заказ не на месте - сообщите менеджеру, не отгружайте!
          </div>
        </div>
      </div>

      {/* Что означают статусы */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📊 Что означают статусы заказов:</h3>
        
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 12, background: "#dcfce7", borderRadius: 6, border: "1px solid #86efac" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 4 }}>
              🚪 picking - Готов к отгрузке
            </div>
            <div style={{ fontSize: 13, color: "#14532d" }}>
              Заказ в воротах (picking ячейке), ждет вас. Можно брать и отгружать.
            </div>
          </div>

          <div style={{ padding: 12, background: "#f3f4f6", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              🚚 out - Отправлен
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Заказ уже отгрузили, он в доставке. Этот заказ больше не ваша задача.
            </div>
          </div>
        </div>
      </div>

      {/* История отгрузок */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📜 История отгрузок:</h3>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
          Все ваши отгрузки записываются в систему. Можно посмотреть:<br/>
          • Когда отгрузили<br/>
          • Кому передали (имя курьера)<br/>
          • Какой сценарий был (куда везли)<br/>
          <br/>
          Это помогает отследить где сейчас заказ если возникнут вопросы.
        </p>
      </div>

      {/* Частые вопросы */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>❓ Частые вопросы:</h3>
        
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              Что делать если заказа нет в ячейке?
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              НЕ отгружайте! Сообщите менеджеру или проверьте соседние ячейки. Возможно ошибка.
            </div>
          </div>

          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              Можно ли отгрузить несколько заказов одному курьеру?
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Да! Отгружайте по одному, вводите одно и то же имя курьера для всех заказов.
            </div>
          </div>

          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              Что если забыл имя курьера?
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Можно скопировать сценарий из поля выше. Главное - чтобы поле не было пустым.
            </div>
          </div>

          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
              Список пустой - что делать?
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Значит сейчас нет заказов готовых к отгрузке. Дождитесь когда складчики переместят заказы в ворота.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaSection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>🔧 units.meta (JSONB)</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Гибкое поле для хранения дополнительных данных о заказе. Используется для отслеживания возвратов и проблем.
      </p>

      {/* merchant_rejections */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, marginBottom: 20, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#dc2626" }}>
          🚫 merchant_rejections (Array)
        </h3>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
          Массив всех случаев, когда мерчант отклонил заказ. Каждое отклонение записывается отдельным объектом.
        </p>

        <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, fontFamily: "monospace", fontSize: 12 }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
{`{
  "merchant_rejections": [
    {
      "rejected_at": "2024-01-15T10:30:00Z",
      "return_number": 1,
      "scenario": "Склад → Мерчант → Merchant 1",
      "courier_name": "Иван",
      "reason": "не указано"
    },
    {
      "rejected_at": "2024-01-20T14:20:00Z",
      "return_number": 2,
      "scenario": "Склад → Мерчант → Merchant 1",
      "courier_name": "Петр",
      "reason": "не указано"
    }
  ],
  "merchant_rejection_count": 2
}`}
          </pre>
        </div>

        <div style={{ marginTop: 16, padding: 12, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
          <strong style={{ fontSize: 13, color: "#991b1b" }}>Важно:</strong>
          <p style={{ fontSize: 13, color: "#991b1b", marginTop: 4 }}>
            Каждый возврат увеличивает return_number. Отображается в UI как бейдж "Мерчант не принял (2)".
          </p>
        </div>
      </div>

      {/* service_center_returns */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, marginBottom: 20, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#f59e0b" }}>
          🔧 service_center_returns (Array)
        </h3>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
          Аналогично merchant_rejections, но для возвратов из сервисного центра.
        </p>

        <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, fontFamily: "monospace", fontSize: 12 }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
{`{
  "service_center_returns": [
    {
      "returned_at": "2024-01-16T12:00:00Z",
      "return_number": 1,
      "scenario": "Склад → Сервис → Service Center 1",
      "courier_name": "Анна"
    }
  ],
  "service_center_return_count": 1
}`}
          </pre>
        </div>
      </div>

      {/* merchant_rejection_ticket */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#7c3aed" }}>
          🎫 merchant_rejection_ticket (Object)
        </h3>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
          Тикет для отслеживания работы над проблемным заказом (см. раздел "Тикеты").
        </p>
      </div>
    </div>
  );
}

function MovesSection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>🔄 unit_moves (Таблица перемещений)</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Каждое перемещение заказа между ячейками записывается в эту таблицу. Используется для истории и аналитики.
      </p>

      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Структура записи:</h3>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ padding: 12, textAlign: "left", fontWeight: 600 }}>Поле</th>
              <th style={{ padding: 12, textAlign: "left", fontWeight: 600 }}>Тип</th>
              <th style={{ padding: 12, textAlign: "left", fontWeight: 600 }}>Описание</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>from_cell_id</td>
              <td style={{ padding: 12, color: "#6b7280" }}>UUID</td>
              <td style={{ padding: 12 }}>ID исходной ячейки (null для новых заказов)</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>to_cell_id</td>
              <td style={{ padding: 12, color: "#6b7280" }}>UUID</td>
              <td style={{ padding: 12 }}>ID целевой ячейки</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>moved_by</td>
              <td style={{ padding: 12, color: "#6b7280" }}>UUID</td>
              <td style={{ padding: 12 }}>ID пользователя, выполнившего перемещение</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>source</td>
              <td style={{ padding: 12, color: "#6b7280" }}>text</td>
              <td style={{ padding: 12 }}>Источник: "tsd", "api", "system"</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>note</td>
              <td style={{ padding: 12, color: "#6b7280" }}>text</td>
              <td style={{ padding: 12 }}>Примечание к перемещению</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>meta</td>
              <td style={{ padding: 12, color: "#6b7280" }}>JSONB</td>
              <td style={{ padding: 12 }}>Дополнительные данные (scenario, courier_name)</td>
            </tr>
            <tr>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb" }}>created_at</td>
              <td style={{ padding: 12, color: "#6b7280" }}>timestamp</td>
              <td style={{ padding: 12 }}>Время перемещения</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 20, padding: 16, background: "#f0f9ff", borderRadius: 8 }}>
          <strong style={{ fontSize: 14, color: "#1e40af" }}>Пример использования:</strong>
          <p style={{ fontSize: 13, color: "#1e3a8a", marginTop: 8, lineHeight: 1.6 }}>
            При каждом сканировании в ТСД создается запись в unit_moves. Это позволяет отследить полный путь заказа: 
            receiving → storage → picking → shipping → out.
          </p>
        </div>
      </div>
    </div>
  );
}

function TicketsSection() {
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>🎫 merchant_rejection_ticket</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Система тикетов для управления проблемными заказами. Хранится в units.meta.merchant_rejection_ticket.
      </p>

      <div style={{ background: "#fff", borderRadius: 12, padding: 24, marginBottom: 20, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Структура тикета:</h3>

        <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, fontFamily: "monospace", fontSize: 12 }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
{`{
  "merchant_rejection_ticket": {
    "ticket_id": "TICKET-1234567890",
    "status": "open",  // или "resolved"
    "created_at": "2024-01-15T10:30:00Z",
    "created_by": "user-uuid",
    "created_by_name": "Иван Петров",
    "notes": "Клиент отказался от товара",
    "resolved_at": null,  // или timestamp
    "resolved_by": null,  // или user-uuid
    "resolved_by_name": null,  // или имя
    "resolution_notes": null  // или текст решения
  }
}`}
          </pre>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Статусы тикета:</h3>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 16, background: "#fffbeb", borderRadius: 8, border: "1px solid #fbbf24" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
              open (открыт)
            </div>
            <div style={{ fontSize: 13, color: "#78350f" }}>
              Тикет создан, проблема требует решения. OPS работает над заказом.
            </div>
          </div>

          <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#166534", marginBottom: 4 }}>
              resolved (решен)
            </div>
            <div style={{ fontSize: 13, color: "#14532d" }}>
              Проблема решена. Записано время решения и имя сотрудника.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, padding: 16, background: "#f0f9ff", borderRadius: 8 }}>
          <strong style={{ fontSize: 14, color: "#1e40af" }}>Метрики:</strong>
          <ul style={{ paddingLeft: 20, marginTop: 8, fontSize: 13, color: "#1e3a8a" }}>
            <li>BIN → Тикет: время от попадания в BIN до создания тикета</li>
            <li>Тикет → Решение: время от created_at до resolved_at</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ShipmentsSection() {
  const shipmentStatuses = [
    { name: "out", color: "#6b7280", desc: "Заказ отправлен со склада, в пути" },
    { name: "returned", color: "#dc2626", desc: "Заказ вернулся на склад (мерчант не принял / из сервиса)" },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>🚚 outbound_shipments (Отправки)</h2>
      <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
        Таблица отправок заказов со склада. Отслеживает статус доставки и возвраты.
      </p>

      {shipmentStatuses.map((status) => (
        <div
          key={status.name}
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div
              style={{
                padding: "6px 12px",
                background: status.color,
                color: "#fff",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {status.name}
            </div>
          </div>
          <p style={{ color: "#374151", fontSize: 14 }}>{status.desc}</p>
        </div>
      ))}

      <div style={{ background: "#fff", borderRadius: 12, padding: 24, marginTop: 20, border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Ключевые поля:</h3>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb", fontWeight: 600 }}>out_at</td>
              <td style={{ padding: 12 }}>Время отправки со склада</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb", fontWeight: 600 }}>returned_at</td>
              <td style={{ padding: 12 }}>Время возврата (если вернулся)</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb", fontWeight: 600 }}>courier_name</td>
              <td style={{ padding: 12 }}>Имя курьера/сценарий доставки</td>
            </tr>
            <tr>
              <td style={{ padding: 12, fontFamily: "monospace", color: "#2563eb", fontWeight: 600 }}>return_reason</td>
              <td style={{ padding: 12 }}>Причина возврата (опционально)</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 20, padding: 16, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
          <strong style={{ fontSize: 14, color: "#991b1b" }}>Важная метрика:</strong>
          <p style={{ fontSize: 13, color: "#991b1b", marginTop: 8 }}>
            Return Rate = (возвращенные / всего отправленных) × 100%
          </p>
          <p style={{ fontSize: 13, color: "#991b1b", marginTop: 4 }}>
            Отслеживается на странице SLA для контроля качества доставки.
          </p>
        </div>
      </div>
    </div>
  );
}
