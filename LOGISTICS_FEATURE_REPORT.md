# LOGISTICS FLOW - Production Feature Report

## Краткое описание

Добавлен новый логистический контур (LOGISTICS) для управления отправкой заказов из picking ячеек курьерам и возврата заказов обратно на склад.

**Важно:** Все существующие функции (ops, worker, picking tasks) остались нетронутыми. Logistics работает поверх уже существующей модели.

---

## 1. Что добавлено

### 1.1. Роль: `logistics`

- **Добавлена в существующую таблицу `profiles`**
- Не требует отдельных auth users
- Права доступа:
  - ✅ МОЖЕТ: работать с units в picking
  - ✅ МОЖЕТ: отправлять заказы в OUT (курьеру)
  - ✅ МОЖЕТ: возвращать заказы из OUT обратно на склад
  - ❌ НЕ МОЖЕТ: менять storage/shipping
  - ❌ НЕ МОЖЕТ: создавать ops-задачи
  - ❌ НЕ МОЖЕТ: работать с ТСД

### 1.2. Новая таблица: `outbound_shipments`

**Назначение:** Отслеживание заказов в статусе OUT (вне склада, у курьера).

**Структура:**
```sql
CREATE TABLE public.outbound_shipments (
  id uuid PRIMARY KEY,
  warehouse_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  
  -- Courier info
  courier_name text NOT NULL,
  
  -- OUT details
  out_by uuid NOT NULL,           -- logistics user who shipped
  out_at timestamptz NOT NULL,
  
  -- Return details (NULL if not returned yet)
  returned_by uuid,
  returned_at timestamptz,
  return_reason text,
  
  -- Status: 'out' (shipped) or 'returned' (back in warehouse)
  status text NOT NULL DEFAULT 'out' CHECK (status IN ('out', 'returned')),
  
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Индексы:**
- `idx_outbound_shipments_warehouse` - для фильтрации по складу
- `idx_outbound_shipments_unit` - для поиска по unit
- `idx_outbound_shipments_status` - для фильтрации по статусу
- `idx_outbound_shipments_unit_active` (UNIQUE WHERE status='out') - предотвращает дубликаты активных отправок

**RLS политики:**
- SELECT: logistics, admin, head, manager, ops могут видеть отправки своего склада
- INSERT: только logistics, admin, head
- UPDATE: только logistics, admin, head

### 1.3. RPC функции

#### `ship_unit_out(p_unit_id uuid, p_courier_name text)`

**Назначение:** Отправить unit из picking в OUT.

**Логика:**
1. Проверяет права доступа (logistics, admin, head)
2. Проверяет что unit находится в picking ячейке
3. Проверяет что unit не имеет активной отправки
4. Создаёт запись в `outbound_shipments`
5. Обновляет unit:
   - `cell_id = NULL` (убирает из ячейки)
   - `status = 'out'`
6. Возвращает результат с shipment_id

**Security:** SECURITY DEFINER (обходит RLS, но с внутренними проверками)

#### `return_unit_from_out(p_shipment_id uuid, p_target_cell_code text, p_return_reason text DEFAULT NULL)`

**Назначение:** Вернуть unit из OUT обратно на склад.

**Логика:**
1. Проверяет права доступа (logistics, admin, head)
2. Проверяет что отправка существует и status='out'
3. Проверяет что target_cell_code - это storage или shipping ячейка
4. Обновляет отправку:
   - `status = 'returned'`
   - `returned_by = current user`
   - `returned_at = now()`
   - `return_reason` (если указана)
5. Обновляет unit:
   - `cell_id = target_cell.id`
   - `status = 'storage' | 'shipping'` (в зависимости от ячейки)
6. Возвращает результат

**Security:** SECURITY DEFINER

### 1.4. API Endpoints

#### `GET /api/logistics/picking-units`

**Доступ:** logistics, admin, head

**Возвращает:** Список всех units в picking ячейках с информацией:
- unit (id, barcode, status, created_at, meta)
- cell (code, cell_type)
- scenario (read-only, из completed picking_tasks)

#### `POST /api/logistics/ship-out`

**Доступ:** logistics, admin, head

**Body:**
```json
{
  "unitId": "uuid",
  "courierName": "string"
}
```

**Действия:**
1. Вызывает RPC `ship_unit_out`
2. Создаёт audit log с action `logistics.ship_out`
3. Возвращает shipment info

#### `GET /api/logistics/out-shipments?status=out|returned`

**Доступ:** logistics, admin, head, manager, ops

**Возвращает:** Список отправок с обогащёнными данными:
- shipment (id, courier_name, out_at, returned_at, status, etc.)
- unit (barcode, meta)
- out_by_profile (full_name, role)
- returned_by_profile (full_name, role) если возвращён

**Query params:**
- `status` - фильтр по статусу ('out' | 'returned'), default: 'out'

#### `POST /api/logistics/return-from-out`

**Доступ:** logistics, admin, head

**Body:**
```json
{
  "shipmentId": "uuid",
  "targetCellCode": "string",
  "returnReason": "string (optional)"
}
```

**Действия:**
1. Вызывает RPC `return_unit_from_out`
2. Создаёт audit log с action `logistics.return_from_out`
3. Возвращает result info

### 1.5. UI Страницы

#### `/app/logistics` - Отправка заказов

**Доступ:** logistics, admin, head

**Функционал:**
- Показывает список всех units в picking ячейках
- Отображает сценарий (read-only) если есть
- Форма отправки:
  - Выбор unit из списка
  - Обязательное поле: имя курьера
  - Кнопка "✓ Готово / Отправить"
- После отправки: unit уходит в OUT, список обновляется

#### `/app/out` - Управление OUT отправками

**Доступ:** logistics, admin, head, manager, ops (read-only для manager/ops)

**Функционал:**
- Фильтр: "В доставке" | "Возвращённые"
- Список отправок с информацией:
  - Заказ (barcode)
  - Курьер
  - Дата/время отправки
  - Кто отправил
  - Для возвращённых: дата возврата, причина
- Форма возврата (только для status='out'):
  - Выбор отправки
  - Обязательное поле: код ячейки (storage/shipping)
  - Опциональное поле: причина возврата
  - Кнопка "← Вернуть на склад"

### 1.6. Навигация (LeftNav)

**Изменения:**

Для роли `logistics`:
- ✅ Видит: ЛОГИСТИКА раздел
  - Отправка заказов (`/app/logistics`)
  - OUT (В доставке) (`/app/out`)
- ✅ Видит: ОБЩЕЕ раздел
  - Карта склада
  - Инвентаризация
  - Архив
- ❌ НЕ видит: Worker разделы (Приёмка, Размещение, Сборка, Отгрузка, ТСД)
- ❌ НЕ видит: OPS раздел

Для ролей `admin`, `head`:
- ✅ Видят все разделы, включая ЛОГИСТИКА

Для остальных ролей:
- Без изменений

---

## 2. Happy Path (Полный цикл)

### Шаг 1: OPS создаёт задачу
```
OPS → /app/ops-shipping
1. Выбирает unit из storage/shipping
2. Выбирает target picking cell
3. Создаёт задачу
```

### Шаг 2: Worker выполняет задачу
```
Worker → /app/tsd → Отгрузка
1. Выбирает задачу
2. Сканирует FROM (storage/shipping) → UNIT → TO (picking)
3. Задача completed, unit перемещён в picking
```

### Шаг 3: Logistics отправляет заказ
```
Logistics → /app/logistics
1. Видит unit в picking (со сценарием от OPS, read-only)
2. Выбирает unit
3. Вводит имя курьера: "Иван Петров"
4. Нажимает "✓ Готово / Отправить"
5. Unit → OUT (вне склада)
```

### Шаг 4a: Успешная доставка
```
Заказ доставлен → остаётся в OUT (status='out')
Можно посмотреть в архиве (audit_events)
```

### Шаг 4b: Возврат на склад
```
Logistics → /app/out
1. Выбирает отправку (status='out')
2. Указывает ячейку для возврата: "A4" (storage или shipping)
3. Указывает причину (опционально): "Отказ клиента"
4. Нажимает "← Вернуть на склад"
5. Unit → обратно в storage/shipping
6. Shipment → status='returned'
```

---

## 3. Безопасность (RLS)

### Таблица `outbound_shipments`

**SELECT:**
```sql
-- Только пользователи с ролями logistics/admin/head/manager/ops
-- Видят только отправки своего склада
warehouse_id IN (
  SELECT warehouse_id FROM profiles 
  WHERE id = auth.uid() 
    AND role IN ('logistics', 'admin', 'head', 'manager', 'ops')
)
```

**INSERT:**
```sql
-- Только logistics/admin/head могут создавать отправки
warehouse_id IN (
  SELECT warehouse_id FROM profiles 
  WHERE id = auth.uid() 
    AND role IN ('logistics', 'admin', 'head')
)
```

**UPDATE:**
```sql
-- Только logistics/admin/head могут обновлять отправки (для возврата)
-- USING и WITH CHECK используют одинаковое условие
warehouse_id IN (
  SELECT warehouse_id FROM profiles 
  WHERE id = auth.uid() 
    AND role IN ('logistics', 'admin', 'head')
)
```

### RPC функции

Обе функции (`ship_unit_out`, `return_unit_from_out`) используют:
- `SECURITY DEFINER` - обходят RLS для операций
- Внутренние проверки:
  - Пользователь авторизован (`auth.uid()`)
  - Пользователь имеет правильную роль
  - Warehouse_id совпадает
  - Unit находится в правильной ячейке/статусе
  - Ячейка target имеет правильный тип

### API Endpoints

Все endpoints проверяют:
1. Аутентификацию (`supabase.auth.getUser()`)
2. Профиль пользователя (`profiles` table)
3. Роль (`role IN ['logistics', 'admin', 'head']`)
4. Warehouse_id (фильтрация)

---

## 4. Логирование

Все действия логируются через `audit_log_event` RPC:

### `logistics.ship_out`
```json
{
  "action": "logistics.ship_out",
  "entity_type": "unit",
  "entity_id": "unit_id",
  "summary": "Отправлен заказ 123456 курьером Иван Петров",
  "meta": {
    "shipment_id": "uuid",
    "unit_barcode": "123456",
    "courier_name": "Иван Петров"
  }
}
```

### `logistics.return_from_out`
```json
{
  "action": "logistics.return_from_out",
  "entity_type": "unit",
  "entity_id": "unit_id",
  "summary": "Возврат заказа 123456 из OUT в A4",
  "meta": {
    "shipment_id": "uuid",
    "unit_barcode": "123456",
    "target_cell_code": "A4",
    "target_cell_type": "storage",
    "return_reason": "Отказ клиента"
  }
}
```

Все логи доступны в `/app/archive` для анализа.

---

## 5. Что НЕ ИЗМЕНИЛОСЬ

✅ Таблица `profiles` - только добавлена роль `logistics` в enum  
✅ Таблица `units` - используется status='out', но это совместимо с existing flow  
✅ Таблица `warehouse_cells` - без изменений  
✅ Таблица `picking_tasks` - без изменений  
✅ RPC `move_unit_to_cell` - без изменений  
✅ OPS flow (ops-shipping) - без изменений  
✅ Worker flow (TSD) - без изменений  
✅ Inventory flow - без изменений  

---

## 6. Миграция

**Файл:** `migrations/supabase_migration_logistics.sql`

**Содержит:**
1. CREATE TABLE `outbound_shipments`
2. Indexes для производительности
3. RLS policies для безопасности
4. RPC `ship_unit_out`
5. RPC `return_unit_from_out`
6. GRANT EXECUTE для authenticated users

**Применение:**
```bash
# В Supabase Dashboard → SQL Editor
# Или через CLI:
supabase db push
```

---

## 7. Тестирование

### Pre-requisites
1. Создать пользователя с ролью `logistics`
2. Иметь unit в picking ячейке (через OPS → Worker flow)
3. Иметь storage/shipping ячейки для возврата

### Test Case 1: Ship to OUT
1. Login as logistics
2. Перейти на `/app/logistics`
3. Выбрать unit из списка
4. Ввести имя курьера
5. Нажать "✓ Готово / Отправить"
6. **Ожидается:** Unit исчезает из списка, появляется в `/app/out`

### Test Case 2: Return from OUT
1. Login as logistics
2. Перейти на `/app/out`
3. Выбрать отправку (status='out')
4. Ввести код ячейки (storage/shipping)
5. Ввести причину (опционально)
6. Нажать "← Вернуть на склад"
7. **Ожидается:** Unit возвращён в указанную ячейку, отправка status='returned'

### Test Case 3: Permissions
1. Login as worker
2. Попробовать перейти на `/app/logistics`
3. **Ожидается:** 403 Forbidden или нет в меню
4. Login as logistics
5. Попробовать перейти на `/app/ops-shipping`
6. **Ожидается:** Раздел не виден в меню

### Test Case 4: Validation
1. Login as logistics
2. Попробовать отправить unit из non-picking ячейки
3. **Ожидается:** Ошибка "Unit must be in picking cell"
4. Попробовать вернуть в bin/picking ячейку
5. **Ожидается:** Ошибка "Target cell must be storage or shipping"

---

## 8. Мониторинг и аналитика

### Метрики для отслеживания

1. **Количество отправок:**
   ```sql
   SELECT COUNT(*) FROM outbound_shipments WHERE status = 'out';
   ```

2. **Количество возвратов:**
   ```sql
   SELECT COUNT(*) FROM outbound_shipments WHERE status = 'returned';
   ```

3. **Процент возвратов:**
   ```sql
   SELECT 
     ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'returned') / COUNT(*), 2) as return_rate
   FROM outbound_shipments;
   ```

4. **Топ курьеров по количеству отправок:**
   ```sql
   SELECT courier_name, COUNT(*) as total_shipments
   FROM outbound_shipments
   GROUP BY courier_name
   ORDER BY total_shipments DESC;
   ```

5. **Среднее время до возврата:**
   ```sql
   SELECT AVG(EXTRACT(EPOCH FROM (returned_at - out_at)) / 3600) as avg_hours
   FROM outbound_shipments
   WHERE status = 'returned';
   ```

### Audit logs

Все действия доступны в таблице `audit_events`:
```sql
SELECT * FROM audit_events 
WHERE action IN ('logistics.ship_out', 'logistics.return_from_out')
ORDER BY created_at DESC;
```

---

## 9. Поддержка и FAQ

### Q: Можно ли отправить unit из storage напрямую в OUT?
**A:** Нет. Unit ДОЛЖЕН сначала пройти через picking (через OPS → Worker flow).

### Q: Что если курьер указан неправильно?
**A:** Имя курьера хранится как текст и может быть исправлено напрямую в БД или через обновление UI (future feature).

### Q: Можно ли вернуть unit в bin ячейку?
**A:** Нет. Возврат возможен ТОЛЬКО в storage или shipping ячейки.

### Q: Что если unit уже в OUT, но я пытаюсь отправить его снова?
**A:** RPC вернёт ошибку "Unit already shipped OUT". Unique index предотвращает дубликаты.

### Q: Может ли worker вернуть unit из OUT?
**A:** Нет. Только logistics, admin, head могут работать с OUT.

### Q: Где хранится история всех отправок?
**A:** В таблице `outbound_shipments` (все статусы) и в `audit_events` (audit log).

---

## 10. Будущие улучшения (Future Roadmap)

1. **Tracking по трек-номеру:** Добавить поле `tracking_number` в `outbound_shipments`
2. **Интеграция с курьерскими API:** Автоматическое обновление статусов
3. **SMS/Email уведомления:** При отправке и возврате
4. **Статистика по курьерам:** Dashboard с метриками
5. **Причины возврата (enum):** Вместо free-text использовать предопределённые значения
6. **Фото-подтверждение:** Курьер загружает фото доставки
7. **Batch операции:** Отправка/возврат нескольких заказов одновременно

---

## Заключение

Логистический контур ПОЛНОСТЬЮ интегрирован в существующую WMS систему:
- ✅ Новая роль `logistics` добавлена
- ✅ Таблица `outbound_shipments` создана
- ✅ RPC функции для ship/return реализованы
- ✅ API endpoints готовы
- ✅ UI страницы `/app/logistics` и `/app/out` работают
- ✅ Навигация обновлена для роли logistics
- ✅ RLS политики настроены
- ✅ Audit logging работает
- ✅ Существующие flows (ops, worker, picking) НЕ затронуты

**Happy Path проверен:**  
OPS → Worker (picking) → Logistics (OUT) → Return (storage/shipping) ✓

**Система готова к production использованию.**
