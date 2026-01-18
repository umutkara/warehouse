# FIX REPORT: Audit Events (Архив событий)

## Дата: 2026-01-XX
## Функциональность: Система аудита (Audit Log / Activity Feed)

---

## ЧТО ДОБАВЛЕНО

### 1. База данных (SQL миграция)

**Файл:** `supabase_migration_audit_events.sql`

- **Таблица `public.audit_events`**
  - Поля: `id`, `warehouse_id`, `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `summary`, `meta` (jsonb), `created_at`
  - Индексы: по `warehouse_id`, `created_at DESC`, `actor_user_id`, `entity_type`, `entity_id`, `action`
  - Композитный индекс: `(warehouse_id, created_at DESC)` для производительности

- **RLS политики**
  - SELECT: только пользователи своего warehouse могут видеть события
  - INSERT: заблокирован напрямую (только через RPC/триггеры)

- **RPC функция `public.audit_log_event`**
  - SECURITY DEFINER функция для безопасного логирования
  - Автоматически берет `warehouse_id` и `role` из профиля текущего пользователя
  - Параметры: `p_action`, `p_entity_type`, `p_entity_id`, `p_summary`, `p_meta`

- **Триггеры (3 шт.)**
  1. `trigger_audit_unit_moves` - логирует все перемещения unit из `unit_moves`
     - Action: `unit.move`
     - Summary включает barcode и коды ячеек (from/to)
  2. `trigger_audit_picking_tasks` - логирует создание и изменения статуса picking tasks
     - Actions: `task.create`, `task.start`, `task.done`, `task.canceled`
  3. `trigger_audit_inventory_sessions` - логирует начало/конец инвентаризации
     - Actions: `inventory.start`, `inventory.stop`

### 2. API Route

**Файл:** `app/api/archive/list/route.ts`

- GET `/api/archive/list`
- Фильтры:
  - `limit` (default 50, max 100)
  - `cursor` (для пагинации: `created_at|id`)
  - `action` (exact или prefix: `unit.*`)
  - `entityType` (exact)
  - `actor` (user_id)
  - `q` (поиск по summary и meta)
- Сортировка: `created_at DESC, id DESC`
- Возвращает: `{ ok: true, items: [...], nextCursor }`

### 3. UI Страница

**Файл:** `app/app/archive/page.tsx`

- Страница `/app/archive`
- Фильтры: действие, тип сущности, пользователь, поиск
- Лента событий с карточками:
  - Время, действие (бейдж), кто (роль + user id), summary
  - Раскрывающийся блок "Детали" с JSON meta
- Пагинация "Загрузить еще"
- Мобильно-дружелюбный дизайн

### 4. Обновления существующих API routes

- **`app/api/units/create/route.ts`**
  - Добавлен вызов `audit_log_event('unit.create', ...)` после успешного создания unit

- **`app/api/inventory/close-cell/route.ts`**
  - Добавлен вызов `audit_log_event('inventory.close_cell', ...)` после успешного закрытия ячейки
  - В meta: `added`, `removed`, `unknown` barcodes

### 5. Обновление меню

**Файл:** `app/app/ui/LeftNav.tsx`

- Добавлен пункт меню "Архив" в секцию "ОБЩЕЕ"
- Доступен всем аутентифицированным пользователям

---

## КАК ТЕСТИРОВАТЬ

### Шаг 1: Применить миграцию

```sql
-- Выполнить миграцию в Supabase SQL Editor
-- Файл: supabase_migration_audit_events.sql
```

**Ожидаемый результат:**
- Создана таблица `audit_events`
- Созданы индексы
- Включен RLS
- Создана RPC функция `audit_log_event`
- Созданы 3 триггера

**Проверка:**
```sql
-- Проверить таблицу
SELECT COUNT(*) FROM audit_events;

-- Проверить функцию
SELECT * FROM pg_proc WHERE proname = 'audit_log_event';

-- Проверить триггеры
SELECT * FROM pg_trigger WHERE tgname LIKE 'trigger_audit%';
```

---

### Шаг 2: Проверить RLS (изоляция warehouse)

**Подготовка:**
- Иметь 2+ пользователей из разных warehouses

**Действия:**
1. Войти под пользователем из warehouse A
2. Создать несколько событий (переместить unit, создать unit)
3. Войти под пользователем из warehouse B
4. Открыть `/app/archive`

**Ожидаемый результат:**
- Пользователь из warehouse B НЕ видит события warehouse A
- Видны только события своего warehouse

---

### Шаг 3: Тест триггера unit_moves

**Действия:**
1. Войти под любым пользователем (worker/ops/manager/etc.)
2. Переместить unit через любой API (move, move-by-scan)
3. Открыть `/app/archive`

**Ожидаемый результат:**
- В архиве появилось событие `unit.move`
- Summary содержит barcode unit и коды ячеек (from/to)
- Meta содержит: `from_cell_id`, `to_cell_id`, `from_status`, `to_status`, `actor_user_id`

**Проверка в БД:**
```sql
SELECT action, entity_type, summary, meta 
FROM audit_events 
WHERE action = 'unit.move' 
ORDER BY created_at DESC 
LIMIT 1;
```

---

### Шаг 4: Тест триггера picking_tasks

**Действия:**
1. Войти под ops/manager/admin
2. Создать picking task через `/app/ops-shipping`
3. Войти под worker
4. Взять задание в работу (статус open -> in_progress)
5. Завершить задание (статус in_progress -> done)
6. Открыть `/app/archive`

**Ожидаемый результат:**
- Появилось событие `task.create` (при создании)
- Появилось событие `task.start` (при взятии в работу)
- Появилось событие `task.done` (при завершении)
- В meta есть `unit_id`, `target_picking_cell_id`, `status`

**Проверка в БД:**
```sql
SELECT action, summary, meta 
FROM audit_events 
WHERE action LIKE 'task.%' 
ORDER BY created_at DESC 
LIMIT 3;
```

---

### Шаг 5: Тест триггера inventory_sessions

**Действия:**
1. Войти под admin/head/manager
2. Открыть `/app/inventory`
3. Нажать "Начать инвентаризацию"
4. Подождать 1-2 секунды
5. Нажать "Завершить инвентаризацию"
6. Открыть `/app/archive`

**Ожидаемый результат:**
- Появилось событие `inventory.start` (при начале)
- Появилось событие `inventory.stop` (при завершении)
- В meta есть `session_id`, `started_at`, `closed_at`

**Проверка в БД:**
```sql
SELECT action, summary, meta 
FROM audit_events 
WHERE action LIKE 'inventory.%' 
ORDER BY created_at DESC 
LIMIT 2;
```

---

### Шаг 6: Тест API route audit_log_event (units/create)

**Действия:**
1. Войти под worker/manager/head/admin
2. Открыть `/app/receiving`
3. Создать unit (ввести barcode, отправить)
4. Открыть `/app/archive`

**Ожидаемый результат:**
- Появилось событие `unit.create`
- Summary: "Создание unit {barcode}"
- Meta содержит `barcode`, `status: "receiving"`

**Проверка в БД:**
```sql
SELECT action, entity_type, summary, meta 
FROM audit_events 
WHERE action = 'unit.create' 
ORDER BY created_at DESC 
LIMIT 1;
```

---

### Шаг 7: Тест API route audit_log_event (inventory/close-cell)

**Действия:**
1. Войти под admin/head/manager
2. Начать инвентаризацию
3. Открыть `/app/inventory`
4. Просканировать ячейку (cell-scan) с некоторыми barcodes
5. Закрыть ячейку (close-cell) - если есть соответствующий API/UI
6. Открыть `/app/archive`

**Ожидаемый результат:**
- Появилось событие `inventory.close_cell`
- Summary содержит код ячейки и разницу (добавлено/удалено)
- Meta содержит: `cell_id`, `cell_code`, `added`, `removed`, `unknown`, `scanned_count`, `expected_count`

**Проверка в БД:**
```sql
SELECT action, summary, meta 
FROM audit_events 
WHERE action = 'inventory.close_cell' 
ORDER BY created_at DESC 
LIMIT 1;
```

---

### Шаг 8: Тест фильтров в UI

**Действия:**
1. Открыть `/app/archive`
2. В фильтре "Действие" ввести `unit.*`
3. Нажать Enter или подождать

**Ожидаемый результат:**
- Показаны только события с action начинающимся на `unit.` (unit.move, unit.create)

**Дополнительные фильтры:**
- Фильтр "Тип сущности": `unit` → показываются только события с `entity_type = 'unit'`
- Фильтр "Пользователь": ввести user_id → показываются только события этого пользователя
- Поиск: ввести часть текста из summary → показываются события содержащие этот текст

---

### Шаг 9: Тест пагинации

**Действия:**
1. Открыть `/app/archive`
2. Убедиться что показано 50 событий (или меньше)
3. Прокрутить вниз
4. Нажать "Загрузить еще"

**Ожидаемый результат:**
- Подгрузились еще 50 событий (или меньше, если закончились)
- Кнопка "Загрузить еще" исчезает когда события закончились

**Проверка в БД:**
```sql
-- Посчитать общее количество событий
SELECT COUNT(*) FROM audit_events WHERE warehouse_id = '<ваш_warehouse_id>';
```

---

### Шаг 10: Тест безопасности RLS (повторная проверка)

**Действия:**
1. Войти под пользователем warehouse A
2. В SQL Editor Supabase выполнить (как пользователь A):
   ```sql
   -- Попытка прямой вставки (должна быть заблокирована RLS)
   INSERT INTO audit_events (warehouse_id, action, entity_type, summary)
   VALUES ('<warehouse_id_B>', 'test', 'test', 'test');
   ```

**Ожидаемый результат:**
- Ошибка RLS или успешная вставка ТОЛЬКО в свой warehouse (не в warehouse B)
- Все записи через RPC/триггеры должны иметь правильный `warehouse_id` текущего пользователя

**Проверка:**
```sql
-- Убедиться что все события имеют правильный warehouse_id
SELECT warehouse_id, COUNT(*) 
FROM audit_events 
GROUP BY warehouse_id;

-- Проверить что нет событий с warehouse_id другого warehouse (при наличии нескольких warehouses)
```

---

## ПРОИЗВОДИТЕЛЬНОСТЬ

### Индексы созданы:
- `idx_audit_events_warehouse_id` - для фильтрации по warehouse
- `idx_audit_events_created_at` - для сортировки DESC
- `idx_audit_events_actor_user_id` - для фильтрации по актору
- `idx_audit_events_entity_type` - для фильтрации по типу
- `idx_audit_events_entity_id` - для фильтрации по ID сущности
- `idx_audit_events_action` - для фильтрации по действию
- `idx_audit_events_warehouse_created` (composite) - для запросов с фильтром по warehouse и сортировкой

### Проверка производительности:

```sql
-- Проверить использование индексов
EXPLAIN ANALYZE
SELECT * FROM audit_events 
WHERE warehouse_id = '<warehouse_id>' 
ORDER BY created_at DESC 
LIMIT 50;
```

Ожидаемый результат: использование индекса `idx_audit_events_warehouse_created`

---

## ВАЖНЫЕ ЗАМЕЧАНИЯ

1. **Не трогать `/login`** - не изменялся
2. **RLS не сломан** - все существующие политики работают как раньше
3. **Триггеры автоматические** - не требуют изменений в существующем коде
4. **Ручное логирование** - добавлено только в `units/create` и `inventory/close-cell` где нет триггеров
5. **Безопасность** - все записи через SECURITY DEFINER функции, прямой INSERT заблокирован RLS

---

## ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ

1. **Поиск по meta** - использует `ILIKE` по JSONB text representation (может быть медленным на больших объемах)
2. **Пагинация** - упрощенная реализация (filter by `created_at < cursor`), не учитывает `id` в сложных случаях
3. **Триггеры** - логируют только основные события, специфичные события нужно добавлять вручную через `audit_log_event`

---

## СЛЕДУЮЩИЕ ШАГИ (опционально)

- Добавить логирование изменений ячеек (block/unblock) если появится API
- Добавить экспорт архива в CSV/Excel
- Добавить группировку событий по дням/часам
- Добавить статистику по событиям (dashboard)

---

## ФАЙЛЫ ИЗМЕНЕНЫ/СОЗДАНЫ

**Создано:**
- `supabase_migration_audit_events.sql`
- `app/api/archive/list/route.ts`
- `app/app/archive/page.tsx`
- `FIX_REPORT_AUDIT_EVENTS.md` (этот файл)

**Изменено:**
- `app/app/ui/LeftNav.tsx` - добавлен пункт "Архив"
- `app/api/units/create/route.ts` - добавлен вызов `audit_log_event`
- `app/api/inventory/close-cell/route.ts` - добавлен вызов `audit_log_event`

---

## ЗАКЛЮЧЕНИЕ

Система аудита полностью реализована и готова к использованию. Все события логируются автоматически через триггеры или вручную через API routes. UI доступен всем аутентифицированным пользователям и показывает только события своего warehouse.
