-- =====================================================
-- ИСПРАВЛЕНИЕ: Триггер audit_trigger_unit_moves
-- Заменяем actor_user_id на moved_by
-- =====================================================

DROP TRIGGER IF EXISTS trigger_audit_unit_moves ON public.unit_moves;

CREATE OR REPLACE FUNCTION public.audit_trigger_unit_moves()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_barcode text;
  v_from_cell_code text;
  v_to_cell_code text;
  v_summary text;
  v_meta jsonb;
  v_actor_name text;
  v_actor_role text;
  v_full_name text;
BEGIN
  -- Get unit barcode
  SELECT barcode INTO v_unit_barcode
  FROM public.units
  WHERE id = NEW.unit_id;

  -- Get cell codes
  SELECT code INTO v_from_cell_code
  FROM public.warehouse_cells
  WHERE id = NEW.from_cell_id;

  SELECT code INTO v_to_cell_code
  FROM public.warehouse_cells
  WHERE id = NEW.to_cell_id;

  -- Get actor name and role from profile
  SELECT full_name, role INTO v_full_name, v_actor_role
  FROM public.profiles
  WHERE id = NEW.moved_by  -- ИСПРАВЛЕНО: было actor_user_id
  LIMIT 1;

  -- Set actor_name: use full_name if not empty, otherwise fallback to user_id
  v_actor_name := NULLIF(trim(COALESCE(v_full_name, '')), '');
  IF v_actor_name IS NULL THEN
    v_actor_name := NEW.moved_by::text;  -- ИСПРАВЛЕНО: было actor_user_id
  END IF;

  -- Build summary
  v_summary := format('Перемещение unit %s', COALESCE(v_unit_barcode, NEW.unit_id::text));
  IF v_from_cell_code IS NOT NULL OR v_to_cell_code IS NOT NULL THEN
    v_summary := v_summary || format(' из %s в %s', 
      COALESCE(v_from_cell_code, 'NULL'), 
      COALESCE(v_to_cell_code, 'NULL')
    );
  END IF;

  -- Build meta (include source, note if present)
  v_meta := jsonb_build_object(
    'from_cell_id', NEW.from_cell_id,
    'to_cell_id', NEW.to_cell_id,
    'from_cell', v_from_cell_code,
    'to_cell', v_to_cell_code,
    'moved_by', NEW.moved_by,  -- ИСПРАВЛЕНО: было actor_user_id
    'source', NEW.source,
    'note', NEW.note
  );

  -- If NEW.meta exists, merge it
  IF NEW.meta IS NOT NULL THEN
    v_meta := v_meta || NEW.meta;
  END IF;

  -- Insert audit event
  INSERT INTO public.audit_events (
    warehouse_id,
    actor_user_id,  -- колонка в audit_events называется actor_user_id
    actor_role,
    actor_name,
    action,
    entity_type,
    entity_id,
    summary,
    meta
  ) VALUES (
    NEW.warehouse_id,
    NEW.moved_by,  -- ИСПРАВЛЕНО: было NEW.actor_user_id
    v_actor_role,
    v_actor_name,
    'unit.move',
    'unit',
    NEW.unit_id,
    v_summary,
    v_meta
  );

  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER trigger_audit_unit_moves
  AFTER INSERT ON public.unit_moves
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_unit_moves();

-- =====================================================
-- Теперь триггер использует NEW.moved_by вместо NEW.actor_user_id
-- =====================================================
