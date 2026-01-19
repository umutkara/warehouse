-- ============================================
-- Группировка старых поштучных заданий
-- ============================================
-- Выполните этот скрипт если миграция уже была применена,
-- но старые задания всё ещё показываются поштучно

-- 1. Группируем старые open/in_progress задания по target_picking_cell_id
-- Для каждой группы оставляем самое старое задание, остальные отменяем
WITH grouped_tasks AS (
  SELECT 
    id,
    target_picking_cell_id,
    warehouse_id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY target_picking_cell_id, warehouse_id ORDER BY created_at ASC) as rn
  FROM public.picking_tasks
  WHERE status IN ('open', 'in_progress')
  AND unit_id IS NOT NULL
)
UPDATE public.picking_tasks pt
SET status = 'canceled'
FROM grouped_tasks gt
WHERE pt.id = gt.id
AND gt.rn > 1;

-- 2. Для каждого оставленного задания добавляем все units из той же picking ячейки
WITH grouped_tasks AS (
  SELECT 
    id,
    target_picking_cell_id,
    warehouse_id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY target_picking_cell_id, warehouse_id ORDER BY created_at ASC) as rn
  FROM public.picking_tasks
  WHERE status IN ('open', 'in_progress')
  AND unit_id IS NOT NULL
),
kept_tasks AS (
  SELECT id, target_picking_cell_id, warehouse_id
  FROM grouped_tasks
  WHERE rn = 1
)
INSERT INTO public.picking_task_units (picking_task_id, unit_id, from_cell_id, added_at)
SELECT 
  kt.id as picking_task_id,
  pt.unit_id,
  pt.from_cell_id,
  pt.created_at as added_at
FROM public.picking_tasks pt
INNER JOIN kept_tasks kt 
  ON pt.target_picking_cell_id = kt.target_picking_cell_id 
  AND pt.warehouse_id = kt.warehouse_id
WHERE pt.status IN ('open', 'in_progress', 'canceled')
AND pt.unit_id IS NOT NULL
ON CONFLICT (picking_task_id, unit_id) DO NOTHING;

-- 3. Очищаем unit_id у сгруппированных заданий (превращаем в multi-unit)
WITH grouped_tasks AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY target_picking_cell_id, warehouse_id ORDER BY created_at ASC) as rn
  FROM public.picking_tasks
  WHERE status IN ('open', 'in_progress')
  AND unit_id IS NOT NULL
)
UPDATE public.picking_tasks pt
SET unit_id = NULL
FROM grouped_tasks gt
WHERE pt.id = gt.id
AND gt.rn = 1;

-- Проверка результата:
SELECT 
  pt.id,
  pt.status,
  pt.target_picking_cell_id,
  pt.unit_id,
  COUNT(ptu.unit_id) as unit_count,
  STRING_AGG(u.barcode, ', ') as unit_barcodes
FROM public.picking_tasks pt
LEFT JOIN public.picking_task_units ptu ON pt.id = ptu.picking_task_id
LEFT JOIN public.units u ON ptu.unit_id = u.id
WHERE pt.status IN ('open', 'in_progress')
GROUP BY pt.id, pt.status, pt.target_picking_cell_id, pt.unit_id
ORDER BY pt.created_at DESC
LIMIT 20;
