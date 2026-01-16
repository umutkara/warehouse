# FIX REPORT: Исправление ошибок с ENUM типами

## Проблема
В RPC функциях использовался тип `text` для статусов, что несовместимо с ENUM типами PostgreSQL. PostgreSQL не умеет автоматически приводить `text → enum`, что вызывало ошибки.

## Исправления

### 1. Функция `move_unit()`

**Было:**
```sql
p_to_status text
```

**Стало:**
```sql
p_to_status public.unit_status
```

**Было:**
```sql
IF p_to_status = 'stored' THEN
```

**Стало:**
```sql
IF p_to_status = 'stored'::public.unit_status THEN
```

**Изменения:**
- Параметр `p_to_status` теперь `public.unit_status` вместо `text`
- Сравнения статусов через явное приведение: `'stored'::public.unit_status`
- Возвращаемые значения приведены к `::text` для JSON (строки 399, 408)

### 2. Функция `move_unit_to_cell()`

**Было:**
```sql
IF p_to_status IS NULL THEN
  v_final_status := v_unit_record.status;
ELSE
  v_final_status := p_to_status;
END IF;

UPDATE public.units
SET cell_id = p_to_cell_id,
    status = v_final_status
WHERE id = p_unit_id;
```

**Стало:**
```sql
IF p_to_status IS NULL THEN
  UPDATE public.units
  SET cell_id = p_to_cell_id
  WHERE id = p_unit_id;
  v_final_status := v_unit_record.status;
ELSE
  UPDATE public.units
  SET cell_id = p_to_cell_id,
      status = p_to_status
  WHERE id = p_unit_id;
  v_final_status := p_to_status;
END IF;
```

**Изменения:**
- Условный UPDATE: если `p_to_status IS NULL`, статус вообще не трогается
- Переменная `v_final_status` уже была правильного типа `public.unit_status`

## Результат

✅ Все ENUM типы используются правильно  
✅ Нет автоматических приведений `text → enum`  
✅ NULL статус обрабатывается через условный UPDATE  
✅ Все возвращаемые значения приведены к `::text` для JSON совместимости

## Файлы изменены

- `supabase_migration_inventory.sql` - исправлены функции `move_unit()` и `move_unit_to_cell()`

## Как применить

Выполните исправленную миграцию `supabase_migration_inventory.sql` в Supabase SQL Editor. Она перезапишет функции правильными версиями.
