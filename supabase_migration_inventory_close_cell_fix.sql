-- ============================================
-- WMS Inventory: Fix inventory_close_cell function
-- ============================================
-- This function applies scanned barcodes to actual units.cell_id
-- ADDED: units with scanned barcodes that are NOT in cell -> set cell_id to target cell
-- REMOVED: units in cell that are NOT in scanned barcodes -> set cell_id to NULL
--
-- IMPORTANT: This function updates units table, not just inventory tracking tables

CREATE OR REPLACE FUNCTION public.inventory_close_cell(
  p_cell_code text,
  p_scanned_barcodes jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_cell_id uuid;
  v_cell RECORD;
  v_session_id uuid;
  v_barcode text;
  v_unit_id uuid;
  v_scanned_barcode text;
  v_current_unit_id uuid;
  v_current_barcode text;
  v_added_count integer := 0;
  v_removed_count integer := 0;
  v_added_barcodes text[] := ARRAY[]::text[];
  v_removed_barcodes text[] := ARRAY[]::text[];
  v_normalized_barcode text;
  v_from_cell_id uuid;
  v_unit_status text;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse from user profile
  SELECT warehouse_id INTO v_warehouse_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Normalize cell code (uppercase, trim, remove "CELL:" prefix)
  v_cell_id := NULL;
  SELECT id, code, warehouse_id INTO v_cell
  FROM public.warehouse_cells
  WHERE warehouse_id = v_warehouse_id
    AND UPPER(TRIM(REPLACE(code, 'CELL:', ''))) = UPPER(TRIM(REPLACE(p_cell_code, 'CELL:', '')))
  LIMIT 1;

  IF v_cell IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Cell not found: ' || p_cell_code);
  END IF;

  v_cell_id := v_cell.id;

  -- Verify cell belongs to warehouse (double check)
  IF v_cell.warehouse_id != v_warehouse_id THEN
    RETURN json_build_object('ok', false, 'error', 'Cell belongs to different warehouse');
  END IF;

  -- Check if inventory is active and get session_id
  SELECT inventory_session_id INTO v_session_id
  FROM public.warehouses
  WHERE id = v_warehouse_id AND inventory_active = true;

  IF v_session_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Inventory is not active');
  END IF;

  -- Step 1: ADDED - units with scanned barcodes that are NOT currently in this cell
  FOR v_scanned_barcode IN SELECT jsonb_array_elements_text(p_scanned_barcodes)
  LOOP
    -- Normalize barcode: digits only (same as normalizeBarcode in TypeScript)
    v_normalized_barcode := regexp_replace(v_scanned_barcode, '[^0-9]', '', 'g');
    
    IF v_normalized_barcode != '' THEN
      -- Find unit by barcode in warehouse
      SELECT id INTO v_unit_id
      FROM public.units
      WHERE warehouse_id = v_warehouse_id
        AND barcode = v_normalized_barcode
      LIMIT 1;

      -- If unit doesn't exist, create it (like in receiving/scan)
      IF v_unit_id IS NULL THEN
        -- Create new unit with this barcode
        INSERT INTO public.units (
          barcode,
          warehouse_id,
          status,
          cell_id
        ) VALUES (
          v_normalized_barcode,
          v_warehouse_id,
          'inventory_hold'::public.unit_status,
          v_cell_id
        )
        RETURNING id INTO v_unit_id;

        -- If unit creation succeeded, add audit log
        IF v_unit_id IS NOT NULL THEN
          -- Audit log for creation
          INSERT INTO public.unit_moves (
            warehouse_id,
            unit_id,
            from_cell_id,
            to_cell_id,
            moved_by,
            source,
            note
          ) VALUES (
            v_warehouse_id,
            v_unit_id,
            NULL,
            v_cell_id,
            v_user_id,
            'inventory',
            'Создано во время инвентаризации'
          );

          v_added_count := v_added_count + 1;
          v_added_barcodes := array_append(v_added_barcodes, v_normalized_barcode);
        END IF;
      ELSE
        -- Unit exists - check if it's NOT in this cell, then add it
        IF NOT EXISTS (
          SELECT 1 FROM public.units
          WHERE id = v_unit_id AND cell_id = v_cell_id
        ) THEN
          -- ADD: Move unit to this cell
          SELECT cell_id INTO v_from_cell_id
          FROM public.units
          WHERE id = v_unit_id;

          UPDATE public.units
          SET cell_id = v_cell_id
          WHERE id = v_unit_id;

          -- Audit log
          INSERT INTO public.unit_moves (
            warehouse_id,
            unit_id,
            from_cell_id,
            to_cell_id,
            moved_by,
            source
          ) VALUES (
            v_warehouse_id,
            v_unit_id,
            v_from_cell_id,
            v_cell_id,
            v_user_id,
            'inventory'
          );

          v_added_count := v_added_count + 1;
          v_added_barcodes := array_append(v_added_barcodes, v_normalized_barcode);
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Step 2: REMOVED - units currently in this cell that are NOT in scanned barcodes
  FOR v_current_unit_id, v_current_barcode IN 
    SELECT id, barcode
    FROM public.units
    WHERE warehouse_id = v_warehouse_id
      AND cell_id = v_cell_id
      AND barcode IS NOT NULL
      AND barcode != ''
  LOOP
    -- Check if this barcode is in scanned list (normalized)
    v_normalized_barcode := v_current_barcode;
    
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_scanned_barcodes) AS scanned_barcode
      WHERE regexp_replace(scanned_barcode, '[^0-9]', '', 'g') = v_normalized_barcode
    ) THEN
      -- REMOVE: Set cell_id to NULL
      UPDATE public.units
      SET cell_id = NULL
      WHERE id = v_current_unit_id;

      -- Audit log
      INSERT INTO public.unit_moves (
        warehouse_id,
        unit_id,
        from_cell_id,
        to_cell_id,
        moved_by,
        source
      ) VALUES (
        v_warehouse_id,
        v_current_unit_id,
        v_cell_id,
        NULL,
        v_user_id,
        'inventory'
      );

      v_removed_count := v_removed_count + 1;
      v_removed_barcodes := array_append(v_removed_barcodes, v_current_barcode);
    END IF;
  END LOOP;

  -- Update inventory_cell_counts status to 'confirmed'
  UPDATE public.inventory_cell_counts
  SET status = 'confirmed'
  WHERE session_id = v_session_id
    AND cell_id = v_cell_id;

  RETURN json_build_object(
    'ok', true,
    'cellId', v_cell_id,
    'cellCode', v_cell.code,
    'sessionId', v_session_id,
    'added', v_added_count,
    'removed', v_removed_count,
    'addedBarcodes', v_added_barcodes,
    'removedBarcodes', v_removed_barcodes
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'ok', false,
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'added', v_added_count,
      'removed', v_removed_count,
      'cellCode', p_cell_code,
      'scannedBarcodesCount', jsonb_array_length(p_scanned_barcodes)
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.inventory_close_cell(text, jsonb) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Add comment
COMMENT ON FUNCTION public.inventory_close_cell IS 'Closes inventory cell by applying scanned barcodes to actual units.cell_id. ADDED: creates/moves units to cell. REMOVED: removes units from cell (sets cell_id to NULL). Returns count of added/removed units.';
