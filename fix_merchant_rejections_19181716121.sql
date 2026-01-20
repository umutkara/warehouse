-- Восстановление merchant_rejections для заказа 19181716121
-- Заказ уже возвращен, но merchant_rejections не были созданы

DO $$
DECLARE
  v_unit_id uuid;
  v_shipment_id uuid;
  v_picking_task_id uuid;
  v_scenario text;
  v_courier_name text;
  v_current_meta jsonb;
  v_merchant_rejections jsonb;
  v_rejection_count int;
BEGIN
  -- 1. Найти unit_id
  SELECT id INTO v_unit_id
  FROM public.units
  WHERE barcode = '19181716121';
  
  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'Unit not found for barcode 19181716121';
  END IF;
  
  -- 2. Найти shipment (returned)
  SELECT id, courier_name INTO v_shipment_id, v_courier_name
  FROM public.outbound_shipments
  WHERE unit_id = v_unit_id
    AND status = 'returned'
  ORDER BY returned_at DESC
  LIMIT 1;
  
  IF v_shipment_id IS NULL THEN
    RAISE EXCEPTION 'Shipment not found for unit';
  END IF;
  
  -- 3. Найти picking_task со сценарием "мерчант"
  -- Сначала через новый формат (picking_task_units)
  SELECT pt.id, pt.scenario INTO v_picking_task_id, v_scenario
  FROM public.picking_tasks pt
  INNER JOIN public.picking_task_units ptu ON ptu.picking_task_id = pt.id
  WHERE ptu.unit_id = v_unit_id
    AND pt.scenario IS NOT NULL
    AND (LOWER(pt.scenario) LIKE '%мерчант%' 
         OR LOWER(pt.scenario) LIKE '%merchant%'
         OR LOWER(pt.scenario) LIKE '%магазин%')
  ORDER BY pt.created_at DESC
  LIMIT 1;
  
  -- Если не найдено, попробовать legacy формат
  IF v_picking_task_id IS NULL THEN
    SELECT id, scenario INTO v_picking_task_id, v_scenario
    FROM public.picking_tasks
    WHERE unit_id = v_unit_id
      AND scenario IS NOT NULL
      AND (LOWER(scenario) LIKE '%мерчант%' 
           OR LOWER(scenario) LIKE '%merchant%'
           OR LOWER(scenario) LIKE '%магазин%')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  IF v_picking_task_id IS NULL OR v_scenario IS NULL THEN
    RAISE EXCEPTION 'Picking task with merchant scenario not found';
  END IF;
  
  -- 4. Получить текущий meta
  SELECT COALESCE(meta, '{}'::jsonb) INTO v_current_meta
  FROM public.units
  WHERE id = v_unit_id;
  
  -- 5. Создать merchant_rejections массив
  v_merchant_rejections := COALESCE(v_current_meta->'merchant_rejections', '[]'::jsonb);
  v_rejection_count := jsonb_array_length(v_merchant_rejections);
  
  -- Добавить новую запись
  v_merchant_rejections := v_merchant_rejections || jsonb_build_array(
    jsonb_build_object(
      'rejected_at', (SELECT returned_at FROM public.outbound_shipments WHERE id = v_shipment_id),
      'reason', 'Мерчант не принял',
      'scenario', v_scenario,
      'shipment_id', v_shipment_id,
      'courier_name', v_courier_name,
      'picking_task_id', v_picking_task_id,
      'return_number', v_rejection_count + 1
    )
  );
  
  v_rejection_count := v_rejection_count + 1;
  
  -- 6. Обновить meta
  UPDATE public.units
  SET meta = jsonb_set(
    jsonb_set(
      v_current_meta,
      '{merchant_rejections}',
      v_merchant_rejections
    ),
    '{merchant_rejection_count}',
    to_jsonb(v_rejection_count)
  )
  WHERE id = v_unit_id;
  
  RAISE NOTICE 'Successfully created merchant_rejections for unit %, rejection_count: %', v_unit_id, v_rejection_count;
END $$;

-- Проверка результата
SELECT 
  id,
  barcode,
  meta->'merchant_rejections' as merchant_rejections,
  meta->>'merchant_rejection_count' as rejection_count
FROM public.units
WHERE barcode = '19181716121';
