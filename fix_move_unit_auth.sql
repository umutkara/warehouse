-- Fix move_unit function to accept explicit user_id parameter
-- This is needed because auth.uid() doesn't work in RPC calls via Next.js server client

CREATE OR REPLACE FUNCTION public.move_unit(
  p_unit_id uuid,
  p_to_status text,
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
  v_from_status := v_unit_record.status;

  -- Determine required cell_type based on target status
  IF p_to_status = 'stored' THEN
    v_cell_type := 'storage';
  ELSIF p_to_status = 'shipped' THEN
    v_cell_type := 'shipping';
  ELSIF p_to_status = 'picking' THEN
    v_cell_type := NULL; -- No cell required for picking
  ELSE
    RETURN json_build_object('ok', false, 'error', format('Invalid target status: %s', p_to_status));
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
    p_to_status,
    v_user_id
  );

  -- Return success
  RETURN json_build_object(
    'ok', true,
    'unitId', p_unit_id,
    'toCellId', v_actual_cell_id,
    'toStatus', p_to_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Update function comment
COMMENT ON FUNCTION public.move_unit IS 'Single source of truth for unit moves. Handles validation, cell selection, status updates, and audit logging. Accepts optional p_actor_user_id for server-side calls.';
