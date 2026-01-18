-- =====================================================
-- MIGRATION: Unit Enhancements
-- Добавляет расширенную информацию для units:
-- - Фотографии
-- - Цена, название товара, партнер
-- - Улучшенные логи перемещений
-- =====================================================

-- 1. Добавляем новые поля в units
-- =====================================================
ALTER TABLE public.units 
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS partner_name text,
  ADD COLUMN IF NOT EXISTS price numeric(10, 2),
  ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;

-- Комментарии для документации
COMMENT ON COLUMN public.units.product_name IS 'Название товара';
COMMENT ON COLUMN public.units.partner_name IS 'Название партнера (мерча)';
COMMENT ON COLUMN public.units.price IS 'Цена товара';
COMMENT ON COLUMN public.units.photos IS 'Массив фотографий: [{"url": "...", "uploaded_at": "...", "uploaded_by": "..."}]';
COMMENT ON COLUMN public.units.meta IS 'Дополнительная информация в формате JSON';

-- 2. Обновляем таблицу unit_moves для детальных логов
-- =====================================================
ALTER TABLE public.unit_moves
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.unit_moves.note IS 'Описание перемещения (авто-генерируется)';
COMMENT ON COLUMN public.unit_moves.meta IS 'Дополнительная информация о перемещении (курьер, задача, и т.д.)';

-- 3. Создаем функцию для получения детальной истории unit
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_unit_history(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_warehouse_id uuid;
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get user's warehouse
  SELECT warehouse_id INTO v_warehouse_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Build comprehensive history from multiple sources
  WITH unit_info AS (
    SELECT 
      u.id,
      u.barcode,
      u.product_name,
      u.partner_name,
      u.price,
      u.status,
      u.created_at,
      u.warehouse_id,
      c.code as current_cell_code
    FROM public.units u
    LEFT JOIN public.warehouse_cells c ON c.id = u.cell_id
    WHERE u.id = p_unit_id
  ),
  moves_history AS (
    SELECT
      'move' as event_type,
      um.created_at,
      um.from_status,
      um.to_status,
      fc.code as from_cell_code,
      tc.code as to_cell_code,
      p.full_name as actor_name,
      p.role as actor_role,
      um.note,
      um.meta
    FROM public.unit_moves um
    LEFT JOIN public.warehouse_cells fc ON fc.id = um.from_cell_id
    LEFT JOIN public.warehouse_cells tc ON tc.id = um.to_cell_id
    LEFT JOIN public.profiles p ON p.id = um.actor_user_id
    WHERE um.unit_id = p_unit_id
  ),
  audit_history AS (
    SELECT
      'audit' as event_type,
      ae.created_at,
      ae.action,
      ae.summary,
      p.full_name as actor_name,
      p.role as actor_role,
      ae.meta
    FROM public.audit_events ae
    LEFT JOIN public.profiles p ON p.id = ae.actor_user_id
    WHERE ae.entity_id = p_unit_id
      AND ae.entity_type = 'unit'
  ),
  outbound_history AS (
    SELECT
      'shipment' as event_type,
      os.out_at as created_at,
      os.status,
      os.courier_name,
      p1.full_name as shipped_by_name,
      p2.full_name as returned_by_name,
      os.return_reason,
      os.returned_at
    FROM public.outbound_shipments os
    LEFT JOIN public.profiles p1 ON p1.id = os.out_by
    LEFT JOIN public.profiles p2 ON p2.id = os.returned_by
    WHERE os.unit_id = p_unit_id
  ),
  all_events AS (
    SELECT 
      event_type,
      created_at,
      jsonb_build_object(
        'from_status', from_status,
        'to_status', to_status,
        'from_cell', from_cell_code,
        'to_cell', to_cell_code,
        'actor_name', actor_name,
        'actor_role', actor_role,
        'note', note,
        'meta', meta
      ) as details
    FROM moves_history
    
    UNION ALL
    
    SELECT
      event_type,
      created_at,
      jsonb_build_object(
        'action', action,
        'summary', summary,
        'actor_name', actor_name,
        'actor_role', actor_role,
        'meta', meta
      ) as details
    FROM audit_history
    
    UNION ALL
    
    SELECT
      event_type,
      created_at,
      jsonb_build_object(
        'status', status,
        'courier_name', courier_name,
        'shipped_by', shipped_by_name,
        'returned_by', returned_by_name,
        'return_reason', return_reason,
        'returned_at', returned_at
      ) as details
    FROM outbound_history
  )
  SELECT jsonb_build_object(
    'ok', true,
    'unit', (SELECT row_to_json(unit_info.*) FROM unit_info),
    'history', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'event_type', event_type,
          'created_at', created_at,
          'details', details
        ) ORDER BY created_at DESC
      )
      FROM all_events
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_unit_history TO authenticated;

-- 4. Создаем индексы для производительности
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_units_product_name ON public.units(product_name);
CREATE INDEX IF NOT EXISTS idx_units_partner_name ON public.units(partner_name);
CREATE INDEX IF NOT EXISTS idx_units_price ON public.units(price);
CREATE INDEX IF NOT EXISTS idx_unit_moves_note ON public.unit_moves USING gin(to_tsvector('russian', note));

-- 5. Обновляем RLS политики (если нужно)
-- =====================================================
-- Units уже имеет RLS политики, новые поля автоматически покрываются

-- =====================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================
