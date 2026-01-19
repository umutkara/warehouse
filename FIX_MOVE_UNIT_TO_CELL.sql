-- =====================================================
-- ИСПРАВЛЕНИЕ: Обновление функции move_unit_to_cell
-- Добавляем поддержку p_note, p_source, p_meta
-- =====================================================

DROP FUNCTION IF EXISTS public.move_unit_to_cell(uuid, uuid, public.unit_status);

CREATE OR REPLACE FUNCTION public.move_unit_to_cell(
  p_unit_id uuid,
  p_to_cell_id uuid,
  p_to_status public.unit_status DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_source text DEFAULT 'api',
  p_meta jsonb DEFAULT NULL
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

  -- Insert into unit_moves with new fields (moved_by instead of actor_user_id)
  INSERT INTO public.unit_moves (
    warehouse_id,
    unit_id,
    from_cell_id,
    to_cell_id,
    moved_by,
    source,
    note,
    meta,
    created_at
  ) VALUES (
    v_warehouse_id,
    p_unit_id,
    v_from_cell_id,
    p_to_cell_id,
    v_user_id,
    COALESCE(p_source, 'api'),
    p_note,
    p_meta,
    now()
  );

  RETURN json_build_object(
    'ok', true,
    'unit_id', p_unit_id,
    'from_cell_id', v_from_cell_id,
    'to_cell_id', p_to_cell_id,
    'from_status', v_from_status,
    'to_status', v_final_status::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_unit_to_cell(uuid, uuid, public.unit_status, text, text, jsonb) TO authenticated;

-- =====================================================
-- Теперь функция поддерживает:
-- - p_note (примечание к перемещению)
-- - p_source (источник: 'tsd', 'api', 'wms')
-- - p_meta (дополнительные метаданные JSONB)
-- =====================================================
