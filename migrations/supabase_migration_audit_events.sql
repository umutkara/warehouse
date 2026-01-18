-- ============================================
-- WMS Audit Events: Complete Activity Log
-- ============================================
-- Single source of truth for all system activities
-- Tracks: unit moves, unit creation, inventory, picking tasks, cell changes

-- 1. Create audit_events table
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  summary text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_events_warehouse_id ON public.audit_events(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON public.audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user_id ON public.audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity_type ON public.audit_events(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity_id ON public.audit_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events(action);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_events_warehouse_created ON public.audit_events(warehouse_id, created_at DESC);

-- 2. Enable RLS
-- ============================================
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Only users from same warehouse can view
CREATE POLICY "Users can view audit events from their warehouse"
  ON public.audit_events FOR SELECT
  USING (
    warehouse_id IN (
      SELECT warehouse_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- INSERT policy: Block direct inserts from client
-- All inserts must go through SECURITY DEFINER RPC function or triggers
-- This prevents users from manipulating audit logs

-- 3. Create SECURITY DEFINER RPC function
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_log_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_summary text DEFAULT '',
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_role text;
  v_event_id uuid;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse and role from profile
  SELECT warehouse_id, role INTO v_warehouse_id, v_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Insert audit event
  INSERT INTO public.audit_events (
    warehouse_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  ) VALUES (
    v_warehouse_id,
    v_user_id,
    v_role,
    p_action,
    p_entity_type,
    p_entity_id,
    COALESCE(p_summary, ''),
    COALESCE(p_meta, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN json_build_object('ok', true, 'id', v_event_id);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.audit_log_event(text, text, uuid, text, jsonb) TO authenticated;

-- Comment
COMMENT ON FUNCTION public.audit_log_event IS 'Logs an audit event. Requires authenticated user. Automatically sets warehouse_id and actor from user profile.';

-- 4. Create trigger function for unit_moves
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_trigger_unit_moves()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_barcode text;
  v_from_cell_code text;
  v_to_cell_code text;
  v_summary text;
  v_meta jsonb;
BEGIN
  -- Get unit barcode
  SELECT barcode INTO v_unit_barcode
  FROM public.units
  WHERE id = NEW.unit_id;

  -- Get cell codes
  IF NEW.from_cell_id IS NOT NULL THEN
    SELECT code INTO v_from_cell_code
    FROM public.warehouse_cells
    WHERE id = NEW.from_cell_id;
  END IF;

  IF NEW.to_cell_id IS NOT NULL THEN
    SELECT code INTO v_to_cell_code
    FROM public.warehouse_cells
    WHERE id = NEW.to_cell_id;
  END IF;

  -- Build summary
  v_summary := format('Перемещение unit %s', COALESCE(v_unit_barcode, NEW.unit_id::text));
  IF v_from_cell_code IS NOT NULL OR v_to_cell_code IS NOT NULL THEN
    v_summary := v_summary || format(' из %s в %s', 
      COALESCE(v_from_cell_code, 'NULL'), 
      COALESCE(v_to_cell_code, 'NULL')
    );
  END IF;

  -- Build meta
  v_meta := jsonb_build_object(
    'from_cell_id', NEW.from_cell_id,
    'to_cell_id', NEW.to_cell_id,
    'from_status', NEW.from_status,
    'to_status', NEW.to_status,
    'actor_user_id', NEW.actor_user_id
  );

  -- Insert audit event
  INSERT INTO public.audit_events (
    warehouse_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  )
  SELECT
    NEW.warehouse_id,
    NEW.actor_user_id,
    p.role,
    'unit.move',
    'unit',
    NEW.unit_id,
    v_summary,
    v_meta
  FROM public.profiles p
  WHERE p.id = NEW.actor_user_id
  LIMIT 1;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_audit_unit_moves ON public.unit_moves;
CREATE TRIGGER trigger_audit_unit_moves
  AFTER INSERT ON public.unit_moves
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_unit_moves();

-- 5. Create trigger function for picking_tasks
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_trigger_picking_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_barcode text;
  v_target_cell_code text;
  v_action text;
  v_summary text;
  v_meta jsonb;
  v_actor_user_id uuid;
  v_actor_role text;
BEGIN
  -- Determine action based on status change
  IF TG_OP = 'INSERT' THEN
    v_action := 'task.create';
    v_actor_user_id := NEW.created_by;
    v_actor_role := (SELECT role FROM public.profiles WHERE id = NEW.created_by LIMIT 1);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'open' AND NEW.status = 'in_progress' THEN
      v_action := 'task.start';
      v_actor_user_id := COALESCE(NEW.picked_by, auth.uid());
    ELSIF NEW.status = 'done' AND OLD.status != 'done' THEN
      v_action := 'task.done';
      v_actor_user_id := COALESCE(NEW.completed_by, auth.uid());
    ELSIF NEW.status = 'canceled' AND OLD.status != 'canceled' THEN
      v_action := 'task.canceled';
      v_actor_user_id := COALESCE(NEW.completed_by, auth.uid());
    ELSE
      -- No significant status change, skip audit
      RETURN NEW;
    END IF;
    
    IF v_actor_role IS NULL THEN
      SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor_user_id LIMIT 1;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Get unit barcode
  SELECT barcode INTO v_unit_barcode
  FROM public.units
  WHERE id = NEW.unit_id;

  -- Get target cell code
  SELECT code INTO v_target_cell_code
  FROM public.warehouse_cells
  WHERE id = NEW.target_picking_cell_id;

  -- Build summary
  v_summary := format('Задание %s: unit %s -> ячейка %s',
    CASE v_action
      WHEN 'task.create' THEN 'создано'
      WHEN 'task.start' THEN 'начато'
      WHEN 'task.done' THEN 'выполнено'
      WHEN 'task.canceled' THEN 'отменено'
      ELSE v_action
    END,
    COALESCE(v_unit_barcode, NEW.unit_id::text),
    COALESCE(v_target_cell_code, NEW.target_picking_cell_id::text)
  );

  -- Build meta
  v_meta := jsonb_build_object(
    'unit_id', NEW.unit_id,
    'from_cell_id', NEW.from_cell_id,
    'target_picking_cell_id', NEW.target_picking_cell_id,
    'scenario', NEW.scenario,
    'status', NEW.status,
    'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
  );

  -- Insert audit event
  INSERT INTO public.audit_events (
    warehouse_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  ) VALUES (
    NEW.warehouse_id,
    v_actor_user_id,
    v_actor_role,
    v_action,
    'picking_task',
    NEW.id,
    v_summary,
    v_meta
  );

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_audit_picking_tasks ON public.picking_tasks;
CREATE TRIGGER trigger_audit_picking_tasks
  AFTER INSERT OR UPDATE ON public.picking_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_picking_tasks();

-- 6. Create trigger function for inventory_sessions
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_trigger_inventory_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_summary text;
  v_meta jsonb;
  v_actor_user_id uuid;
  v_actor_role text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'inventory.start';
    v_actor_user_id := NEW.started_by;
    v_summary := format('Инвентаризация начата');
    v_meta := jsonb_build_object(
      'session_id', NEW.id,
      'started_at', NEW.started_at
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status = 'closed' THEN
    v_action := 'inventory.stop';
    v_actor_user_id := COALESCE(NEW.closed_by, auth.uid());
    v_summary := format('Инвентаризация завершена');
    v_meta := jsonb_build_object(
      'session_id', NEW.id,
      'started_at', NEW.started_at,
      'closed_at', NEW.closed_at
    );
  ELSE
    RETURN NEW;
  END IF;

  -- Get actor role
  SELECT role INTO v_actor_role
  FROM public.profiles
  WHERE id = v_actor_user_id
  LIMIT 1;

  -- Insert audit event
  INSERT INTO public.audit_events (
    warehouse_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  ) VALUES (
    NEW.warehouse_id,
    v_actor_user_id,
    v_actor_role,
    v_action,
    'inventory_session',
    NEW.id,
    v_summary,
    v_meta
  );

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_audit_inventory_sessions ON public.inventory_sessions;
CREATE TRIGGER trigger_audit_inventory_sessions
  AFTER INSERT OR UPDATE ON public.inventory_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_inventory_sessions();

-- 7. Comments for documentation
-- ============================================
COMMENT ON TABLE public.audit_events IS 'Complete audit log of all system activities';
COMMENT ON COLUMN public.audit_events.warehouse_id IS 'Warehouse this event belongs to';
COMMENT ON COLUMN public.audit_events.actor_user_id IS 'User who performed the action';
COMMENT ON COLUMN public.audit_events.actor_role IS 'Role of actor at time of event (snapshot)';
COMMENT ON COLUMN public.audit_events.action IS 'Action type (e.g. unit.move, unit.create, inventory.start)';
COMMENT ON COLUMN public.audit_events.entity_type IS 'Entity type (unit, cell, inventory_session, picking_task)';
COMMENT ON COLUMN public.audit_events.entity_id IS 'ID of affected entity';
COMMENT ON COLUMN public.audit_events.summary IS 'Human-readable description for UI';
COMMENT ON COLUMN public.audit_events.meta IS 'Full event data (JSONB)';

-- 8. Reload PostgREST schema cache
-- ============================================
NOTIFY pgrst, 'reload schema';
