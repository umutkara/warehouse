-- ============================================
-- WMS Inventory Mode: Block moves during inventory
-- ============================================

-- 1. Add inventory fields to warehouses table
-- ============================================
ALTER TABLE public.warehouses
ADD COLUMN IF NOT EXISTS inventory_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.warehouses
ADD COLUMN IF NOT EXISTS inventory_session_id uuid NULL;

-- 2. Create inventory_sessions table
-- ============================================
CREATE TABLE IF NOT EXISTS public.inventory_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('active', 'closed')),
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_sessions_warehouse_id ON public.inventory_sessions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_status ON public.inventory_sessions(status);

-- RLS for inventory_sessions
ALTER TABLE public.inventory_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory sessions from their warehouse"
  ON public.inventory_sessions FOR SELECT
  USING (
    warehouse_id IN (
      SELECT warehouse_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 3. Create inventory_start RPC function
-- ============================================
CREATE OR REPLACE FUNCTION public.inventory_start()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_role text;
  v_session_id uuid;
  v_started_at timestamptz;
BEGIN
  -- Get user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse and role
  SELECT warehouse_id, role INTO v_warehouse_id, v_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Check role
  IF v_role NOT IN ('admin', 'head', 'manager') THEN
    RETURN json_build_object('ok', false, 'error', 'Forbidden: Only admin/head/manager can start inventory');
  END IF;

  -- Check if inventory is already active
  IF EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = v_warehouse_id AND inventory_active = true
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'Inventory is already active');
  END IF;

  -- Create session
  INSERT INTO public.inventory_sessions (
    warehouse_id,
    status,
    started_by,
    started_at
  ) VALUES (
    v_warehouse_id,
    'active',
    v_user_id,
    now()
  )
  RETURNING id, started_at INTO v_session_id, v_started_at;

  -- Update warehouse
  UPDATE public.warehouses
  SET inventory_active = true,
      inventory_session_id = v_session_id
  WHERE id = v_warehouse_id;

  RETURN json_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'startedAt', v_started_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_start() TO authenticated;

-- 4. Create inventory_stop RPC function
-- ============================================
CREATE OR REPLACE FUNCTION public.inventory_stop()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_role text;
  v_session_id uuid;
BEGIN
  -- Get user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse and role
  SELECT warehouse_id, role INTO v_warehouse_id, v_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Check role
  IF v_role NOT IN ('admin', 'head', 'manager') THEN
    RETURN json_build_object('ok', false, 'error', 'Forbidden: Only admin/head/manager can stop inventory');
  END IF;

  -- Check if inventory is active
  SELECT inventory_session_id INTO v_session_id
  FROM public.warehouses
  WHERE id = v_warehouse_id AND inventory_active = true;

  IF v_session_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Inventory is not active');
  END IF;

  -- Close session
  UPDATE public.inventory_sessions
  SET status = 'closed',
      closed_by = v_user_id,
      closed_at = now()
  WHERE id = v_session_id;

  -- Update warehouse
  UPDATE public.warehouses
  SET inventory_active = false,
      inventory_session_id = NULL
  WHERE id = v_warehouse_id;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_stop() TO authenticated;

-- 5. Create inventory_status RPC function
-- ============================================
CREATE OR REPLACE FUNCTION public.inventory_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_active boolean;
  v_session_id uuid;
  v_session RECORD;
BEGIN
  -- Get user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse
  SELECT warehouse_id INTO v_warehouse_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Get warehouse inventory status
  SELECT inventory_active, inventory_session_id 
  INTO v_active, v_session_id
  FROM public.warehouses
  WHERE id = v_warehouse_id;

  -- If no session_id on warehouse, try to find the most recent session
  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM public.inventory_sessions
    WHERE warehouse_id = v_warehouse_id
    ORDER BY started_at DESC
    LIMIT 1;
  END IF;

  -- If still no session found, return inactive with no session
  IF v_session_id IS NULL THEN
    RETURN json_build_object(
      'ok', true,
      'active', false,
      'sessionId', NULL,
      'startedBy', NULL,
      'startedAt', NULL
    );
  END IF;

  -- Get session details (active or closed)
  SELECT started_by, started_at INTO v_session
  FROM public.inventory_sessions
  WHERE id = v_session_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'ok', true,
      'active', false,
      'sessionId', NULL,
      'startedBy', NULL,
      'startedAt', NULL
    );
  END IF;

  -- Return status with sessionId (даже если неактивна)
  RETURN json_build_object(
    'ok', true,
    'active', COALESCE(v_active, false),
    'sessionId', v_session_id,
    'startedBy', v_session.started_by,
    'startedAt', v_session.started_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_status() TO authenticated;

-- 6. Update move_unit function to check inventory
-- ============================================
CREATE OR REPLACE FUNCTION public.move_unit(
  p_unit_id uuid,
  p_to_status public.unit_status,
  p_to_cell_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_unit_record RECORD;
  v_from_cell_id uuid;
  v_from_status text;
  v_target_cell RECORD;
  v_actual_cell_id uuid;
  v_cell_type text;
BEGIN
  -- Use provided user_id or fall back to auth.uid()
  v_user_id := COALESCE(p_actor_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  SELECT warehouse_id INTO v_warehouse_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- CHECK INVENTORY: Block moves if inventory is active
  IF EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = v_warehouse_id AND inventory_active = true
  ) THEN
    RAISE EXCEPTION 'INVENTORY_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  -- Get unit and ensure it belongs to same warehouse
  SELECT id, warehouse_id, cell_id, status INTO v_unit_record
  FROM public.units
  WHERE id = p_unit_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Unit not found');
  END IF;

  IF v_unit_record.warehouse_id != v_warehouse_id THEN
    RETURN json_build_object('ok', false, 'error', 'Unit belongs to different warehouse');
  END IF;

  v_from_cell_id := v_unit_record.cell_id;
  v_from_status := v_unit_record.status::text;

  -- Determine required cell_type based on target status
  IF p_to_status = 'stored'::public.unit_status THEN
    v_cell_type := 'storage';
  ELSIF p_to_status = 'shipped'::public.unit_status THEN
    v_cell_type := 'shipping';
  ELSIF p_to_status = 'picking'::public.unit_status THEN
    v_cell_type := NULL; -- No cell required for picking
  ELSE
    RETURN json_build_object('ok', false, 'error', format('Invalid target status: %s', p_to_status::text));
  END IF;

  -- Handle cell selection/validation
  IF v_cell_type IS NOT NULL THEN
    -- Cell is required for this status
    IF p_to_cell_id IS NOT NULL THEN
      -- Use provided cell
      SELECT c.id, c.warehouse_id, c.is_active, c.cell_type, c.meta, cm.calc_status
      INTO v_target_cell
      FROM public.warehouse_cells c
      JOIN public.warehouse_cells_map cm ON cm.id = c.id
      WHERE c.id = p_to_cell_id;

      IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'error', 'Target cell not found');
      END IF;

      IF v_target_cell.warehouse_id != v_warehouse_id THEN
        RETURN json_build_object('ok', false, 'error', 'Target cell belongs to different warehouse');
      END IF;

      IF v_target_cell.is_active = false THEN
        RETURN json_build_object('ok', false, 'error', 'Target cell is inactive');
      END IF;

      IF v_target_cell.cell_type != v_cell_type THEN
        RETURN json_build_object('ok', false, 'error', format('Target cell must be type %s, got %s', v_cell_type, v_target_cell.cell_type));
      END IF;

      IF v_target_cell.calc_status IN ('blocked', 'inactive', 'full') THEN
        RETURN json_build_object('ok', false, 'error', format('Target cell is %s', v_target_cell.calc_status));
      END IF;

      v_actual_cell_id := p_to_cell_id;
    ELSE
      -- Auto-pick first available cell
      SELECT cm.id INTO v_actual_cell_id
      FROM public.warehouse_cells_map cm
      WHERE cm.warehouse_id = v_warehouse_id
        AND cm.cell_type = v_cell_type
        AND cm.is_active = true
        AND cm.calc_status NOT IN ('blocked', 'inactive', 'full')
      ORDER BY cm.code
      LIMIT 1;

      IF v_actual_cell_id IS NULL THEN
        RETURN json_build_object('ok', false, 'error', format('No available %s cells found', v_cell_type));
      END IF;
    END IF;
  ELSE
    -- No cell required (picking status)
    v_actual_cell_id := NULL;
  END IF;

  -- Update units table
  IF v_actual_cell_id IS NOT NULL THEN
    UPDATE public.units
    SET status = p_to_status,
        cell_id = v_actual_cell_id
    WHERE id = p_unit_id;
  ELSE
    -- Only update status, keep existing cell_id
    UPDATE public.units
    SET status = p_to_status
    WHERE id = p_unit_id;
  END IF;

  -- Insert audit log
  INSERT INTO public.unit_moves (
    warehouse_id,
    unit_id,
    from_cell_id,
    to_cell_id,
    from_status,
    to_status,
    actor_user_id
  ) VALUES (
    v_warehouse_id,
    p_unit_id,
    v_from_cell_id,
    v_actual_cell_id,
    v_from_status,
    p_to_status::text,
    v_user_id
  );

  -- Return success
  RETURN json_build_object(
    'ok', true,
    'unitId', p_unit_id,
    'toCellId', v_actual_cell_id,
    'toStatus', p_to_status::text
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    -- INVENTORY_ACTIVE exception - re-raise with same message
    RAISE;
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 7. Update move_unit_to_cell function to check inventory
-- ============================================
CREATE OR REPLACE FUNCTION public.move_unit_to_cell(
  p_unit_id uuid,
  p_to_cell_id uuid,
  p_to_status public.unit_status DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_unit_record RECORD;
  v_from_cell_id uuid;
  v_from_status text;
  v_target_cell RECORD;
  v_final_status public.unit_status;
BEGIN
  -- Resolve auth.uid() -> profiles.warehouse_id
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  SELECT warehouse_id INTO v_warehouse_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- CHECK INVENTORY: Block moves if inventory is active
  IF EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = v_warehouse_id AND inventory_active = true
  ) THEN
    RAISE EXCEPTION 'INVENTORY_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  -- Get unit and ensure it belongs to same warehouse
  SELECT id, warehouse_id, cell_id, status INTO v_unit_record
  FROM public.units
  WHERE id = p_unit_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Unit not found');
  END IF;

  IF v_unit_record.warehouse_id != v_warehouse_id THEN
    RETURN json_build_object('ok', false, 'error', 'Unit belongs to different warehouse');
  END IF;

  v_from_cell_id := v_unit_record.cell_id;
  v_from_status := v_unit_record.status::text;

  -- Get target cell and validate
  SELECT id, warehouse_id, is_active, cell_type, meta INTO v_target_cell
  FROM public.warehouse_cells
  WHERE id = p_to_cell_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Target cell not found');
  END IF;

  IF v_target_cell.warehouse_id != v_warehouse_id THEN
    RETURN json_build_object('ok', false, 'error', 'Target cell belongs to different warehouse');
  END IF;

  IF v_target_cell.is_active = false THEN
    RETURN json_build_object('ok', false, 'error', 'Target cell is inactive');
  END IF;

  -- Check if cell is blocked
  IF v_target_cell.meta->>'blocked' = 'true' OR (v_target_cell.meta->>'blocked')::boolean = true THEN
    RETURN json_build_object('ok', false, 'error', 'Target cell is blocked');
  END IF;

  -- Update units table
  -- If status is NULL, don't touch it at all
  IF p_to_status IS NULL THEN
    UPDATE public.units
    SET cell_id = p_to_cell_id
    WHERE id = p_unit_id;
    v_final_status := v_unit_record.status;
  ELSE
    UPDATE public.units
    SET cell_id = p_to_cell_id,
        status = p_to_status
    WHERE id = p_unit_id;
    v_final_status := p_to_status;
  END IF;

  -- Insert audit log
  INSERT INTO public.unit_moves (
    warehouse_id,
    unit_id,
    from_cell_id,
    to_cell_id,
    from_status,
    to_status,
    actor_user_id
  ) VALUES (
    v_warehouse_id,
    p_unit_id,
    v_from_cell_id,
    p_to_cell_id,
    v_from_status,
    v_final_status::text,
    v_user_id
  );

  -- Return success with toStatus cast to text
  RETURN json_build_object(
    'ok', true,
    'unitId', p_unit_id,
    'fromCellId', v_from_cell_id,
    'toCellId', p_to_cell_id,
    'toStatus', v_final_status::text
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    -- INVENTORY_ACTIVE exception - re-raise with same message
    RAISE;
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.move_unit_to_cell(uuid, uuid, public.unit_status) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.move_unit_to_cell IS 'Moves a unit between cells. Updates cell_id and optionally status. If p_to_status is NULL, status is not changed. Validates warehouse ownership, cell availability, and inventory mode.';

-- Grant execute permission for move_unit (legacy, kept for compatibility)
GRANT EXECUTE ON FUNCTION public.move_unit(uuid, public.unit_status, uuid, uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.move_unit IS 'Legacy function for unit moves. Requires status parameter. Validates warehouse ownership, cell selection, and inventory mode.';
