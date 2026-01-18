-- ============================================
-- WMS Picking Tasks: Shipping tasks (picking tasks)
-- ============================================
-- Ops creates tasks for workers to move units from storage/shipping to picking cells

-- 1. Create picking_tasks table
-- ============================================
CREATE TABLE IF NOT EXISTS public.picking_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  from_cell_id uuid NULL REFERENCES public.warehouse_cells(id) ON DELETE SET NULL,
  target_picking_cell_id uuid NOT NULL REFERENCES public.warehouse_cells(id) ON DELETE RESTRICT,
  scenario text NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'canceled')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  picked_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  picked_at timestamptz NULL,
  completed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_picking_tasks_warehouse_id ON public.picking_tasks(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_picking_tasks_unit_id ON public.picking_tasks(unit_id);
CREATE INDEX IF NOT EXISTS idx_picking_tasks_status ON public.picking_tasks(status) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_picking_tasks_target_cell ON public.picking_tasks(target_picking_cell_id);
CREATE INDEX IF NOT EXISTS idx_picking_tasks_created_by ON public.picking_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_picking_tasks_created_at ON public.picking_tasks(created_at DESC);

-- 2. Enable RLS
-- ============================================
ALTER TABLE public.picking_tasks ENABLE ROW LEVEL SECURITY;

-- SELECT policy: All roles in warehouse can read
CREATE POLICY "Users can view picking tasks from their warehouse"
  ON public.picking_tasks FOR SELECT
  USING (
    warehouse_id IN (
      SELECT warehouse_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- INSERT policy: Only admin/head/manager/ops can create
CREATE POLICY "Admin/head/manager/ops can create picking tasks"
  ON public.picking_tasks FOR INSERT
  WITH CHECK (
    warehouse_id IN (
      SELECT p.warehouse_id 
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'head', 'manager', 'ops')
    )
  );

-- UPDATE policy: Admin/head/manager/ops/worker can update
-- Worker can only change status (open->in_progress->done) and picked_by/picked_at/completed_by/completed_at
-- Worker CANNOT change target_picking_cell_id
CREATE POLICY "Admin/head/manager/ops/worker can update picking tasks"
  ON public.picking_tasks FOR UPDATE
  USING (
    warehouse_id IN (
      SELECT p.warehouse_id 
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'head', 'manager', 'ops', 'worker')
    )
  )
  WITH CHECK (
    warehouse_id IN (
      SELECT p.warehouse_id 
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'head', 'manager', 'ops', 'worker')
    )
    -- Worker cannot change target_picking_cell_id
    AND (
      -- If user is worker, target_picking_cell_id must not change
      NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'worker'
      )
      OR target_picking_cell_id = (SELECT target_picking_cell_id FROM public.picking_tasks WHERE id = picking_tasks.id)
    )
  );

-- 3. Comments for documentation
-- ============================================
COMMENT ON TABLE public.picking_tasks IS 'Tasks for workers to move units from storage/shipping to picking cells';
COMMENT ON COLUMN public.picking_tasks.from_cell_id IS 'Snapshot of unit current cell at task creation time (can be NULL)';
COMMENT ON COLUMN public.picking_tasks.target_picking_cell_id IS 'Target picking cell (cell_type must be picking)';
COMMENT ON COLUMN public.picking_tasks.scenario IS 'Optional scenario description';
COMMENT ON COLUMN public.picking_tasks.status IS 'Task status: open -> in_progress -> done (or canceled)';
COMMENT ON COLUMN public.picking_tasks.picked_by IS 'User who started picking (status -> in_progress)';
COMMENT ON COLUMN public.picking_tasks.completed_by IS 'User who completed task (status -> done)';

-- 4. Reload PostgREST schema cache
-- ============================================
NOTIFY pgrst, 'reload schema';
