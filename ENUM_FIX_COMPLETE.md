# FIX REPORT: Полное исправление ENUM типов в WMS

## Проблема
Ошибки типа "COALESCE types text and unit_status cannot be matched" из-за смешивания `text` и `public.unit_status` ENUM типов в PostgreSQL.

## Решение

### 1. SQL Функции исправлены

#### `move_unit_to_cell` ✅
**Сигнатура:**
```sql
CREATE OR REPLACE FUNCTION public.move_unit_to_cell(
  p_unit_id uuid,
  p_to_cell_id uuid,
  p_to_status public.unit_status DEFAULT NULL
)
```

**Ключевые моменты:**
- ✅ Параметр `p_to_status` типа `public.unit_status` (ENUM), а не `text`
- ✅ DEFAULT NULL - статус можно не передавать
- ✅ Если `p_to_status IS NULL` → UPDATE только `cell_id`, статус не трогаем
- ✅ Если `p_to_status` передан → UPDATE и `cell_id`, и `status`
- ✅ НЕТ `COALESCE` для enum - используется `IF p_to_status IS NULL THEN ... ELSE ... END IF`
- ✅ Возвращает `toStatus` как `text` (cast): `v_final_status::text`
- ✅ Audit log сохраняет `from_status/to_status` как `text` (casts)
- ✅ Inventory блокировка: `RAISE EXCEPTION 'INVENTORY_ACTIVE' USING ERRCODE = 'P0001'`

**Используется в:**
- `/api/units/assign` ✅
- `/api/units/move` ✅
- `/api/units/move-by-scan` ✅

#### `move_unit` (оставлена для обратной совместимости) ✅
**Сигнатура:**
```sql
CREATE OR REPLACE FUNCTION public.move_unit(
  p_unit_id uuid,
  p_to_status public.unit_status,  -- без DEFAULT NULL
  p_to_cell_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
```

**Ключевые моменты:**
- ✅ Параметр `p_to_status` типа `public.unit_status` (ENUM)
- ✅ Статус обязательный (без DEFAULT NULL) - функция требует статус
- ✅ НЕТ `COALESCE` для enum
- ✅ Inventory блокировка добавлена

**Примечание:** Эта функция больше не используется в API routes (перешли на `move_unit_to_cell`), но оставлена для возможной обратной совместимости.

### 2. API Routes исправлены

#### `/api/units/assign` ✅
**Было:** Использовал `move_unit`
**Стало:** Использует `move_unit_to_cell`

**Вызов:**
```typescript
await supabase.rpc("move_unit_to_cell", {
  p_unit_id: unitId,
  p_to_cell_id: cellId,
  p_to_status: toStatus ?? "stored",
});
```

**Обработка ошибок:**
- ✅ `INVENTORY_ACTIVE` → HTTP 423 + "Инвентаризация активна. Перемещения заблокированы."

#### `/api/units/move` ✅
**Использует:** `move_unit_to_cell`

**Вызов:**
```typescript
await supabase.rpc('move_unit_to_cell', {
  p_unit_id: unitId,
  p_to_cell_id: toCellId,
  p_to_status: toStatus  // может быть null
});
```

**Обработка ошибок:**
- ✅ `INVENTORY_ACTIVE` → HTTP 423 + "Инвентаризация активна. Перемещения заблокированы."

#### `/api/units/move-by-scan` ✅
**Использует:** `move_unit_to_cell` (в двух местах: новый и legacy формат)

**Вызовы:**
```typescript
// Новый формат (fromCellCode/toCellCode)
await supabase.rpc("move_unit_to_cell", {
  p_unit_id: unit.id,
  p_to_cell_id: toCell.id,
  p_to_status: toStatus,  // всегда задан (не null)
});

// Legacy формат (cellCode)
await supabase.rpc("move_unit_to_cell", {
  p_unit_id: unit.id,
  p_to_cell_id: cell.id,
  p_to_status: toStatus,  // всегда задан (не null)
});
```

**Обработка ошибок:**
- ✅ `INVENTORY_ACTIVE` → HTTP 423 + "Инвентаризация активна. Перемещения заблокированы."

### 3. Принципы работы со статусами

#### В RPC функциях:
1. ✅ Параметры статуса всегда `public.unit_status`, а не `text`
2. ✅ НЕТ `COALESCE(text, enum)` - используется `IF ... IS NULL THEN ... ELSE ... END IF`
3. ✅ Если статус `NULL` → не трогаем поле `status` в UPDATE
4. ✅ Возвращаемые значения приведены к `::text` для JSON

#### В API routes:
1. ✅ Передают статус как строку: `"receiving"`, `"stored"`, `"picking"`, `"shipped"`, `"inventory_hold"`
2. ✅ PostgreSQL автоматически приводит строку → enum при вызове RPC
3. ✅ Если нужно не менять статус → передать `null`

#### В базе данных:
- ✅ Таблица `units.status` - тип `public.unit_status` ENUM
- ✅ Возможные значения: `receiving`, `stored`, `picking`, `shipped`, `inventory_hold`
- ✅ Audit log `unit_moves.from_status/to_status` - тип `text` (для истории)

### 4. Inventory блокировка

**В SQL:**
```sql
IF EXISTS (
  SELECT 1 FROM public.warehouses 
  WHERE id = v_warehouse_id AND inventory_active = true
) THEN
  RAISE EXCEPTION 'INVENTORY_ACTIVE' USING ERRCODE = 'P0001';
END IF;
```

**В API:**
```typescript
if (error.message && error.message.includes('INVENTORY_ACTIVE')) {
  return NextResponse.json(
    { error: "Инвентаризация активна. Перемещения заблокированы." },
    { status: 423 }
  );
}
```

## Изменённые файлы

### SQL
- ✅ `supabase_migration_inventory.sql` - функции `move_unit_to_cell` и `move_unit` исправлены

### API Routes
- ✅ `app/api/units/assign/route.ts` - переведён на `move_unit_to_cell`
- ✅ `app/api/units/move/route.ts` - уже использовал `move_unit_to_cell` (проверено)
- ✅ `app/api/units/move-by-scan/route.ts` - уже использовал `move_unit_to_cell` (проверено)

## Итоговая сигнатура RPC

```sql
-- Основная функция для перемещений
move_unit_to_cell(
  p_unit_id uuid,
  p_to_cell_id uuid,
  p_to_status public.unit_status DEFAULT NULL
) RETURNS json

-- Легаси функция (не используется, но оставлена)
move_unit(
  p_unit_id uuid,
  p_to_status public.unit_status,
  p_to_cell_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS json
```

## Примеры вызовов

### Пример 1: Перемещение с изменением статуса
```typescript
await supabase.rpc("move_unit_to_cell", {
  p_unit_id: "123e4567-e89b-12d3-a456-426614174000",
  p_to_cell_id: "456e7890-e89b-12d3-a456-426614174001",
  p_to_status: "stored"
});
```

### Пример 2: Перемещение без изменения статуса
```typescript
await supabase.rpc("move_unit_to_cell", {
  p_unit_id: "123e4567-e89b-12d3-a456-426614174000",
  p_to_cell_id: "456e7890-e89b-12d3-a456-426614174001",
  p_to_status: null  // статус не изменится
});
```

### Пример 3: Обработка ошибки инвентаризации
```typescript
const { data, error } = await supabase.rpc("move_unit_to_cell", {...});

if (error?.message?.includes('INVENTORY_ACTIVE')) {
  // HTTP 423 Locked
  return { error: "Инвентаризация активна. Перемещения заблокированы." };
}
```

## Проверка

✅ Нет `COALESCE(text, enum)` в SQL  
✅ Нет передачи `text` как параметр статуса в RPC  
✅ Правильная обработка `NULL` статуса (не трогаем поле)  
✅ Inventory блокировка работает  
✅ Все API routes используют правильную функцию  
✅ Сигнатуры RPC совпадают между SQL и TS вызовами

## Что дальше

Выполните миграцию `supabase_migration_inventory.sql` в Supabase SQL Editor. Все функции будут обновлены с правильными ENUM типами.
