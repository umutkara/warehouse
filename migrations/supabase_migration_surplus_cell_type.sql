-- =====================================================
-- МИГРАЦИЯ: Добавление типа ячейки "surplus" (Излишки)
-- Дата: 2026-01-20
-- Описание: Новый тип ячейки для товаров без ТТНК
-- =====================================================

-- 1. Добавляем новый тип ячейки в CHECK constraint (если есть)
-- Обычно это делается через ALTER TABLE, но зависит от структуры БД

-- 2. Создаем ячейку SURPLUS-1 для первого склада
-- Предполагаем warehouse_id = 1 (измените если нужно)

INSERT INTO warehouse_cells_map (
  code,
  cell_type,
  warehouse_id,
  created_at,
  updated_at
)
VALUES
  ('SURPLUS-1', 'surplus', 1, NOW(), NOW())
ON CONFLICT (code, warehouse_id) DO NOTHING;

-- 3. Комментарий для документации
COMMENT ON COLUMN warehouse_cells_map.cell_type IS 
'Типы ячеек: bin, storage, shipping, picking, receiving, surplus. 
surplus - для товаров без ТТНК (излишки)';

-- 4. Создаем индекс для быстрого поиска ячеек типа surplus
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_surplus 
ON warehouse_cells_map(warehouse_id, cell_type) 
WHERE cell_type = 'surplus';

-- 5. Уведомление PostgREST о изменении схемы
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- ПРИМЕЧАНИЯ:
-- - surplus ячейки используются для приемки товаров без документов
-- - Проверка на дубликаты при приемке обязательна
-- - Товары в surplus можно редактировать через /app/surplus
-- =====================================================
