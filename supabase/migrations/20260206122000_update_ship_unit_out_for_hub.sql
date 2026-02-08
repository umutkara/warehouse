-- Allow hub_worker to ship out and permit BIN for hub flow
CREATE OR REPLACE FUNCTION public.ship_unit_out(p_unit_id uuid, p_courier_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_warehouse_id uuid;
  v_user_id uuid;
  v_user_role text;
  v_unit record;
  v_shipment_id uuid;
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

  -- Only logistics, admin, head, hub_worker can ship
  IF v_user_role NOT IN ('logistics', 'admin', 'head', 'hub_worker') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: insufficient permissions');
  END IF;

  -- Validate courier_name
  IF p_courier_name IS NULL OR trim(p_courier_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Courier name is required');
  END IF;

  -- Get unit and verify cell
  SELECT u.id, u.barcode, u.cell_id, u.status, u.warehouse_id,
         c.code as cell_code, c.cell_type
  INTO v_unit
  FROM public.units u
  LEFT JOIN public.warehouse_cells c ON c.id = u.cell_id
  WHERE u.id = p_unit_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit not found');
  END IF;

  -- Verify unit belongs to same warehouse
  IF v_unit.warehouse_id != v_warehouse_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit belongs to different warehouse');
  END IF;

  -- Verify unit is in correct cell for role
  IF v_user_role = 'hub_worker' THEN
    IF v_unit.cell_type NOT IN ('bin', 'picking') THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'Unit must be in BIN or picking cell. Current cell type: ' || COALESCE(v_unit.cell_type, 'none')
      );
    END IF;
  ELSE
    IF v_unit.cell_type != 'picking' THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'Unit must be in picking cell. Current cell type: ' || COALESCE(v_unit.cell_type, 'none')
      );
    END IF;
  END IF;

  -- Check if unit already has active OUT shipment
  IF EXISTS (
    SELECT 1 FROM public.outbound_shipments
    WHERE unit_id = p_unit_id AND status = 'out'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit already shipped OUT');
  END IF;

  -- Create outbound shipment record
  INSERT INTO public.outbound_shipments (
    warehouse_id,
    unit_id,
    courier_name,
    out_by,
    status
  ) VALUES (
    v_warehouse_id,
    p_unit_id,
    trim(p_courier_name),
    v_user_id,
    'out'
  )
  RETURNING id INTO v_shipment_id;

  -- Update unit: remove from cell, set status to 'out'
  UPDATE public.units
  SET
    cell_id = NULL,
    status = 'out',
    updated_at = now()
  WHERE id = p_unit_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'shipment_id', v_shipment_id,
    'unit_id', p_unit_id,
    'unit_barcode', v_unit.barcode,
    'courier_name', trim(p_courier_name)
  );
END;
$function$;
