"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Unit = {
  id: string;
  barcode: string;
  status: string;
  cell_id: string;
  created_at: string;
  cell: { id: string; code: string; cell_type: string } | null;
  scenario: string | null;
};

export default function LogisticsPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [courierName, setCourierName] = useState("");
  const [shipping, setShipping] = useState(false);

  useEffect(() => {
    loadUnits();
  }, []);

  async function loadUnits() {
    setLoading(true);
    setError(null);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:30',message:'loadUnits called',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
    // #endregion

    try {
      const res = await fetch("/api/logistics/picking-units", { cache: "no-store" });
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:38',message:'API response received',data:{status:res.status,ok:res.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion
      
      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 403) {
        setError("У вас нет доступа к этому разделу");
        setLoading(false);
        return;
      }

      const json = await res.json();
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:54',message:'JSON parsed',data:{ok:json.ok,unitsCount:json.units?.length||0,hasError:!!json.error},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion
      
      if (res.ok && json.ok) {
        setUnits(json.units || []);
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:63',message:'Error from API',data:{error:json.error},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
        // #endregion
        setError(json.error || "Ошибка загрузки заказов");
      }
    } catch (e: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:70',message:'Exception caught',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleShipOut() {
    if (!selectedUnit || !courierName.trim()) {
      alert("Введите имя курьера");
      return;
    }

    setShipping(true);
    setError(null);

    try {
      const res = await fetch("/api/logistics/ship-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selectedUnit.id,
          courierName: courierName.trim(),
        }),
      });

      const json = await res.json();

      if (res.ok && json.ok) {
        alert(`✓ Заказ ${selectedUnit.barcode} отправлен курьером ${courierName}`);
        setSelectedUnit(null);
        setCourierName("");
        await loadUnits();
      } else {
        setError(json.error || "Ошибка отправки");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка отправки");
    } finally {
      setShipping(false);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--spacing-xl)" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: "var(--spacing-md)" }}>
        Логистика
      </h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--spacing-xl)" }}>
        Отправка заказов из picking в OUT (доставка курьером)
      </p>

      {error && (
        <div
          style={{
            background: "#fee",
            border: "1px solid #fcc",
            borderRadius: "var(--radius-md)",
            padding: "var(--spacing-md)",
            marginBottom: "var(--spacing-lg)",
            color: "#c00",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--spacing-xl)" }}>
        {/* Left: Units in picking */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: "var(--spacing-md)" }}>
            Заказы в Picking ({units.length})
          </h2>

          {loading ? (
            <div style={{ fontSize: 14, color: "#666" }}>Загрузка...</div>
          ) : units.length === 0 ? (
            <div
              style={{
                background: "#f9f9f9",
                border: "1px solid #ddd",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-lg)",
                textAlign: "center",
                color: "#666",
              }}
            >
              Нет заказов в picking
            </div>
          ) : (
            <div style={{ display: "grid", gap: "var(--spacing-md)" }}>
              {units.map((unit) => (
                <div
                  key={unit.id}
                  onClick={() => setSelectedUnit(unit)}
                  style={{
                    background: selectedUnit?.id === unit.id ? "#e0f2fe" : "#fff",
                    border: selectedUnit?.id === unit.id ? "2px solid #0284c7" : "1px solid #ddd",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--spacing-md)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedUnit?.id !== unit.id) {
                      e.currentTarget.style.background = "#f9f9f9";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedUnit?.id !== unit.id) {
                      e.currentTarget.style.background = "#fff";
                    }
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                        📦 {unit.barcode}
                      </div>
                      <div style={{ fontSize: 13, color: "#666" }}>
                        Ячейка: {unit.cell?.code || "—"} • {formatDate(unit.created_at)}
                      </div>
                      {unit.scenario && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#0284c7",
                            marginTop: 6,
                            padding: "4px 8px",
                            background: "#e0f2fe",
                            borderRadius: 4,
                            display: "inline-block",
                          }}
                        >
                          📋 {unit.scenario}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Ship out form */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: "var(--spacing-md)" }}>
            Отправка заказа
          </h2>

          {!selectedUnit ? (
            <div
              style={{
                background: "#f9f9f9",
                border: "1px solid #ddd",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-lg)",
                textAlign: "center",
                color: "#666",
              }}
            >
              Выберите заказ слева
            </div>
          ) : (
            <div
              style={{
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "var(--radius-md)",
                padding: "var(--spacing-lg)",
              }}
            >
              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Заказ</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{selectedUnit.barcode}</div>
              </div>

              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Ячейка</div>
                <div style={{ fontSize: 14 }}>{selectedUnit.cell?.code || "—"}</div>
              </div>

              {selectedUnit.scenario && (
                <div style={{ marginBottom: "var(--spacing-lg)" }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Сценарий (OPS)</div>
                  <div
                    style={{
                      fontSize: 13,
                      padding: "var(--spacing-sm)",
                      background: "#f9f9f9",
                      borderRadius: "var(--radius-sm)",
                      color: "#333",
                    }}
                  >
                    {selectedUnit.scenario}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "var(--spacing-lg)" }}>
                <label
                  htmlFor="courierName"
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: "var(--spacing-xs)",
                    color: "var(--color-text)",
                  }}
                >
                  Имя курьера <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  id="courierName"
                  type="text"
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="Введите имя курьера"
                  disabled={shipping}
                  style={{
                    width: "100%",
                    padding: "var(--spacing-sm) var(--spacing-md)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 14,
                  }}
                />
              </div>

              <button
                onClick={handleShipOut}
                disabled={shipping || !courierName.trim()}
                style={{
                  width: "100%",
                  padding: "var(--spacing-md)",
                  background: shipping || !courierName.trim() ? "#ccc" : "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: shipping || !courierName.trim() ? "not-allowed" : "pointer",
                }}
              >
                {shipping ? "Отправка..." : "✓ Готово / Отправить"}
              </button>

              <button
                onClick={() => {
                  setSelectedUnit(null);
                  setCourierName("");
                }}
                disabled={shipping}
                style={{
                  width: "100%",
                  padding: "var(--spacing-sm)",
                  background: "transparent",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "var(--radius-md)",
                  fontSize: 14,
                  marginTop: "var(--spacing-sm)",
                  cursor: shipping ? "not-allowed" : "pointer",
                }}
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
