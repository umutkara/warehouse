# LOGISTICS Feature - Installation Guide

## Быстрый старт

1. **Применить SQL миграции** (в Supabase Dashboard → SQL Editor)
2. **Создать пользователя с ролью `logistics`**
3. **Проверить Happy Path**

---

## Шаг 1: SQL Миграции

### 1.1. Проверка enum (опционально)

Сначала проверьте, используются ли enum типы для `units.status` и `profiles.role`:

```sql
-- Проверка unit_status
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_name = 'units' AND column_name = 'status';

-- Проверка profile role
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'role';
```

**Если `udt_name` показывает custom enum:**
- Откройте файл: `migrations/supabase_migration_logistics_enums.sql`
- Раскомментируйте соответствующие `ALTER TYPE` команды
- Выполните их в SQL Editor

**Если `data_type` = `text`:**
- Пропустите этот шаг, enum не требуется

### 1.2. Основная миграция

Выполните файл: `migrations/supabase_migration_logistics.sql`

**Что делает:**
- Создаёт таблицу `outbound_shipments`
- Создаёт индексы
- Настраивает RLS политики
- Создаёт RPC функции: `ship_unit_out`, `return_unit_from_out` (примечание: API endpoint для return удален, используйте приемку на ТСД)
- Даёт GRANT EXECUTE для authenticated users

**Применение:**
1. Откройте Supabase Dashboard
2. Перейдите в SQL Editor
3. Скопируйте весь контент файла `supabase_migration_logistics.sql`
4. Нажмите Run
5. Проверьте успех (зелёная галочка)

---

## Шаг 2: Создание пользователя logistics

### Вариант A: Через Supabase Dashboard (Authentication)

1. Перейдите в Authentication → Users
2. Создайте нового пользователя (email + password)
3. Скопируйте `user_id` нового пользователя

### Вариант B: Через SQL

```sql
-- Создать auth user (если еще нет)
-- Используйте Supabase Auth API или Dashboard

-- Затем обновить/создать профиль:
INSERT INTO public.profiles (id, warehouse_id, role, full_name, email)
VALUES (
  'user-uuid-here',          -- UUID пользователя из auth.users
  'your-warehouse-uuid',     -- UUID вашего склада
  'logistics',               -- Роль
  'Иван Логист',             -- Имя
  'logistics@example.com'    -- Email
)
ON CONFLICT (id) DO UPDATE
SET role = 'logistics';
```

### Проверка

```sql
SELECT id, full_name, email, role, warehouse_id
FROM public.profiles
WHERE role = 'logistics';
```

---

## Шаг 3: Проверка установки

### 3.1. Проверка таблицы

```sql
-- Должна вернуть 0 строк (пусто, но таблица существует)
SELECT COUNT(*) FROM public.outbound_shipments;
```

### 3.2. Проверка RPC функций

```sql
-- Должны существовать
SELECT proname FROM pg_proc 
WHERE proname IN ('ship_unit_out', 'return_unit_from_out');
```

### 3.3. Проверка RLS

```sql
-- Должно вернуть 3 политики (SELECT, INSERT, UPDATE)
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename = 'outbound_shipments';
```

---

## Шаг 4: Тестирование

### Pre-requisites

Для полного теста нужны:
1. ✅ Пользователь с ролью `logistics`
2. ✅ Unit в picking ячейке (создать через OPS → Worker flow)
3. ✅ Storage/Shipping ячейки для возврата

### Test 1: Login as logistics

1. Откройте `/login`
2. Войдите как logistics пользователь
3. Должны увидеть в меню:
   - ЛОГИСТИКА
     - Отправка заказов
     - OUT (В доставке)
   - ОБЩЕЕ
     - Карта склада
     - Инвентаризация
     - Архив

### Test 2: Ship unit to OUT

1. Перейдите на `/app/logistics`
2. Должны увидеть список units в picking (если есть)
3. Выберите unit
4. Введите имя курьера: "Test Courier"
5. Нажмите "✓ Готово / Отправить"
6. **Ожидается:** 
   - Alert с успехом
   - Unit исчезает из списка
   - В БД: `SELECT * FROM outbound_shipments WHERE status='out';`

### Test 3: View OUT shipments

1. Перейдите на `/app/out`
2. Должны увидеть отправленный unit
3. Проверьте информацию:
   - Заказ (barcode)
   - Курьер (Test Courier)
   - Дата отправки
   - Кто отправил

### Test 4: Return from OUT

1. На странице `/app/out`
2. Выберите отправку
3. Введите код ячейки (storage/shipping), например "A1"
4. Введите причину (optional): "Test return"
5. Нажмите "← Вернуть на склад"
6. **Ожидается:**
   - Alert с успехом
   - Отправка переходит во вкладку "Возвращённые"
   - В БД: unit.cell_id = A1, status = 'storage'/'shipping'

### Test 5: Audit logs

1. Перейдите на `/app/archive`
2. Поиск по действию: `logistics.ship_out`
3. Должны увидеть запись о отправке
4. Поиск по действию: `logistics.return_from_out`
5. Должны увидеть запись о возврате

---

## Шаг 5: Happy Path (End-to-End)

### Полный цикл:

```
1. OPS создаёт задачу
   → /app/ops-shipping
   → Выбирает unit из storage/shipping
   → Создаёт задачу на picking cell

2. Worker выполняет задачу
   → /app/tsd → Отгрузка
   → Сканирует FROM → UNIT → TO (picking)
   → Задача completed

3. Logistics отправляет
   → /app/logistics
   → Видит unit в picking
   → Вводит курьера
   → Отправляет в OUT

4. Logistics возвращает (если нужно)
   → /app/out
   → Выбирает отправку
   → Указывает ячейку возврата
   → Возвращает на склад
```

---

## Откат (Rollback)

Если нужно откатить изменения:

```sql
-- 1. Удалить RPC функции
DROP FUNCTION IF EXISTS public.ship_unit_out;
DROP FUNCTION IF EXISTS public.return_unit_from_out;

-- 2. Удалить таблицу
DROP TABLE IF EXISTS public.outbound_shipments CASCADE;

-- 3. (Опционально) Удалить enum значения
-- Невозможно удалить значения из enum после добавления
-- Нужно пересоздать enum или оставить как есть
```

**Важно:** Откат НЕ влияет на:
- Таблицу `profiles` (роль `logistics` останется, но не будет использоваться)
- Таблицу `units` (status='out' останется, но не будет использоваться)
- Существующие flows (ops, worker, picking)

---

## Troubleshooting

### Проблема: "Function ship_unit_out does not exist"

**Решение:**
- Проверьте, что миграция выполнена успешно
- Выполните: `SELECT proname FROM pg_proc WHERE proname = 'ship_unit_out';`
- Если пусто → перезапустите миграцию

### Проблема: "403 Forbidden" при доступе к /app/logistics

**Решение:**
- Проверьте роль пользователя: `SELECT role FROM profiles WHERE id = auth.uid();`
- Должна быть `logistics`, `admin`, или `head`
- Если нет → обновите роль: `UPDATE profiles SET role = 'logistics' WHERE id = 'user-uuid';`

### Проблема: "Unit must be in picking cell"

**Решение:**
- Проверьте статус unit: `SELECT status, cell_id FROM units WHERE id = 'unit-uuid';`
- Должен быть `status = 'picking'` и `cell_id` указывает на picking ячейку
- Если нет → выполните OPS → Worker flow сначала

### Проблема: "Target cell must be storage or shipping"

**Решение:**
- Проверьте тип ячейки: `SELECT code, cell_type FROM warehouse_cells WHERE code = 'A1';`
- Должен быть `cell_type = 'storage'` или `'shipping'`
- Если нет → используйте другую ячейку

### Проблема: RLS блокирует операции

**Решение:**
- RPC функции используют `SECURITY DEFINER` и обходят RLS
- Если всё равно проблема:
  ```sql
  -- Проверка политик
  SELECT * FROM pg_policies WHERE tablename = 'outbound_shipments';
  
  -- Временно отключить RLS (ТОЛЬКО ДЛЯ ДЕБАГА)
  ALTER TABLE outbound_shipments DISABLE ROW LEVEL SECURITY;
  
  -- Не забыть включить обратно!
  ALTER TABLE outbound_shipments ENABLE ROW LEVEL SECURITY;
  ```

---

## Контакты и поддержка

- **Документация:** `LOGISTICS_FEATURE_REPORT.md`
- **Миграции:** `migrations/supabase_migration_logistics*.sql`
- **API Endpoints:** `app/api/logistics/*`
- **UI Pages:** `app/app/logistics/` и `app/app/out/`

---

## Changelog

### v1.0 - Initial Release
- ✅ Таблица `outbound_shipments`
- ✅ RPC `ship_unit_out`, `return_unit_from_out`
- ✅ API endpoints для logistics
- ✅ UI страницы `/app/logistics`, `/app/out`
- ✅ Роль `logistics` в навигации
- ✅ RLS политики
- ✅ Audit logging

---

**Готово к production использованию! 🚀**
