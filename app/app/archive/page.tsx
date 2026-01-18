"use client";

import { useEffect, useState } from "react";

type AuditEvent = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  actor_user_id: string | null;
  actor_role: string | null;
  actor_name: string | null;
  meta: Record<string, any>;
};

export default function ArchivePage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, [actionFilter, entityTypeFilter, actorFilter, searchQuery]);

  async function loadEvents(reset = true) {
    if (reset) {
      setLoading(true);
      setEvents([]);
      setNextCursor(null);
    } else {
      setLoadingMore(true);
    }

    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (!reset && nextCursor) {
        params.set("cursor", nextCursor);
      }
      if (actionFilter) {
        params.set("action", actionFilter);
      }
      if (entityTypeFilter) {
        params.set("entityType", entityTypeFilter);
      }
      if (actorFilter) {
        params.set("actor", actorFilter);
      }
      if (searchQuery) {
        params.set("q", searchQuery);
      }

      const res = await fetch(`/api/archive/list?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Ошибка загрузки архива");
        return;
      }

      const json = await res.json();
      if (json.ok) {
        if (reset) {
          setEvents(json.items || []);
        } else {
          setEvents((prev) => [...prev, ...(json.items || [])]);
        }
        setNextCursor(json.nextCursor || null);
      } else {
        setError(json.error || "Ошибка загрузки архива");
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки архива");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function handleLoadMore() {
    if (nextCursor && !loadingMore) {
      loadEvents(false);
    }
  }

  function formatAction(action: string): string {
    const actionMap: Record<string, string> = {
      "unit.move": "Перемещение unit",
      "unit.create": "Создание unit",
      "inventory.start": "Инвентаризация начата",
      "inventory.stop": "Инвентаризация завершена",
      "inventory.close_cell": "Закрытие ячейки",
      "task.create": "Создание задания",
      "task.start": "Начало задания",
      "task.done": "Задание выполнено",
      "task.canceled": "Задание отменено",
    };
    return actionMap[action] || action;
  }

  function getActionBadgeColor(action: string): string {
    if (action.startsWith("unit.")) return "info";
    if (action.startsWith("inventory.")) return "warning";
    if (action.startsWith("task.")) return "success";
    return "default";
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatActor(actorName: string | null, actorRole: string | null, actorUserId: string | null): string {
    const name = actorName || (actorUserId ? actorUserId.slice(0, 8) + "..." : "Система");
    if (actorRole) {
      return `${name} (${actorRole})`;
    }
    return name;
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "var(--spacing-xl)" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: "var(--spacing-xl)" }}>Архив</h1>

      {/* Filters */}
      <div
        style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--spacing-lg)",
          marginBottom: "var(--spacing-xl)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--spacing-md)",
            marginBottom: "var(--spacing-md)",
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: "var(--spacing-xs)", color: "var(--color-text-secondary)" }}>
              Действие
            </label>
            <input
              type="text"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder="unit.move, inventory.*"
              style={{
                width: "100%",
                padding: "var(--spacing-sm) var(--spacing-md)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: "var(--spacing-xs)", color: "var(--color-text-secondary)" }}>
              Тип сущности
            </label>
            <input
              type="text"
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              placeholder="unit, cell, picking_task"
              style={{
                width: "100%",
                padding: "var(--spacing-sm) var(--spacing-md)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: "var(--spacing-xs)", color: "var(--color-text-secondary)" }}>
              Пользователь (ID)
            </label>
            <input
              type="text"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="user uuid"
              style={{
                width: "100%",
                padding: "var(--spacing-sm) var(--spacing-md)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: "var(--spacing-xs)", color: "var(--color-text-secondary)" }}>
              Поиск
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по тексту..."
              style={{
                width: "100%",
                padding: "var(--spacing-sm) var(--spacing-md)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: 14,
              }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "var(--color-danger-light)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
            padding: "var(--spacing-md)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--spacing-lg)",
          }}
        >
          {error}
        </div>
      )}

      {/* Events list */}
      {loading && events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "var(--spacing-2xl)", color: "var(--color-text-secondary)" }}>Загрузка...</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "var(--spacing-2xl)", color: "var(--color-text-secondary)" }}>События не найдены</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-md)" }}>
          {events.map((event) => (
            <div
              key={event.id}
              style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--spacing-lg)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--spacing-sm)" }}>
                <div style={{ flex: 1 }}>
                  {/* First row: actor_name (bold) + badge actor_role + time */}
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-sm)", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>
                      {event.actor_name || event.actor_user_id?.slice(0, 8) || "Система"}
                    </span>
                    {event.actor_role && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: "var(--radius-full)",
                          fontSize: 12,
                          fontWeight: 600,
                          background: "var(--color-bg-tertiary)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {event.actor_role}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                      {formatDate(event.created_at)}
                    </span>
                  </div>
                  {/* Second row: event_type + entity_type/entity_id */}
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-xs)", flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: "var(--radius-full)",
                        fontSize: 12,
                        fontWeight: 600,
                        background: `var(--color-${getActionBadgeColor(event.action)}-light)`,
                        color: `var(--color-${getActionBadgeColor(event.action)})`,
                      }}
                    >
                      {formatAction(event.action)}
                    </span>
                    {event.entity_type && (
                      <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                        {event.entity_type}
                        {event.entity_id && ` (${event.entity_id.slice(0, 8)}...)`}
                      </span>
                    )}
                  </div>
                  {/* Summary */}
                  <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: "var(--spacing-xs)" }}>{event.summary}</div>
                </div>
              </div>

              <button
                onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                style={{
                  marginTop: "var(--spacing-sm)",
                  padding: "var(--spacing-xs) var(--spacing-sm)",
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                {expandedId === event.id ? "Скрыть детали" : "Показать детали"}
              </button>

              {expandedId === event.id && (
                <div
                  style={{
                    marginTop: "var(--spacing-md)",
                    padding: "var(--spacing-md)",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    overflowX: "auto",
                  }}
                >
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {JSON.stringify(event.meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}

          {nextCursor && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                padding: "var(--spacing-md) var(--spacing-xl)",
                background: "var(--color-primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: 14,
                fontWeight: 600,
                cursor: loadingMore ? "not-allowed" : "pointer",
                opacity: loadingMore ? 0.6 : 1,
                alignSelf: "center",
              }}
            >
              {loadingMore ? "Загрузка..." : "Загрузить еще"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
