# Production Fix Report: Ops -> Shipping Tasks (Picking Tasks)

## Дата: 2025-01-XX

## Обзор
Production-ready реализация функционала "Ops -> задания на отгрузку в picking" для создания заданий складчикам на перемещение units из storage/shipping в picking ячейки. Выполнение через ТСД (keyboard-wedge scanner).

## Измененные файлы

### SQL Миграции
1. **`supabase_migration_picking_tasks.sql`** (НОВЫЙ)
   - Создание таблицы `picking_tasks` с полями:
     - `id`, `warehouse_id`, `unit_id`, `from_cell_id` (snapshot), `target_picking_cell_id`
     - `scenario`, `status` (open/in_progress/done/canceled)
     - `created_by`, `created_at`, `picked_by`, `picked_at`, `completed_by`, `completed_at`
   - RLS политики:
     - SELECT: все роли warehouse
     - INSERT: admin/head/manager/ops
     - UPDATE: admin/head/manager/ops/worker (worker не может менять target_picking_cell_id)
   - Индексы для производительности
   - `NOTIFY pgrst, 'reload schema';`

### API Routes
2. **`app/api/ops/picking-tasks/create/route.ts`** (НОВЫЙ)
   - POST `/api/ops/picking-tasks/create`
   - Body: `{ unitIds?: string[], barcodes?: string[], targetPickingCellId: string, scenario?: string }`
   - **Production валидация:**
     - Проверка роли: admin/head/manager/ops
     - Проверка наличия picking ячеек (понятная ошибка если нет)
     - Проверка target cell: cell_type === 'picking', активна, принадлежит warehouse
     - Проверка units: ТОЛЬКО в storage/shipping (не bin, не picking, не null)
     - Создание задач с snapshot from_cell_id
   - Response: `{ ok: true, tasks: [], count: number }`

3. **`app/api/tsd/shipping-tasks/list/route.ts`** (НОВЫЙ)
   - GET `/api/tsd/shipping-tasks/list`
   - **Production логика:**
     - Приоритет для in_progress задач текущего пользователя
     - Сортировка: in_progress (current user) -> in_progress (others) -> open (by created_at)
     - JOIN с units и target_cell
     - Получение текущих fromCell (актуальное состояние, не snapshot)
   - Response: `{ ok: true, tasks: [...] }`

4. **`app/api/tsd/shipping-tasks/complete/route.ts`** (НОВЫЙ)
   - POST `/api/tsd/shipping-tasks/complete`
   - Body: `{ taskId: string, fromCellCode: string, toCellCode: string, unitBarcode: string }`
   - **Production валидация:**
     - Проверка роли: worker/ops/admin/head/manager
     - Проверка task: принадлежит warehouse, не done/canceled
     - Проверка unit barcode совпадает с задачей
     - Проверка toCellCode совпадает с target_picking_cell_id
     - Проверка unit находится в fromCellCode
     - Проверка разрешенного перемещения: storage/shipping -> picking OK, bin -> picking forbidden
   - **Production логика:**
     - Обновление задачи в in_progress (если open): `picked_by`, `picked_at`
     - Перемещение через `move_unit_to_cell(..., p_to_status='picking')`
     - Обработка 423 inventory_active: rollback in_progress, возврат понятной ошибки
     - Закрытие задачи: `status='done'`, `completed_by`, `completed_at`
     - Rollback in_progress если move failed
   - Response: `{ ok: true, task: {...}, unit: {...}, targetCell: {...} }`

5. **`app/api/units/by-barcode/route.ts`** (ИЗМЕНЕН)
   - Добавлена проверка warehouse_id для фильтрации
   - Добавлено возвращение информации о текущей ячейке (cell: { id, code, cell_type })
   - Улучшены сообщения об ошибках (на русском)

### UI Страницы
6. **`app/app/ops-shipping/page.tsx`** (НОВЫЙ)
   - Страница для создания заданий на отгрузку
   - **Production features:**
     - Поиск unit по barcode через `/api/units/by-barcode`
     - Показ текущей ячейки unit и типа (cell.code, cell.cell_type)
     - Валидация: unit должен быть в storage/shipping перед добавлением
     - Выбор target picking ячейки (dropdown)
     - Проверка наличия picking ячеек с понятной ошибкой
     - Поле "Сценарий" (textarea)
     - Таблица выбранных units с текущей ячейкой
     - Таблица созданных задач (open/in_progress) с фильтрацией и обновлением
     - Улучшенный UX с понятными ошибками

7. **`app/app/tsd/page.tsx`** (ИЗМЕНЕН)
   - Добавлен режим `"shipping"` в тип `Mode`
   - **Production state machine:**
     - State: `shippingFromCell | null`, `shippingUnit | null`, `shippingToCell | null`
     - Последовательность: FROM -> UNIT -> TO
     - Автоматическое выполнение после TO scan
   - **Production features:**
     - Загрузка задач при входе в режим
     - Приоритет для in_progress задач текущего пользователя
     - Правильная нормализация кода ячейки (поддержка CELL:CODE и CODE, case-insensitive)
     - Проверка типов ячеек (FROM: storage/shipping, TO: picking)
     - Валидация совпадения с задачей (unit barcode, target cell code)
     - Автоматический переход к следующей задаче после завершения
     - Крупное красное уведомление для 423 (inventory_active)
     - Улучшенный UI с пошаговыми инструкциями и индикаторами прогресса
     - Кнопки: "Сброс", "Обновить список задач"
     - Обработка ошибок с понятными сообщениями на русском

8. **`app/app/ui/LeftNav.tsx`** (ИЗМЕНЕН)
   - Добавлена переменная `canOps` для роли ops
   - Добавлена переменная `canViewTasks` для ролей, которые могут видеть задачи
   - Добавлен раздел "OPS" с ссылкой "Создать задания" (`/app/ops-shipping`)
   - Обновлена логика отображения ТСД для роли ops
   - Добавлены заголовки разделов для лучшей навигации

## Функциональность

### Создание задач (Ops)
1. **Доступ:** роли admin/head/manager/ops
2. **Процесс:**
   - Поиск units по штрихкоду через `/api/units/by-barcode`
   - Показ текущей ячейки unit и типа
   - Валидация: unit должен быть ТОЛЬКО в storage или shipping (не bin, не picking, не null)
   - Добавление units в список выбранных
   - Выбор целевой picking ячейки (обязательно, проверка наличия)
   - Ввод сценария (опционально)
   - Создание задач (одна задача на unit)
   - Отображение созданных задач в таблице

### Выполнение задач (Worker/Ops)
1. **Доступ:** роли worker/ops/admin/head/manager
2. **Процесс:**
   - Режим "Отгрузка" в ТСД показывает задачи (open/in_progress)
   - Приоритет для in_progress задач текущего пользователя
   - Последовательность сканирования:
     1. FROM ячейка (storage/shipping) - нормализация кода ячейки
     2. UNIT штрихкод - проверка совпадения с задачей
     3. TO ячейка (picking) - проверка совпадения с target_picking_cell_id
   - После 3-го скана автоматически:
     - Обновление задачи в in_progress (если open): `picked_by`, `picked_at`
     - Перемещение через `move_unit_to_cell(..., p_to_status='picking')`
     - Закрытие задачи (status -> 'done', completed_by/at)
     - Автоматический переход к следующей задаче

### Обработка ошибок
1. **Инвентаризация активна (423):**
   - Крупное красное уведомление вверху экрана
   - Сообщение: "⚠️ ИНВЕНТАРИЗАЦИЯ АКТИВНА. ПЕРЕМЕЩЕНИЯ ЗАБЛОКИРОВАНЫ."
   - Rollback задачи из in_progress в open (если была обновлена)
   - Задача НЕ закрывается
   - Состояние сканирования сохраняется для повторной попытки

2. **Ошибки валидации:**
   - Unit не в FROM ячейке → ошибка, задача не закрывается, rollback in_progress
   - TO ячейка не совпадает с задачей → ошибка
   - Штрихкод не совпадает с задачей → ошибка
   - Недопустимое перемещение (bin -> picking) → ошибка
   - FROM ячейка не storage/shipping → ошибка
   - TO ячейка не picking → ошибка

3. **Ошибки создания задачи:**
   - Нет picking ячеек → понятная ошибка "Нет picking ячеек. Добавьте на карте склада cell_type='picking'"
   - Unit не в storage/shipping → список невалидных units с деталями
   - Unit не размещен → ошибка

## Безопасность

### RLS Политики
1. **SELECT:** все роли warehouse могут читать задачи
2. **INSERT:** только admin/head/manager/ops могут создавать задачи
3. **UPDATE:** admin/head/manager/ops/worker могут обновлять, но worker НЕ может менять `target_picking_cell_id`

### API Проверки
- Все endpoints проверяют роль пользователя
- Проверка принадлежности к warehouse
- Проверка прав на создание/выполнение задач
- Валидация данных перед выполнением
- Проверка разрешенных перемещений
- Rollback изменений при ошибках

## Ключевые фрагменты кода

### API: Проверка unit только в storage/shipping
```typescript
// app/api/ops/picking-tasks/create/route.ts (строки 124-148)
const invalidUnits: string[] = [];
allUnits.forEach((unit) => {
  if (!unit.cell_id) {
    invalidUnits.push(unit.barcode + " (не размещен)");
  } else {
    const cellType = cellTypesMap.get(unit.cell_id);
    if (!cellType || (cellType !== "storage" && cellType !== "shipping")) {
      invalidUnits.push(
        unit.barcode + (cellType ? ` (находится в ${cellType}, должен быть в storage/shipping)` : " (ячейка не найдена)")
      );
    }
  }
});

if (invalidUnits.length > 0) {
  return NextResponse.json(
    {
      error: "Нельзя создать задачу для заказов вне storage/shipping",
      invalidUnits,
    },
    { status: 400 }
  );
}
```

### API: Приоритет для in_progress задач текущего пользователя
```typescript
// app/api/tsd/shipping-tasks/list/route.ts (строки 64-77)
const sortedTasks = (tasks || []).sort((a: any, b: any) => {
  // Priority 1: in_progress for current user
  const aIsMyInProgress = a.status === "in_progress" && a.picked_by === userData.user.id;
  const bIsMyInProgress = b.status === "in_progress" && b.picked_by === userData.user.id;
  if (aIsMyInProgress && !bIsMyInProgress) return -1;
  if (!aIsMyInProgress && bIsMyInProgress) return 1;
  
  // Priority 2: in_progress (any user) before open
  if (a.status === "in_progress" && b.status === "open") return -1;
  if (a.status === "open" && b.status === "in_progress") return 1;
  
  // Priority 3: by created_at
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
});
```

### API: Обработка in_progress и rollback при ошибках
```typescript
// app/api/tsd/shipping-tasks/complete/route.ts (строки 106-121, 168-188)
// Update task to in_progress if it was open
const updateToInProgress = task.status === "open";
if (updateToInProgress) {
  const { error: inProgressError } = await supabase
    .from("picking_tasks")
    .update({
      status: "in_progress",
      picked_by: userData.user.id,
      picked_at: new Date().toISOString(),
    })
    .eq("id", taskId);
}

// При ошибке 423 - rollback
if (rpcError && rpcError.message.includes("INVENTORY_ACTIVE")) {
  if (updateToInProgress) {
    await supabase
      .from("picking_tasks")
      .update({
        status: "open",
        picked_by: null,
        picked_at: null,
      })
      .eq("id", taskId);
  }
  return NextResponse.json(
    { error: "Инвентаризация активна. Перемещения заблокированы." },
    { status: 423 }
  );
}
```

### UI: Проверка наличия picking ячеек
```typescript
// app/app/ops-shipping/page.tsx (строки 35-46)
useEffect(() => {
  async function loadPickingCells() {
    try {
      const res = await fetch("/api/cells/list", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        const picking = (json.cells || []).filter((c: Cell) => c.cell_type === "picking");
        setPickingCells(picking);
        if (picking.length === 0) {
          setError("Нет picking ячеек. Добавьте на карте склада ячейки с cell_type='picking'");
        }
      }
    } catch (e) {
      console.error("Failed to load picking cells:", e);
      setError("Ошибка загрузки ячеек");
    }
  }
  loadPickingCells();
  loadTasks();
}, []);
```

### UI: Валидация unit перед добавлением
```typescript
// app/app/ops-shipping/page.tsx (строки 67-90)
if (!json.unit.cell_id) {
  setError(`Заказ ${json.unit.barcode} не размещен в ячейке. Нужно разместить в storage/shipping перед созданием задачи.`);
  return;
}

if (json.cell.cell_type !== "storage" && json.cell.cell_type !== "shipping") {
  setError(`Заказ ${json.unit.barcode} находится в ячейке типа "${json.cell.cell_type}". Можно создавать задачи только для заказов в storage/shipping.`);
  return;
}
```

### TSD: Нормализация кода ячейки и валидация
```typescript
// app/app/tsd/page.tsx (строки 553-577)
// Normalize cell code: remove "CELL:" prefix, uppercase, trim
const normalizedCode = parsed.code.replace(/^CELL:/i, "").trim().toUpperCase();

const cell = (json.cells || []).find((c: CellInfo) => 
  c.code.toUpperCase() === normalizedCode
);

if (cell) {
  // Verify cell is storage or shipping (not bin, not picking)
  if (cell.cell_type !== "storage" && cell.cell_type !== "shipping") {
    setError(`Ячейка "${cell.code}" имеет тип "${cell.cell_type}". FROM должна быть storage или shipping.`);
    return;
  }
  // ...
}
```

### TSD: Крупное уведомление для 423
```typescript
// app/app/tsd/page.tsx (строки 600-618)
{mode === "shipping" && error && error.includes("ИНВЕНТАРИЗАЦИЯ АКТИВНА") && (
  <div
    style={{
      position: "sticky",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 200,
      padding: "var(--spacing-xl)",
      fontSize: "24px",
      fontWeight: 700,
      textAlign: "center",
      boxShadow: "var(--shadow-lg)",
      background: "#fff",
    }}
  >
    <Alert
      variant="error"
      style={{
        fontSize: "20px",
        padding: "var(--spacing-xl)",
        background: "#ffebee",
        border: "3px solid #f44336",
      }}
    >
      {error}
    </Alert>
  </div>
)}
```

## Тестирование (Production Checklist)

### Шаг 1: Применить SQL миграцию
```sql
-- Выполнить в Supabase SQL Editor
-- Файл: supabase_migration_picking_tasks.sql
-- Проверить: таблица создана, RLS включен, индексы созданы
```

### Шаг 2: Проверка наличия picking ячеек
1. Открыть карту склада `/app/warehouse-map`
2. Создать ячейку с `cell_type='picking'` (если нет)
3. **Ожидаемый результат:** ячейка создана и доступна в выборе

### Шаг 3: Тестирование создания задач (Ops)
1. Войти как пользователь с ролью `ops` (или admin/head/manager)
2. Перейти в раздел "OPS" → "Создать задания"
3. **Проверка ошибок:**
   - Если нет picking ячеек → показана красная ошибка "Нет picking ячеек..."
   - Попытка добавить unit не в storage/shipping → ошибка с деталями
   - Попытка добавить unit без ячейки → ошибка "не размещен"
4. Отсканировать или ввести штрихкод unit в storage/shipping
   - **Ожидаемый результат:** unit добавлен, показана текущая ячейка и тип
5. Выбрать целевую picking ячейку
6. Опционально: ввести сценарий
7. Нажать "Создать задания"
   - **Ожидаемый результат:** задачи созданы, отображается количество, задачи видны в таблице

### Шаг 4: Тестирование выполнения задач (Worker)
1. Войти как пользователь с ролью `worker` (или ops/admin/head/manager)
2. Перейти в ТСД (`/app/tsd`)
3. Выбрать режим "Отгрузка"
   - **Ожидаемый результат:** отображается текущая задача (приоритет для in_progress текущего пользователя)
4. Отсканировать FROM ячейку (storage/shipping)
   - **Ожидаемый результат:** FROM ячейка отображается, проверка типа пройдена
   - Попытка отсканировать bin ячейку → ошибка
5. Отсканировать штрихкод unit
   - **Ожидаемый результат:** UNIT отображается, проверка совпадения с задачей пройдена
   - Неверный штрихкод → ошибка "не совпадает с задачей"
6. Отсканировать TO ячейку (picking)
   - **Ожидаемый результат:** автоматически выполняется перемещение, задача закрывается, успешное уведомление
   - Неверная ячейка → ошибка "не совпадает с задачей"
   - Автоматически берется следующая задача (если есть)

### Шаг 5: Тестирование ошибок
1. **Unit не в FROM ячейке:**
   - Создать задачу для unit в ячейке A1
   - Попытаться выполнить задачу, отсканировав FROM ячейку B1
   - **Ожидаемый результат:** ошибка "Unit находится не в ячейке...", задача остается open, rollback in_progress если была обновлена

2. **Инвентаризация активна:**
   - Включить инвентаризацию в разделе "Инвентаризация"
   - Попытаться выполнить задачу (достичь TO скана)
   - **Ожидаемый результат:** крупное красное уведомление "⚠️ ИНВЕНТАРИЗАЦИЯ АКТИВНА...", статус 423, задача НЕ закрывается, rollback из in_progress в open, состояние сканирования сохраняется

3. **Недопустимое перемещение:**
   - Попытка создать задачу с FROM ячейкой типа `bin` → ошибка при валидации
   - Попытка отсканировать FROM ячейку типа `picking` → ошибка "FROM должна быть storage или shipping"

4. **Нет picking ячеек:**
   - Удалить все picking ячейки
   - Попытка создать задачу → ошибка "Нет picking ячеек. Добавьте на карте склада..."

### Шаг 6: Тестирование прав доступа
1. **Worker не может менять target picking cell:**
   - Войти как worker
   - Попытка выполнить задачу, отсканировав другую TO ячейку
   - **Ожидаемый результат:** ошибка "Ячейка не совпадает с задачей"

2. **Guest не может видеть задачи:**
   - Войти как guest
   - Попытка открыть `/app/ops-shipping` или ТСД в режиме "Отгрузка"
   - **Ожидаемый результат:** 403 Forbidden или отсутствие доступа

3. **Ops может создавать, worker может выполнять:**
   - Создать задачу как ops
   - Выполнить задачу как worker
   - **Ожидаемый результат:** успешное выполнение

### Шаг 7: Тестирование приоритета задач
1. Создать 2 задачи как ops
2. Войти как worker1, начать выполнение первой задачи (достичь UNIT скана) → задача in_progress
3. Войти как worker2
   - **Ожидаемый результат:** видит свою in_progress задачу (если есть) или первую open задачу
4. Завершить задачу worker1
   - **Ожидаемый результат:** задача closed, worker1 видит следующую open задачу

### Шаг 8: Тестирование мобильной адаптации
1. Открыть ТСД на мобильном устройстве
2. Выбрать режим "Отгрузка"
   - **Ожидаемый результат:** киоск-режим (без левого/верхнего меню), кнопка "Вернуться" работает
3. Проверить сканирование на мобильном
   - **Ожидаемый результат:** все работает корректно

### Шаг 9: Тестирование нормализации кода ячейки
1. Создать задачу
2. В ТСД отсканировать FROM ячейку в форматах:
   - "CELL:A1" → должно работать
   - "A1" → должно работать
   - "cell:a1" → должно работать (case-insensitive)
   - **Ожидаемый результат:** все форматы нормализуются и работают

### Шаг 10: Тестирование rollback при ошибках
1. Создать задачу
2. Начать выполнение (достичь UNIT скана) → задача in_progress
3. Попытаться завершить с ошибкой (неверная TO ячейка)
   - **Ожидаемый результат:** ошибка, задача rollback в open, picked_by/picked_at очищены

## Важные моменты (Production)

1. **Никаких изменений в `/login`** ✅
2. **Минимальные риски для продакшена:**
   - Новые таблицы и endpoints не влияют на существующий функционал
   - Существующие режимы ТСД не изменены
   - Добавлены только новые функции
   - Обратная совместимость сохранена

3. **Production-level валидация:**
   - Проверка типов ячеек на всех этапах
   - Проверка разрешенных перемещений
   - Rollback при ошибках
   - Понятные ошибки на русском языке

4. **Production-level UX:**
   - Пошаговые инструкции в ТСД
   - Индикаторы прогресса
   - Крупные уведомления для критичных ошибок
   - Автоматический переход к следующей задаче
   - Таблицы с полной информацией

5. **Production-level безопасность:**
   - RLS политики на уровне БД
   - Дополнительные проверки в API
   - Валидация warehouse_id на всех этапах
   - Проверка ролей на всех endpoints

## Известные ограничения

1. Worker не может изменить целевую picking ячейку после создания задачи (по дизайну)
2. Задачи автоматически закрываются после успешного выполнения (отмены нет, можно добавить позже)
3. При ошибке выполнения задачи она остается открытой (можно повторить)

## Следующие шаги (опционально)
1. Добавить возможность отмены задач (ops/admin)
2. Добавить историю выполненных задач с фильтрацией
3. Добавить статистику по задачам (время выполнения, количество за смену)
4. Добавить уведомления при создании новых задач
5. Добавить возможность массового создания задач (CSV импорт)

## Заключение
Production-ready функционал полностью реализован. Все требования выполнены:
- ✅ Создание задач ops с валидацией
- ✅ Выполнение задач worker через ТСД
- ✅ Валидация и обработка ошибок на production уровне
- ✅ Обработка inventory_active с rollback
- ✅ Ограничения по ролям
- ✅ Безопасность через RLS + API проверки
- ✅ Мобильная адаптация ТСД
- ✅ Понятные ошибки на русском
- ✅ Никаких изменений в /login
- ✅ Production-level UX
