-- ============================================
-- WMS Inventory: Автоматические задания на ячейки
-- ============================================
-- Обновляет логику инвентаризации:
-- 1. При старте создаются задания на все активные ячейки
-- 2. При сканировании ячейки задание отмечается как выполненное
-- 3. Автоматическое закрытие когда все задания выполнены

-- 1. Обновить RPC inventory_start: создавать задания на все ячейки
-- ============================================
CREATE OR REPLACE FUNCTION public.inventory_start()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_role text;
  v_session_id uuid;
  v_started_at timestamptz;
  v_tasks_created int := 0;
BEGIN
  -- Get user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse and role
  SELECT warehouse_id, role INTO v_warehouse_id, v_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Check role
  IF v_role NOT IN ('admin', 'head', 'manager') THEN
    RETURN json_build_object('ok', false, 'error', 'Forbidden: Only admin/head/manager can start inventory');
  END IF;

  -- Check if inventory is already active
  IF EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = v_warehouse_id AND inventory_active = true
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'Inventory is already active');
  END IF;

  -- Create session
  INSERT INTO public.inventory_sessions (
    warehouse_id,
    status,
    started_by,
    started_at
  ) VALUES (
    v_warehouse_id,
    'active',
    v_user_id,
    now()
  )
  RETURNING id, started_at INTO v_session_id, v_started_at;

  -- Update warehouse
  UPDATE public.warehouses
  SET inventory_active = true,
      inventory_session_id = v_session_id
  WHERE id = v_warehouse_id;

  -- ✨ НОВОЕ: Создать задания на все активные ячейки
  INSERT INTO public.inventory_cell_counts (
    session_id,
    cell_id,
    scanned_by,
    status
  )
  SELECT 
    v_session_id,
    wc.id,
    v_user_id, -- Создатель сессии указан как scanned_by для pending заданий
    'pending'::text
  FROM public.warehouse_cells wc
  WHERE wc.warehouse_id = v_warehouse_id
    AND wc.is_active = true;

  GET DIAGNOSTICS v_tasks_created = ROW_COUNT;

  -- Audit log
  INSERT INTO public.audit_events (
    warehouse_id,
    action,
    entity_type,
    entity_id,
    actor_user_id,
    summary,
    meta
  ) VALUES (
    v_warehouse_id,
    'inventory.start',
    'inventory_session',
    v_session_id,
    v_user_id,
    format('Начата инвентаризация: создано %s заданий', v_tasks_created),
    jsonb_build_object(
      'session_id', v_session_id,
      'tasks_created', v_tasks_created
    )
  );

  RETURN json_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'startedAt', v_started_at,
    'tasksCreated', v_tasks_created
  );
END;
$$;

-- 2. Обновить RPC inventory_stop: проверка завершения всех заданий
-- ============================================
CREATE OR REPLACE FUNCTION public.inventory_stop()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_warehouse_id uuid;
  v_role text;
  v_session_id uuid;
  v_pending_count int;
BEGIN
  -- Get user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Get warehouse and role
  SELECT warehouse_id, role INTO v_warehouse_id, v_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Warehouse not assigned');
  END IF;

  -- Check role
  IF v_role NOT IN ('admin', 'head', 'manager') THEN
    RETURN json_build_object('ok', false, 'error', 'Forbidden: Only admin/head/manager can stop inventory');
  END IF;

  -- Check if inventory is active
  SELECT inventory_session_id INTO v_session_id
  FROM public.warehouses
  WHERE id = v_warehouse_id AND inventory_active = true;

  IF v_session_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Inventory is not active');
  END IF;

  -- ✨ НОВОЕ: Проверить есть ли незавершенные задания
  SELECT COUNT(*) INTO v_pending_count
  FROM public.inventory_cell_counts
  WHERE session_id = v_session_id
    AND status = 'pending';

  -- Close session
  UPDATE public.inventory_sessions
  SET status = 'closed',
      closed_by = v_user_id,
      closed_at = now()
  WHERE id = v_session_id;

  -- Update warehouse
  UPDATE public.warehouses
  SET inventory_active = false,
      inventory_session_id = NULL
  WHERE id = v_warehouse_id;

  -- Audit log
  INSERT INTO public.audit_events (
    warehouse_id,
    action,
    entity_type,
    entity_id,
    actor_user_id,
    summary,
    meta
  ) VALUES (
    v_warehouse_id,
    'inventory.stop',
    'inventory_session',
    v_session_id,
    v_user_id,
    format('Завершена инвентаризация: осталось %s невыполненных заданий', v_pending_count),
    jsonb_build_object(
      'session_id', v_session_id,
      'pending_tasks', v_pending_count
    )
  );

  RETURN json_build_object(
    'ok', true,
    'pendingTasks', v_pending_count
  );
END;
$$;

-- 3. Создать функцию для автоматической проверки и закрытия
-- ============================================
CREATE OR REPLACE FUNCTION public.inventory_check_and_auto_close(p_session_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_pending_count int;
  v_total_count int;
  v_session_active boolean;
BEGIN
  -- Get session info
  SELECT warehouse_id, status = 'active' INTO v_warehouse_id, v_session_active
  FROM public.inventory_sessions
  WHERE id = p_session_id;

  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Session not found');
  END IF;

  IF NOT v_session_active THEN
    RETURN json_build_object('ok', false, 'error', 'Session is not active');
  END IF;

  -- Count pending and total tasks
  SELECT 
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*)
  INTO v_pending_count, v_total_count
  FROM public.inventory_cell_counts
  WHERE session_id = p_session_id;

  -- If all tasks are completed, auto-close
  IF v_pending_count = 0 AND v_total_count > 0 THEN
    -- Close session
    UPDATE public.inventory_sessions
    SET status = 'closed',
        closed_at = now()
    WHERE id = p_session_id;

    -- Update warehouse
    UPDATE public.warehouses
    SET inventory_active = false,
        inventory_session_id = NULL
    WHERE id = v_warehouse_id;

    -- Audit log
    INSERT INTO public.audit_events (
      warehouse_id,
      action,
      entity_type,
      entity_id,
      summary,
      meta
    ) VALUES (
      v_warehouse_id,
      'inventory.auto_close',
      'inventory_session',
      p_session_id,
      'Инвентаризация автоматически завершена: все задания выполнены',
      jsonb_build_object(
        'session_id', p_session_id,
        'total_tasks', v_total_count,
        'auto_closed', true
      )
    );

    RETURN json_build_object(
      'ok', true,
      'autoClosed', true,
      'totalTasks', v_total_count
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'autoClosed', false,
    'pendingTasks', v_pending_count,
    'totalTasks', v_total_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_check_and_auto_close(uuid) TO authenticated;

-- 4. Создать RPC для получения списка заданий (для менеджера)
-- ============================================
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

GRANT EXECUTE ON FUNCTION public.inventory_get_tasks(uuid) TO authenticated;

-- 5. Comments
-- ============================================
COMMENT ON FUNCTION public.inventory_start IS 'Запускает инвентаризацию и создает задания на все активные ячейки';
COMMENT ON FUNCTION public.inventory_stop IS 'Завершает инвентаризацию вручную (даже если есть невыполненные задания)';
COMMENT ON FUNCTION public.inventory_check_and_auto_close IS 'Проверяет завершение всех заданий и автоматически закрывает инвентаризацию';
COMMENT ON FUNCTION public.inventory_get_tasks IS 'Получает список заданий инвентаризации и информацию о сессии (работает для активных и завершенных сессий)';

-- Reload schema
NOTIFY pgrst, 'reload schema';
