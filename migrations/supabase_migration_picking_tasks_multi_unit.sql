-- ============================================
-- WMS Picking Tasks: Multi-Unit Support
-- ============================================
-- Change picking_tasks to support multiple units per task
-- One task = one picking cell + multiple units

-- 1. Create picking_task_units junction table
-- ============================================
CREATE TABLE IF NOT EXISTS public.picking_task_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_task_id uuid NOT NULL REFERENCES public.picking_tasks(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  from_cell_id uuid NULL REFERENCES public.warehouse_cells(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(picking_task_id, unit_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_picking_task_units_task_id ON public.picking_task_units(picking_task_id);
CREATE INDEX IF NOT EXISTS idx_picking_task_units_unit_id ON public.picking_task_units(unit_id);

-- RLS
ALTER TABLE public.picking_task_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picking_task_units_select_policy"
  ON public.picking_task_units FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.picking_tasks pt
      INNER JOIN public.warehouses w ON pt.warehouse_id = w.id
      WHERE pt.id = picking_task_units.picking_task_id
      AND w.id IN (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "picking_task_units_insert_policy"
  ON public.picking_task_units FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.picking_tasks pt
      INNER JOIN public.warehouses w ON pt.warehouse_id = w.id
      WHERE pt.id = picking_task_units.picking_task_id
      AND w.id IN (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid())
    )
  );

COMMENT ON TABLE public.picking_task_units IS 'Junction table: many units can belong to one picking task';
COMMENT ON COLUMN public.picking_task_units.from_cell_id IS 'Snapshot of unit cell at time of adding to task';

-- 2. Migrate existing data
-- ============================================

-- 2a. Group old open/in_progress tasks by target_picking_cell_id
-- For each group, keep the oldest task and mark others as 'canceled'
WITH grouped_tasks AS (
  SELECT 
    id,
    target_picking_cell_id,
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

-- 2b. For each kept task (oldest in group), add all units from the same picking cell to picking_task_units
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

-- 2c. Clear unit_id from kept grouped tasks (convert to multi-unit)
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

-- 2d. For completed/done old tasks, create corresponding picking_task_units entry for history
INSERT INTO public.picking_task_units (picking_task_id, unit_id, from_cell_id, added_at)
SELECT 
  id as picking_task_id,
  unit_id,
  from_cell_id,
  created_at as added_at
FROM public.picking_tasks
WHERE unit_id IS NOT NULL
AND status = 'done'
ON CONFLICT (picking_task_id, unit_id) DO NOTHING;

-- 3. Add column for created_by display name (optional, for UI)
-- ============================================
ALTER TABLE public.picking_tasks 
  ADD COLUMN IF NOT EXISTS created_by_name text NULL;

-- Populate created_by_name from profiles
UPDATE public.picking_tasks pt
SET created_by_name = p.full_name
FROM public.profiles p
WHERE pt.created_by = p.id
AND pt.created_by_name IS NULL;

-- 4. Make unit_id nullable (for new multi-unit tasks)
-- ============================================
-- New tasks won't have unit_id set; units are in picking_task_units
ALTER TABLE public.picking_tasks 
  ALTER COLUMN unit_id DROP NOT NULL;

-- Add a check: either unit_id is set (old tasks) OR exists in picking_task_units (new tasks)
-- This is handled at application level

COMMENT ON COLUMN public.picking_tasks.unit_id IS 'DEPRECATED: For old single-unit tasks only. New tasks use picking_task_units table.';
COMMENT ON COLUMN public.picking_tasks.created_by_name IS 'Display name of task creator (cached for UI performance)';

-- 5. Update audit trigger to handle multi-unit tasks
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_trigger_picking_tasks()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_name text;
  v_unit_count int;
BEGIN
  -- Get actor name
  SELECT full_name INTO v_actor_name 
  FROM public.profiles 
  WHERE id = auth.uid()
  LIMIT 1;

  -- Count units in task
  SELECT COUNT(*) INTO v_unit_count
  FROM public.picking_task_units
  WHERE picking_task_id = NEW.id;

  -- If no units in junction table, check old unit_id field
  IF v_unit_count = 0 AND NEW.unit_id IS NOT NULL THEN
    v_unit_count := 1;
  END IF;

  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    actor_user_id,
    actor_name,
    warehouse_id,
    summary,
    meta
  ) VALUES (
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'picking_task_create'
      WHEN TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN 'picking_task_status_change'
      ELSE 'picking_task_update'
    END,
    'picking_task',
    NEW.id,
    auth.uid(),
    v_actor_name,
    NEW.warehouse_id,
    CASE 
      WHEN TG_OP = 'INSERT' THEN 
        'Создано задание (' || COALESCE(v_unit_count::text, '0') || ' units) для ячейки ' || 
        (SELECT code FROM public.warehouse_cells WHERE id = NEW.target_picking_cell_id)
      WHEN TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN 
        'Статус задания: ' || OLD.status || ' → ' || NEW.status
      ELSE 
        'Обновлено задание'
    END,
    jsonb_build_object(
      'task_id', NEW.id,
      'status', NEW.status,
      'target_picking_cell_id', NEW.target_picking_cell_id,
      'unit_count', v_unit_count,
      'scenario', NEW.scenario,
      'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_audit_picking_tasks ON public.picking_tasks;
CREATE TRIGGER trigger_audit_picking_tasks
  AFTER INSERT OR UPDATE ON public.picking_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_picking_tasks();
