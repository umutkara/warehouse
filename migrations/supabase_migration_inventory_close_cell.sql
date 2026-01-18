-- ============================================
-- WMS Inventory: RPC function to save cell scan
-- ============================================
-- This RPC function bypasses PostgREST schema cache issues
-- by using direct SQL instead of table operations

CREATE OR REPLACE FUNCTION public.inventory_save_cell_scan(
  p_session_id uuid,
  p_cell_id uuid,
  p_scanned_by uuid,
  p_unit_barcodes jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_barcode text;
  v_unit_id uuid;
BEGIN
  -- Get user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Verify scanned_by matches authenticated user
  IF p_scanned_by != v_user_id THEN
    RETURN json_build_object('ok', false, 'error', 'Forbidden: scanned_by must match authenticated user');
  END IF;

  -- Get warehouse from session
  SELECT warehouse_id INTO v_warehouse_id
  FROM public.inventory_sessions
  WHERE id = p_session_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Session not found');
  END IF;

  -- Verify user belongs to warehouse
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND warehouse_id = v_warehouse_id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'Forbidden: user does not belong to warehouse');
  END IF;

  -- Upsert inventory_cell_counts (using direct SQL to bypass schema cache)
  INSERT INTO public.inventory_cell_counts (
    session_id,
    cell_id,
    scanned_by,
    scanned_at,
    status,
    meta
  ) VALUES (
    p_session_id,
    p_cell_id,
    p_scanned_by,
    now(),
    'scanned',
    '{}'::jsonb
  )
  ON CONFLICT (session_id, cell_id)
  DO UPDATE SET
    scanned_by = p_scanned_by,
    scanned_at = now(),
    status = 'scanned';

  -- Delete old inventory_cell_units for this cell
  DELETE FROM public.inventory_cell_units
  WHERE session_id = p_session_id
    AND cell_id = p_cell_id;

  -- Insert new inventory_cell_units
  FOR v_barcode IN SELECT jsonb_array_elements_text(p_unit_barcodes)
  LOOP
    -- Try to find unit by barcode
    SELECT id INTO v_unit_id
    FROM public.units
    WHERE warehouse_id = v_warehouse_id
      AND barcode = v_barcode
    LIMIT 1;

    -- Insert unit record
    INSERT INTO public.inventory_cell_units (
      session_id,
      cell_id,
      unit_id,
      unit_barcode
    ) VALUES (
      p_session_id,
      p_cell_id,
      v_unit_id,
      v_barcode
    )
    ON CONFLICT (session_id, cell_id, unit_barcode) DO NOTHING;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'sessionId', p_session_id,
    'cellId', p_cell_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_save_cell_scan(uuid, uuid, uuid, jsonb) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
