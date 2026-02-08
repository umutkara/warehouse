"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Alert, Card, Badge } from "@/lib/ui/components";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  created_at: string;
  cell_id?: string | null;
};

type Cell = {
  id: string;
  code: string;
  cell_type: string;
  units_count: number;
};

export default function ReceivingPage() {
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [selectedCellIds, setSelectedCellIds] = useState<Record<string, string>>({});

  useEffect(() => {
    router.replace("/app/tsd");
  }, [router]);

  const sanitized = useMemo(() => digits.replace(/[^\d]/g, ""), [digits]);

  async function loadCells() {
    try {
      const res = await fetch("/api/cells/list", { cache: "no-store" });
      if (!res.ok) {
        console.error("Ошибка загрузки ячеек:", res.status);
        return;
      }
      const json = await res.json();
      // Фильтруем только bin ячейки
      const binCells = (json.cells || []).filter((cell: Cell) => cell.cell_type === "bin");
      setCells(binCells);
    } catch (e) {
      console.error("Ошибка загрузки ячеек:", e);
    }
  }

  async function loadLatest() {
    setError(null);
    const res = await fetch("/api/units/latest", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "failed_to_load");
      return;
    }
    setUnits(json.units);
  }

  useEffect(() => {
    loadLatest();
    loadCells();
  }, []);

  async function createUnit() {
    setError(null);
    if (!sanitized || sanitized.length < 3) {
      setError("Enter at least 3 digits");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/units/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digits: sanitized }),
    });
    const json = await res.json();
    setLoading(false);

    if (!json.ok) {
      setError(json.error || "create_failed");
      return;
    }

    setDigits("");
    await loadLatest();
  }

  async function moveToStored(id: string) {
    setLoading(true);
    setError(null);
    try {
      const selectedCellId = selectedCellIds[id];

      if (!selectedCellId) {
        setError("Выберите целевую ячейку");
        setLoading(false);
        return;
      }

      // Получаем текущий unit (если есть)
      const currentUnit = units.find(u => u.id === id);
      const fromType = currentUnit?.cell_id 
        ? cells.find(c => c.id === currentUnit.cell_id)?.cell_type || null
        : null;

      // Защитная проверка: убеждаемся, что выбранная ячейка - это bin
      const selectedCell = cells.find(c => c.id === selectedCellId);
      if (!selectedCell || selectedCell.cell_type !== "bin") {
        setError("Можно размещать только в BIN-ячейки");
        setLoading(false);
        return;
      }

      const toType = selectedCell.cell_type;

      // Защитная проверка: if (toType === "bin" && fromType !== "bin") -> ошибка
      if (toType === "bin" && fromType !== "bin" && fromType !== null) {
        setError("Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/units/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: id, toStatus: "bin", cellId: selectedCellId }),
      });

      const text = await res.text();
      let assignData: any = null;
      try {
        assignData = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        console.error("Ошибка API units/assign:", assignData ?? text);
        throw new Error(assignData?.error || text || `units/assign failed: ${res.status}`);
      }

      // Обновляем списки после успешного перемещения
      await loadLatest();
      await loadCells();

      // Очищаем выбранную ячейку для этого unit
      setSelectedCellIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

    } catch (e: any) {
      console.error("Ошибка в moveToStored:", e);
      setError(e.message ?? "Ошибка перемещения");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
      <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "var(--color-text)" }}>Приёмка</h2>

      <Card>
        <div style={{ display: "flex", gap: "var(--spacing-md)", alignItems: "center", flexWrap: "wrap" }}>
          <Input
            placeholder="Введите цифры для создания заказа"
            value={digits}
            onChange={(e) => setDigits(e.target.value)}
            style={{ width: 280 }}
          />
          <Button onClick={createUnit} disabled={loading} variant="primary">
            {loading ? "Создание..." : "Создать заказ"}
          </Button>
          {error && (
            <div style={{ flex: "1 1 100%" }}>
              <Alert variant="error">{error}</Alert>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, marginBottom: "var(--spacing-md)", fontSize: "16px", color: "var(--color-text)" }}>
          Последние заказы
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: "var(--spacing-md)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  Штрихкод
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: "var(--spacing-md)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  Статус
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: "var(--spacing-md)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  Создан
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: "var(--spacing-md)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  Действие
                </th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                  <td style={{ padding: "var(--spacing-md)", color: "var(--color-text)" }}>{u.barcode}</td>
                  <td style={{ padding: "var(--spacing-md)" }}>
                    <Badge variant={u.status === "bin" ? "info" : "default"}>{u.status}</Badge>
                  </td>
                  <td style={{ padding: "var(--spacing-md)", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                    {new Date(u.created_at).toLocaleString("ru-RU")}
                  </td>
                  <td style={{ padding: "var(--spacing-md)" }}>
                    {u.status === "bin" && (
                      <div style={{ display: "flex", gap: "var(--spacing-md)", alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          value={selectedCellIds[u.id] || ""}
                          onChange={(e) => {
                            setSelectedCellIds((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }));
                          }}
                          style={{
                            padding: "var(--spacing-sm) var(--spacing-md)",
                            minWidth: 200,
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-md)",
                            fontSize: "14px",
                            background: "var(--color-bg)",
                            color: "var(--color-text)",
                            fontFamily: "var(--font-sans)",
                            outline: "none",
                            transition: "all var(--transition-base)",
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = "var(--color-primary)";
                            e.target.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = "var(--color-border)";
                            e.target.style.boxShadow = "none";
                          }}
                        >
                          <option value="">Выберите ячейку...</option>
                          {cells.map((cell) => (
                            <option key={cell.id} value={cell.id}>
                              {cell.code} — {cell.units_count}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => moveToStored(u.id)}
                          disabled={loading || !selectedCellIds[u.id]}
                        >
                          Разместить в приёмку
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!units.length && (
                <tr>
                  <td colSpan={4} style={{ padding: "var(--spacing-lg)", color: "var(--color-text-tertiary)", textAlign: "center" }}>
                    Пока нет заказов
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}