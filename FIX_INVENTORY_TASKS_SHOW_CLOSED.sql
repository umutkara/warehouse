-- =====================================================
-- FIX: Разрешить просмотр отчетов завершённой инвентаризации
-- =====================================================
-- Дата: 2026-01-19
-- Описание: Обновление RPC функций для возвращения информации о сессии
--           (статус, даты начала/завершения) чтобы можно было просматривать
--           отчеты и после завершения инвентаризации
-- =====================================================

-- 1. Обновляем inventory_status() чтобы возвращать sessionId даже для завершенной инвентаризации
CREATE OR REPLACE FUNCTION public.inventory_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_active boolean;
  v_session_id uuid;
  v_session RECORD;
BEGIN
  -- Get user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse
  SELECT warehouse_id INTO v_warehouse_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Get warehouse inventory status
  SELECT inventory_active, inventory_session_id 
  INTO v_active, v_session_id
  FROM public.warehouses
  WHERE id = v_warehouse_id;

  -- If no session_id on warehouse, try to find the most recent session
  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM public.inventory_sessions
    WHERE warehouse_id = v_warehouse_id
    ORDER BY started_at DESC
    LIMIT 1;
  END IF;

  -- If still no session found, return inactive with no session
  IF v_session_id IS NULL THEN
    RETURN json_build_object(
      'ok', true,
      'active', false,
      'sessionId', NULL,
      'startedBy', NULL,
      'startedAt', NULL
    );
  END IF;

  -- Get session details (active or closed)
  SELECT started_by, started_at INTO v_session
  FROM public.inventory_sessions
  WHERE id = v_session_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'ok', true,
      'active', false,
      'sessionId', NULL,
      'startedBy', NULL,
      'startedAt', NULL
    );
  END IF;

  -- Return status with sessionId (даже если неактивна)
  RETURN json_build_object(
    'ok', true,
    'active', COALESCE(v_active, false),
    'sessionId', v_session_id,
    'startedBy', v_session.started_by,
    'startedAt', v_session.started_at
  );
END;
$$;

COMMENT ON FUNCTION public.inventory_status IS 'Возвращает статус инвентаризации (включая sessionId для активных и завершенных сессий)';

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.inventory_status() TO authenticated;

-- 2. Обновляем inventory_get_tasks()

-- Обновляем RPC функцию inventory_get_tasks
CREATE OR REPLACE FUNCTION public.inventory_get_tasks(p_session_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_session_id uuid;
  v_result json;
BEGIN
  -- Get user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse
  SELECT warehouse_id INTO v_warehouse_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- If session_id not provided, get active session OR last session
  IF p_session_id IS NULL THEN
    SELECT inventory_session_id INTO v_session_id
    FROM public.warehouses
    WHERE id = v_warehouse_id;

    -- If still null, try to get most recent session
    IF v_session_id IS NULL THEN
      SELECT id INTO v_session_id
      FROM public.inventory_sessions
      WHERE warehouse_id = v_warehouse_id
      ORDER BY started_at DESC
      LIMIT 1;
    END IF;

    IF v_session_id IS NULL THEN
      RETURN json_build_object('ok', false, 'error', 'No inventory sessions found');
    END IF;
  ELSE
    v_session_id := p_session_id;
  END IF;

  -- Verify session belongs to warehouse
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_sessions
    WHERE id = v_session_id AND warehouse_id = v_warehouse_id
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'Session not found or access denied');
  END IF;

  -- Get session info and tasks with cell info
  SELECT json_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'sessionStatus', (SELECT status FROM public.inventory_sessions WHERE id = v_session_id),
    'sessionStartedAt', (SELECT started_at FROM public.inventory_sessions WHERE id = v_session_id),
    'sessionClosedAt', (SELECT closed_at FROM public.inventory_sessions WHERE id = v_session_id),
    'tasks', COALESCE(json_agg(
      json_build_object(
        'id', icc.id,
        'cellId', icc.cell_id,
        'cellCode', wc.code,
        'cellType', wc.cell_type,
        'status', icc.status,
        'scannedBy', icc.scanned_by,
        'scannedAt', icc.scanned_at,
        'scannedByName', p.full_name
      ) ORDER BY wc.code
    ), '[]'::json)
  ) INTO v_result
  FROM public.inventory_cell_counts icc
  INNER JOIN public.warehouse_cells wc ON wc.id = icc.cell_id
  LEFT JOIN public.profiles p ON p.id = icc.scanned_by
  WHERE icc.session_id = v_session_id;

  RETURN v_result;
END;
$$;

-- Обновляем комментарий
COMMENT ON FUNCTION public.inventory_get_tasks IS 'Получает список заданий инвентаризации и информацию о сессии (работает для активных и завершенных сессий)';

-- Перезагружаем схему PostgREST (если используется)
NOTIFY pgrst, 'reload schema';
