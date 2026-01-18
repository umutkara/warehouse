-- ============================================
-- WMS Audit Events: Add actor_name (snapshot of profiles.full_name)
-- ============================================
-- This migration adds actor_name field to store snapshot of user's full_name
-- at the time of event, so archive doesn't break if full_name is changed later

-- 1. Add actor_name column to audit_events
-- ============================================
ALTER TABLE public.audit_events
ADD COLUMN IF NOT EXISTS actor_name text NULL;

-- Index for actor_name (optional, for filtering/searching by name)
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_name ON public.audit_events(actor_name) WHERE actor_name IS NOT NULL;

-- 2. Update RPC function audit_log_event to save full_name
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
  v_full_name text;
  v_actor_name text;
  v_event_id uuid;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse, role, and full_name from profile
  SELECT warehouse_id, role, full_name INTO v_warehouse_id, v_role, v_full_name
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Set actor_name: use full_name if not empty, otherwise fallback to user_id
  v_actor_name := NULLIF(trim(COALESCE(v_full_name, '')), '');
  IF v_actor_name IS NULL THEN
    v_actor_name := v_user_id::text;
  END IF;

  -- Insert audit event
  INSERT INTO public.audit_events (
    warehouse_id,
    actor_user_id,
    actor_role,
    actor_name,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  ) VALUES (
    v_warehouse_id,
    v_user_id,
    v_role,
    v_actor_name,
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

-- 3. Update trigger function for unit_moves to save actor_name
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
  v_actor_name text;
  v_actor_role text;
  v_full_name text;
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

  -- Get actor name and role from profile
  SELECT full_name, role INTO v_full_name, v_actor_role
  FROM public.profiles
  WHERE id = NEW.actor_user_id
  LIMIT 1;

  -- Set actor_name: use full_name if not empty, otherwise fallback to user_id
  v_actor_name := NULLIF(trim(COALESCE(v_full_name, '')), '');
  IF v_actor_name IS NULL THEN
    v_actor_name := NEW.actor_user_id::text;
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
    actor_name,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  ) VALUES (
    NEW.warehouse_id,
    NEW.actor_user_id,
    v_actor_role,
    v_actor_name,
    'unit.move',
    'unit',
    NEW.unit_id,
    v_summary,
    v_meta
  );

  RETURN NEW;
END;
$$;

-- 4. Update trigger function for picking_tasks to save actor_name
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
  v_actor_name text;
  v_full_name text;
BEGIN
  -- Determine action based on status change
  IF TG_OP = 'INSERT' THEN
    v_action := 'task.create';
    v_actor_user_id := NEW.created_by;
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
  ELSE
    RETURN NEW;
  END IF;

  -- Get actor name and role from profile
  SELECT full_name, role INTO v_full_name, v_actor_role
  FROM public.profiles
  WHERE id = v_actor_user_id
  LIMIT 1;

  -- Set actor_name: use full_name if not empty, otherwise fallback to user_id
  v_actor_name := NULLIF(trim(COALESCE(v_full_name, '')), '');
  IF v_actor_name IS NULL THEN
    v_actor_name := v_actor_user_id::text;
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
    actor_name,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  ) VALUES (
    NEW.warehouse_id,
    v_actor_user_id,
    v_actor_role,
    v_actor_name,
    v_action,
    'picking_task',
    NEW.id,
    v_summary,
    v_meta
  );

  RETURN NEW;
END;
$$;

-- 5. Update trigger function for inventory_sessions to save actor_name
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
  v_actor_name text;
  v_full_name text;
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

  -- Get actor name and role from profile
  SELECT full_name, role INTO v_full_name, v_actor_role
  FROM public.profiles
  WHERE id = v_actor_user_id
  LIMIT 1;

  -- Set actor_name: use full_name if not empty, otherwise fallback to user_id
  v_actor_name := NULLIF(trim(COALESCE(v_full_name, '')), '');
  IF v_actor_name IS NULL THEN
    v_actor_name := v_actor_user_id::text;
  END IF;

  -- Insert audit event
  INSERT INTO public.audit_events (
    warehouse_id,
    actor_user_id,
    actor_role,
    actor_name,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  ) VALUES (
    NEW.warehouse_id,
    v_actor_user_id,
    v_actor_role,
    v_actor_name,
    v_action,
    'inventory_session',
    NEW.id,
    v_summary,
    v_meta
  );

  RETURN NEW;
END;
$$;

-- 6. Comments for documentation
-- ============================================
COMMENT ON COLUMN public.audit_events.actor_name IS 'Snapshot of user full_name at the time of event (fallback to user_id if full_name is empty)';

-- 7. Reload PostgREST schema cache
-- ============================================
NOTIFY pgrst, 'reload schema';
