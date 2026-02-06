-- Migration: ensure move_unit_to_cell always updates units.cell_id and units.status
-- so that moves to rejected (and any other cell) are reflected everywhere (list, map, TSD).
-- Run in Supabase SQL Editor or via: supabase db push

-- If the function already exists with different logic, this replaces it.
-- Return type: JSON with { ok, error?, unitId, fromCellId, toCellId, toStatus }

CREATE OR REPLACE FUNCTION move_unit_to_cell(
  p_unit_id uuid,
  p_to_cell_id uuid,
  p_to_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit record;
  v_from_cell_id uuid;
  v_to_cell record;
  v_new_status text;
  v_warehouse_id uuid;
  v_inventory_active boolean;
BEGIN
  -- 1) Load unit
  SELECT id, warehouse_id, cell_id
    INTO v_unit
    FROM units
   WHERE id = p_unit_id;

  IF v_unit.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unit not found');
  END IF;

  v_from_cell_id := v_unit.cell_id;
  v_warehouse_id := v_unit.warehouse_id;

  -- 2) Load target cell (warehouse_cells_map supports all cell types including rejected)
  SELECT id, warehouse_id, cell_type, is_active
    INTO v_to_cell
    FROM warehouse_cells_map
   WHERE id = p_to_cell_id;

  IF v_to_cell.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Target cell not found');
  END IF;

  IF v_to_cell.warehouse_id IS DISTINCT FROM v_warehouse_id THEN
    RETURN json_build_object('ok', false, 'error', 'Target cell belongs to different warehouse');
  END IF;

  IF v_to_cell.is_active = false THEN
    RETURN json_build_object('ok', false, 'error', 'Target cell is inactive');
  END IF;

  -- 3) Optional: block moves when inventory is active (if your schema has warehouses.inventory_active)
  BEGIN
    SELECT inventory_active INTO v_inventory_active
      FROM warehouses
     WHERE id = v_warehouse_id;
    IF v_inventory_active = true THEN
      RETURN json_build_object('ok', false, 'error', 'INVENTORY_ACTIVE: movements are blocked during inventory');
    END IF;
  EXCEPTION
    WHEN undefined_column OR undefined_table THEN
      NULL; -- no warehouses.inventory_active, skip
  END;

  -- 4) Resolve new status: use p_to_status if provided, else derive from cell_type
  IF p_to_status IS NOT NULL AND p_to_status <> '' THEN
    v_new_status := p_to_status;
  ELSE
    v_new_status := CASE v_to_cell.cell_type
      WHEN 'bin'     THEN 'bin'
      WHEN 'storage' THEN 'stored'
      WHEN 'shipping' THEN 'shipping'
      WHEN 'picking' THEN 'picking'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'ff'      THEN 'ff'
      WHEN 'surplus' THEN 'stored'
      ELSE 'stored'
    END;
  END IF;

  -- 5) Always update units.cell_id and units.status (this is the fix for rejected / any cell)
  UPDATE units
     SET cell_id = p_to_cell_id,
         status  = v_new_status
   WHERE id = p_unit_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Unit update failed');
  END IF;

  -- 6) Return success (API expects ok, unitId, fromCellId, toCellId, toStatus)
  RETURN json_build_object(
    'ok', true,
    'unitId', p_unit_id,
    'fromCellId', v_from_cell_id,
    'toCellId', p_to_cell_id,
    'toStatus', v_new_status
  );
END;
$$;

COMMENT ON FUNCTION move_unit_to_cell(uuid, uuid, text) IS
  'Moves a unit to a cell. Always updates units.cell_id and units.status so that rejected and other moves are visible everywhere.';
