-- =====================================================
-- LOGISTICS FLOW: OUT shipments and returns
-- =====================================================
-- This migration adds logistics functionality on top of existing picking flow
-- WITHOUT breaking existing ops/worker/picking functionality

-- =====================================================
-- 1. TABLE: outbound_shipments
-- =====================================================
-- Tracks units that have been shipped OUT (outside warehouse)
-- and can be returned back to warehouse

CREATE TABLE IF NOT EXISTS public.outbound_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  
  -- Courier information
  courier_name text NOT NULL,
  
  -- OUT details
  out_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  out_at timestamptz NOT NULL DEFAULT now(),
  
  -- Return details (NULL if not yet returned)
  returned_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  returned_at timestamptz,
  return_reason text,
  
  -- Status: 'out' (shipped), 'returned' (returned to warehouse)
  status text NOT NULL DEFAULT 'out' CHECK (status IN ('out', 'returned')),
  
  -- Metadata for extensibility
  meta jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_outbound_shipments_warehouse ON public.outbound_shipments(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_outbound_shipments_unit ON public.outbound_shipments(unit_id);
CREATE INDEX IF NOT EXISTS idx_outbound_shipments_status ON public.outbound_shipments(status);
CREATE INDEX IF NOT EXISTS idx_outbound_shipments_out_by ON public.outbound_shipments(out_by);
CREATE INDEX IF NOT EXISTS idx_outbound_shipments_out_at ON public.outbound_shipments(out_at DESC);

-- Ensure one active OUT shipment per unit (prevent duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_shipments_unit_active 
  ON public.outbound_shipments(unit_id) 
  WHERE status = 'out';

-- =====================================================
-- 2. RLS POLICIES for outbound_shipments
-- =====================================================
-- Only logistics, admin, head, manager can see and manage shipments

ALTER TABLE public.outbound_shipments ENABLE ROW LEVEL SECURITY;

-- SELECT: logistics, admin, head, manager, ops can view shipments in their warehouse
CREATE POLICY outbound_shipments_select_policy ON public.outbound_shipments
  FOR SELECT
  USING (
    warehouse_id IN (
      SELECT warehouse_id 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role IN ('logistics', 'admin', 'head', 'manager', 'ops')
    )
  );

-- INSERT: only logistics, admin, head can create shipments
CREATE POLICY outbound_shipments_insert_policy ON public.outbound_shipments
  FOR INSERT
  WITH CHECK (
    warehouse_id IN (
      SELECT warehouse_id 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role IN ('logistics', 'admin', 'head')
    )
  );

-- UPDATE: only logistics, admin, head can update shipments (for returns)
CREATE POLICY outbound_shipments_update_policy ON public.outbound_shipments
  FOR UPDATE
  USING (
    warehouse_id IN (
      SELECT warehouse_id 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role IN ('logistics', 'admin', 'head')
    )
  )
  WITH CHECK (
    warehouse_id IN (
      SELECT warehouse_id 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role IN ('logistics', 'admin', 'head')
    )
  );

-- =====================================================
-- 3. RPC FUNCTION: ship_unit_out
-- =====================================================
-- Ships a unit from picking cell to OUT status
-- Called by logistics role

CREATE OR REPLACE FUNCTION public.ship_unit_out(
  p_unit_id uuid,
  p_courier_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  -- Only logistics, admin, head can ship
  IF v_user_role NOT IN ('logistics', 'admin', 'head') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: insufficient permissions');
  END IF;

  -- Validate courier_name
  IF p_courier_name IS NULL OR trim(p_courier_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Courier name is required');
  END IF;

  -- Get unit and verify it's in picking cell
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

  -- Verify unit is in picking cell
  IF v_unit.cell_type != 'picking' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit must be in picking cell. Current cell type: ' || COALESCE(v_unit.cell_type, 'none'));
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
$$;

-- =====================================================
-- 4. RPC FUNCTION: return_unit_from_out
-- =====================================================
-- Returns a unit from OUT status back to storage cell
-- Called by logistics role

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

  -- Update unit: move to target cell, set status to storage/shipping
  UPDATE public.units
  SET 
    cell_id = v_target_cell.id,
    status = v_target_cell.cell_type, -- storage or shipping
    updated_at = now()
  WHERE id = v_shipment.unit_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'shipment_id', p_shipment_id,
    'unit_id', v_unit.id,
    'unit_barcode', v_unit.barcode,
    'target_cell_code', v_target_cell.code,
    'target_cell_type', v_target_cell.cell_type
  );
END;
$$;

-- =====================================================
-- 5. GRANT EXECUTE on RPC functions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.ship_unit_out TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_unit_from_out TO authenticated;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
