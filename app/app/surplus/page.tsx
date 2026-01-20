"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/lib/ui/components";

export const dynamic = 'force-dynamic';

type SurplusUnit = {
  id: string;
  barcode: string;
  product_name?: string; // Название товара (можно редактировать)
  received_at: string;
  cell_code?: string;
  warehouse_id?: string;
};

type DemoProduct = {
  id: string;
  name: string;
  price: string;
  image: string;
  description: string;
  marketplace: string;
  url: string;
};

export default function SurplusPage() {
  const [units, setUnits] = useState<SurplusUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DemoProduct[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadSurplusUnits();
  }, []);

  async function loadSurplusUnits() {
    setLoading(true);
    try {
      const res = await fetch("/api/surplus/list", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setUnits(json.units || []);
      }
    } catch (e) {
      console.error("Failed to load surplus units:", e);
    } finally {
      setLoading(false);
    }
  }

  function handleEditClick(unit: SurplusUnit) {
    setEditingUnit(unit.id);
    setEditName(unit.product_name || "");
  }

  async function handleSaveName(unitId: string) {
    try {
      const res = await fetch("/api/surplus/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, productName: editName }),
      });

      if (res.ok) {
        // Update local state
        setUnits(units.map(u => 
          u.id === unitId ? { ...u, product_name: editName } : u
        ));
        setEditingUnit(null);
      }
    } catch (e) {
      console.error("Failed to update name:", e);
    }
  }

  function handleCancelEdit() {
    setEditingUnit(null);
    setEditName("");
  }

  // Демо поиск товаров (мок-данные)
  function handleDemoSearch() {
    if (!searchQuery.trim()) return;

    setSearching(true);
    
    // Имитация API запроса
    setTimeout(() => {
      const mockResults: DemoProduct[] = [
        {
          id: "1",
          name: `${searchQuery} - Premium Edition`,
          price: "2,499 ₽",
          image: "/api/placeholder/150/150",
          description: "Высококачественный товар с отличными отзывами",
          marketplace: "Ozon",
          url: "#demo-link-1"
        },
        {
          id: "2",
          name: `${searchQuery} - Стандарт`,
          price: "1,799 ₽",
          image: "/api/placeholder/150/150",
          description: "Оптимальное соотношение цены и качества",
          marketplace: "Wildberries",
          url: "#demo-link-2"
        },
        {
          id: "3",
          name: `${searchQuery} - Эконом`,
          price: "999 ₽",
          image: "/api/placeholder/150/150",
          description: "Бюджетный вариант для экономных покупателей",
          marketplace: "Яндекс.Маркет",
          url: "#demo-link-3"
        },
      ];

      setSearchResults(mockResults);
      setSearching(false);
    }, 800);
  }

  if (loading) {
    return (
      <div style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ fontSize: 18, color: "#666" }}>Загрузка...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--spacing-xl)", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <Link href="/app/warehouse-map" style={{ textDecoration: "none", color: "#666" }}>
            ← Назад
          </Link>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: "#ff9800" }}>
            📦 Излишки
          </h1>
        </div>
        <p style={{ color: "#666", fontSize: 16 }}>
          Товары без ТТНК, принятые в ячейку SURPLUS. Заполните названия и найдите похожие товары.
        </p>
      </div>

      {/* Stats */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: 16,
        marginBottom: 32
      }}>
        <div style={{ 
          padding: 24, 
          background: "linear-gradient(135deg, #ff9800 0%, #f57c00 100%)", 
          borderRadius: 12,
          color: "white"
        }}>
          <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>Всего излишков</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>{units.length}</div>
        </div>
        <div style={{ 
          padding: 24, 
          background: "linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)", 
          borderRadius: 12,
          color: "white"
        }}>
          <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>С названием</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>
            {units.filter(u => u.product_name).length}
          </div>
        </div>
        <div style={{ 
          padding: 24, 
          background: "linear-gradient(135deg, #2196f3 0%, #1565c0 100%)", 
          borderRadius: 12,
          color: "white"
        }}>
          <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>Без названия</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>
            {units.filter(u => !u.product_name).length}
          </div>
        </div>
      </div>

      {/* Demo Search */}
      <div style={{ 
        padding: 24, 
        background: "white", 
        borderRadius: 12, 
        border: "2px solid #e0e0e0",
        marginBottom: 32
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
          🔍 Поиск похожих товаров (ДЕМО)
        </h2>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Введите название товара..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDemoSearch()}
            style={{
              flex: 1,
              padding: 12,
              fontSize: 16,
              border: "2px solid #e0e0e0",
              borderRadius: 8
            }}
          />
          <Button
            onClick={handleDemoSearch}
            disabled={searching || !searchQuery.trim()}
            style={{ minWidth: 120 }}
          >
            {searching ? "Поиск..." : "Найти"}
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div>
            <div style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
              Найдено {searchResults.length} похожих товаров:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {searchResults.map((product) => (
                <div
                  key={product.id}
                  style={{
                    padding: 16,
                    background: "#f9f9f9",
                    borderRadius: 8,
                    border: "1px solid #e0e0e0",
                    display: "flex",
                    gap: 16
                  }}
                >
                  <div style={{ 
                    width: 80, 
                    height: 80, 
                    background: "#e0e0e0", 
                    borderRadius: 8,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "#999"
                  }}>
                    IMG
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>
                      {product.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                      {product.description}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <div style={{ fontWeight: 700, color: "#ff9800", fontSize: 16 }}>
                        {product.price}
                      </div>
                      <div style={{ 
                        padding: "2px 8px", 
                        background: "#e3f2fd", 
                        borderRadius: 4,
                        fontSize: 11,
                        color: "#1565c0",
                        fontWeight: 600
                      }}>
                        {product.marketplace}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Units List */}
      {units.length === 0 ? (
        <div style={{ 
          padding: 48, 
          textAlign: "center", 
          background: "#f9f9f9", 
          borderRadius: 12,
          border: "2px dashed #e0e0e0"
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <div style={{ fontSize: 18, color: "#666", marginBottom: 8 }}>Нет излишков</div>
          <div style={{ fontSize: 14, color: "#999" }}>
            Используйте ТСД режим "Излишки" для приемки товаров без ТТНК
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {units.map((unit) => (
            <div
              key={unit.id}
              style={{
                padding: 24,
                background: "white",
                borderRadius: 12,
                border: "2px solid #e0e0e0",
                display: "flex",
                flexDirection: "column",
                gap: 16
              }}
            >
              <div style={{ display: "flex", alignItems: "start", gap: 16 }}>
                {/* Barcode */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Штрихкод</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#333" }}>
                    {unit.barcode}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Дата приемки</div>
                  <div style={{ fontSize: 14, color: "#666" }}>
                    {new Date(unit.received_at).toLocaleString("ru-RU")}
                  </div>
                </div>
              </div>

              {/* Product Name */}
              <div>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>Название товара</div>
                {editingUnit === unit.id ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Введите название товара"
                      autoFocus
                      style={{
                        flex: 1,
                        padding: 12,
                        fontSize: 16,
                        border: "2px solid #2196f3",
                        borderRadius: 8
                      }}
                    />
                    <Button onClick={() => handleSaveName(unit.id)} style={{ minWidth: 100 }}>
                      Сохранить
                    </Button>
                    <Button variant="secondary" onClick={handleCancelEdit}>
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ 
                      flex: 1, 
                      fontSize: 16,
                      color: unit.product_name ? "#333" : "#999",
                      fontStyle: unit.product_name ? "normal" : "italic"
                    }}>
                      {unit.product_name || "Название не указано"}
                    </div>
                    <Button variant="secondary" onClick={() => handleEditClick(unit)}>
                      {unit.product_name ? "Редактировать" : "Добавить название"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Cell */}
              {unit.cell_code && (
                <div>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Ячейка</div>
                  <div style={{ 
                    display: "inline-block",
                    padding: "4px 12px",
                    background: "#fff3e0",
                    border: "1px solid #ff9800",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#e65100"
                  }}>
                    {unit.cell_code}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
