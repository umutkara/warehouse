-- ============================================
-- FIX: Добавить warehouse_id и created_by в inventory_start()
-- ============================================
-- Проблема: таблица inventory_cell_counts имеет колонки warehouse_id и created_by (NOT NULL),
-- но функция inventory_start() их не заполняет

-- Проверить структуру таблицы можно так:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'inventory_cell_counts' AND table_schema = 'public';

-- Вариант 1: Если колонка warehouse_id НУЖНА в таблице
-- ============================================

-- Обновляем функцию inventory_start() - добавляем warehouse_id
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

  -- ✅ ИСПРАВЛЕНО: Добавляем warehouse_id и created_by в INSERT
  INSERT INTO public.inventory_cell_counts (
    session_id,
    cell_id,
    warehouse_id,  -- ← ДОБАВЛЕНО
    scanned_by,
    created_by,    -- ← ДОБАВЛЕНО (кто создал задание)
    status
  )
  SELECT 
    v_session_id,
    wc.id,
    v_warehouse_id,  -- ← ДОБАВЛЕНО
    v_user_id,
    v_user_id,       -- ← ДОБАВЛЕНО (тот кто запустил инвентаризацию)
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

-- Вариант 2: Если колонка warehouse_id НЕ НУЖНА в таблице
-- ============================================
-- Раскомментируйте если хотите УДАЛИТЬ колонку warehouse_id:

-- ALTER TABLE public.inventory_cell_counts 
-- DROP COLUMN IF EXISTS warehouse_id;

-- Комментарий
COMMENT ON FUNCTION public.inventory_start IS 'Запускает инвентаризацию и создает задания на все активные ячейки (с warehouse_id и created_by)';

-- Reload schema
NOTIFY pgrst, 'reload schema';
