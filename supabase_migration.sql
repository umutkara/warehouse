-- ============================================
-- WMS Production Hardening: Single Source of Truth for Moves
-- ============================================

-- 1. Create unit_moves audit log table
-- ============================================
CREATE TABLE IF NOT EXISTS public.unit_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  from_cell_id uuid REFERENCES public.warehouse_cells(id) ON DELETE SET NULL,
  to_cell_id uuid REFERENCES public.warehouse_cells(id) ON DELETE SET NULL,
  from_status text,
  to_status text,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_unit_moves_unit_id ON public.unit_moves(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_moves_warehouse_id ON public.unit_moves(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_unit_moves_created_at ON public.unit_moves(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unit_moves_actor_user_id ON public.unit_moves(actor_user_id);

-- RLS policies
ALTER TABLE public.unit_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view moves from their warehouse"
  ON public.unit_moves FOR SELECT
  USING (
    warehouse_id IN (
      SELECT warehouse_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 2. Recreate warehouse_cells_map view with stable columns
-- ============================================
CREATE OR REPLACE VIEW public.warehouse_cells_map AS
SELECT 
  c.id,
  c.warehouse_id,
  c.code,
  c.cell_type,
  c.x,
  c.y,
  c.w,
  c.h,
  c.is_active,
  c.meta,
  COALESCE(COUNT(u.id), 0)::integer AS units_count,
  CASE 
    WHEN c.meta->>'capacity' IS NOT NULL 
      AND COALESCE(COUNT(u.id), 0) >= (c.meta->>'capacity')::integer 
    THEN true
    ELSE false
  END AS is_full,
  CASE
    WHEN c.is_active = false THEN 'inactive'
    WHEN c.meta->>'blocked' = 'true' OR (c.meta->>'blocked')::boolean = true THEN 'blocked'
    WHEN c.meta->>'capacity' IS NOT NULL 
      AND COALESCE(COUNT(u.id), 0) >= (c.meta->>'capacity')::integer 
    THEN 'full'
    WHEN COALESCE(COUNT(u.id), 0) = 0 THEN 'empty'
    ELSE 'available'
  END AS calc_status
FROM public.warehouse_cells c
LEFT JOIN public.units u ON u.cell_id = c.id
GROUP BY c.id, c.warehouse_id, c.code, c.cell_type, c.x, c.y, c.w, c.h, c.is_active, c.meta;

-- Grant access
GRANT SELECT ON public.warehouse_cells_map TO authenticated;

-- 3. Create move_unit RPC function (SECURITY DEFINER)
-- ============================================
CREATE OR REPLACE FUNCTION public.move_unit(
  p_unit_id uuid,
  p_to_status text,
  p_to_cell_id uuid DEFAULT NULL
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.move_unit(uuid, text, uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.move_unit IS 'Single source of truth for unit moves. Handles validation, cell selection, status updates, and audit logging.';

-- 4. Create move_unit_to_cell RPC function for real cell-to-cell moves
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

  -- Determine final status: if p_to_status is NULL, keep existing status
  IF p_to_status IS NULL THEN
    v_final_status := v_unit_record.status;
  ELSE
    v_final_status := p_to_status;
  END IF;

  -- Update units table
  UPDATE public.units
  SET cell_id = p_to_cell_id,
      status = v_final_status
  WHERE id = p_unit_id;

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
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.move_unit_to_cell(uuid, uuid, public.unit_status) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.move_unit_to_cell IS 'Moves a unit between real cells. Updates cell_id and optionally status. Validates warehouse ownership and cell availability.';
