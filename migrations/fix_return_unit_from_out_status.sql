-- =====================================================
-- FIX: return_unit_from_out - правильный маппинг cell_type → status
-- =====================================================
-- Исправляет функцию return_unit_from_out, чтобы она правильно
-- устанавливала статус unit в соответствии с новым маппингом:
-- storage → "stored" (не "storage")
-- shipping → "shipping" (остается)

CREATE OR REPLACE FUNCTION public.return_unit_from_out(
  p_shipment_id uuid,
  p_target_cell_code text,
  p_return_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warehouse_id uuid;
  v_user_id uuid;
  v_user_role text;
  v_shipment record;
  v_target_cell record;
  v_unit record;
  v_to_status text;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get user profile
  SELECT warehouse_id, role INTO v_warehouse_id, v_user_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Only logistics, admin, head can return
  IF v_user_role NOT IN ('logistics', 'admin', 'head') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: insufficient permissions');
  END IF;

  -- Get shipment
  SELECT * INTO v_shipment
  FROM public.outbound_shipments
  WHERE id = p_shipment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Shipment not found');
  END IF;

  -- Verify shipment belongs to same warehouse
  IF v_shipment.warehouse_id != v_warehouse_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Shipment belongs to different warehouse');
  END IF;

  -- Verify shipment is still OUT
  IF v_shipment.status != 'out' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Shipment already returned');
  END IF;

  -- Get target cell (must be storage or shipping)
  SELECT * INTO v_target_cell
  FROM public.warehouse_cells
  WHERE warehouse_id = v_warehouse_id
    AND code = upper(trim(p_target_cell_code))
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target cell not found: ' || p_target_cell_code);
  END IF;

  -- Verify target cell is storage or shipping
  IF v_target_cell.cell_type NOT IN ('storage', 'shipping') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target cell must be storage or shipping. Got: ' || v_target_cell.cell_type);
  END IF;

  -- Map cell_type to unit_status
  IF v_target_cell.cell_type = 'storage' THEN
    v_to_status := 'stored';
  ELSIF v_target_cell.cell_type = 'shipping' THEN
    v_to_status := 'shipping';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid cell type: ' || v_target_cell.cell_type);
  END IF;

  -- Get unit
  SELECT * INTO v_unit
  FROM public.units
  WHERE id = v_shipment.unit_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit not found');
  END IF;

  -- Update shipment: mark as returned
  UPDATE public.outbound_shipments
  SET 
    status = 'returned',
    returned_by = v_user_id,
    returned_at = now(),
    return_reason = p_return_reason,
    updated_at = now()
  WHERE id = p_shipment_id;

  -- Update unit: move to target cell, set status according to cell_type
  UPDATE public.units
  SET 
    cell_id = v_target_cell.id,
    status = v_to_status, -- Правильный статус: stored или shipping
    updated_at = now()
  WHERE id = v_shipment.unit_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'shipment_id', p_shipment_id,
    'unit_id', v_unit.id,
    'unit_barcode', v_unit.barcode,
    'target_cell_code', v_target_cell.code,
    'target_cell_type', v_target_cell.cell_type,
    'unit_status', v_to_status
  );
END;
$$;
