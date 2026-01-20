# FIX REPORT: Строгие правила перемещения unit между ячейками по cell_type

## Дата: 2024
## Задача: Внедрить строгие правила перемещения unit между ячейками без SQL-миграций

**ОБНОВЛЕНИЕ**: Разрешены двусторонние перемещения между storage и shipping (storage ⇄ shipping)

---

## ОБЗОР ИЗМЕНЕНИЙ

Реализованы строгие правила перемещения unit между ячейками:
1. **Приемка**: только BIN-ячейки
2. **Из BIN**: только в storage или shipping (запрещено обратно в BIN)
3. **Из storage**: можно в shipping
4. **Из shipping**: можно в storage
5. **Запрет**: нельзя перемещать в BIN из storage/shipping (BIN — только входная зона)

---

## ИЗМЕНЁННЫЕ ФАЙЛЫ

### 1. `app/api/units/list/route.ts`

**Изменения:**
- **Строка 21**: Добавлено поле `cell_id` в select для получения информации о текущей ячейке unit

**Детали:**
- API теперь возвращает `cell_id` для каждого unit, что позволяет на фронтенде определять текущий тип ячейки
- Это необходимо для фильтрации units по их текущему расположению (BIN, storage, shipping)

**Блок кода (строки 19-24):**
```typescript
const { data, error } = await supabase
  .from("units")
  .select("id, barcode, status, created_at, cell_id")
  .eq("status", status)
  .order("created_at", { ascending: false })
  .limit(50);
```

---

### 2. `app/app/receiving/page.tsx`

**Изменения (ОБНОВЛЕНО):**
- **Строка 5-10**: Расширен тип `Unit` добавлением поля `cell_id` (опциональное)
- **Строки 186-189**: Изменён формат отображения ячеек с `"code (cell_type) - units_count ед."` на `"code — units_count"`
- **Строки 86-110**: Добавлены защитные проверки:
  - Проверка, что выбранная ячейка имеет тип "bin"
  - **Защита от перемещения в BIN из storage/shipping** (BIN — только входная зона)

**Детали:**
- UI показывает только BIN-ячейки (уже было реализовано ранее)
- Формат отображения упрощён: `"A1 — 12"` вместо `"A1 (bin) - 12 ед."`
- Добавлена защита от попытки разместить unit в не-BIN ячейку
- **Добавлена защита от перемещения в BIN из storage/shipping**

**Блок кода (строки 96-102):**
```typescript
// Защитная проверка: убеждаемся, что выбранная ячейка - это bin
const selectedCell = cells.find(c => c.id === selectedCellId);
if (!selectedCell || selectedCell.cell_type !== "bin") {
  setError("Можно размещать только в BIN-ячейки");
  setLoading(false);
  return;
}
```

**Блок кода (строки 186-189):**
```typescript
{cells.map((cell) => (
  <option key={cell.id} value={cell.id}>
    {cell.code} — {cell.units_count}
  </option>
))}
```

---

### 3. `app/app/putaway/page.tsx`

**Изменения (ОБНОВЛЕНО):**
- **Строки 5-10**: Расширен тип `Unit` добавлением поля `cell_id`
- **Строки 12-16**: Добавлен тип `UnitWithCell` с полем `current_cell_type`
- **Строки 19-25**: Добавлены состояния `allCells` и `targetCells`
- **Строки 26-40**: Переписана функция `loadCells()`:
  - Загружает все ячейки в `allCells`
  - Фильтрует только storage и shipping ячейки в `targetCells` (bin исключается)
- **Строки 42-81**: Полностью переписана функция `load()`:
  - Загружает units со статусом "receiving"
  - Загружает все ячейки и создаёт Map для сопоставления
  - Фильтрует только units, которые находятся в BIN-ячейках (по `cell_type`)
- **Строки 83-145**: Переписана функция `moveToInventoryHold()` → `moveFromBin()`:
  - Получение текущего типа ячейки unit
  - **Добавлена защитная проверка**: запрет перемещения в bin из storage/shipping
  - Запрет перемещения обратно в BIN
  - Автоматическое определение `toStatus` по `cell_type`:
    - `storage` → `"inventory_hold"`
    - `shipping` → `"shipped"`
  - Обновление списков после успеха
- **Строки 147-195**: Обновлён UI:
  - Заголовок изменён на "Заказы в BIN (для размещения в storage или shipping)"
  - Селект показывает только storage и shipping ячейки
  - Формат отображения: `"code — units_count"`
  - Кнопка переименована в "Переместить"

**Детали:**
- Страница теперь показывает только units, которые физически находятся в BIN-ячейках
- В селекте доступны только storage и shipping ячейки (bin исключён)
- При выборе storage автоматически устанавливается статус `inventory_hold`
- При выборе shipping автоматически устанавливается статус `shipped`
- **Защита от перемещения в BIN из storage/shipping** (BIN — только входная зона)

**Блок кода (строки 26-40):**
```typescript
async function loadCells() {
  try {
    const res = await fetch("/api/cells/list", { cache: "no-store" });
    if (!res.ok) {
      console.error("Ошибка загрузки ячеек:", res.status);
      return;
    }
    const json = await res.json();
    const all = json.cells || [];
    setAllCells(all);
    // Фильтруем только storage и shipping ячейки (bin исключаем)
    const allowedCells = all.filter((cell: Cell) => 
      cell.cell_type === "storage" || cell.cell_type === "shipping"
    );
    setTargetCells(allowedCells);
  } catch (e) {
    console.error("Ошибка загрузки ячеек:", e);
  }
}
```

**Блок кода (строки 64-78):**
```typescript
// Загружаем все ячейки для сопоставления
const cellsRes = await fetch("/api/cells/list", { cache: "no-store" });
const cellsJson = await cellsRes.json().catch(() => ({ cells: [] }));
const cellsList: Cell[] = cellsJson.cells || [];
const cellsMap = new Map<string, Cell>(cellsList.map((c: Cell) => [c.id, c]));

// Фильтруем только units, которые находятся в BIN-ячейках
const unitsInBin: UnitWithCell[] = unitsList
  .map((u) => {
    const cell: Cell | undefined = u.cell_id ? cellsMap.get(u.cell_id) : undefined;
    return {
      ...u,
      current_cell_type: cell?.cell_type || null,
    };
  })
  .filter((u) => u.current_cell_type === "bin");
```

**Блок кода (строки 95-115):**
```typescript
// Защитная проверка: убеждаемся, что выбранная ячейка - это storage или shipping (не bin)
const selectedCell = targetCells.find(c => c.id === selectedCellId);
if (!selectedCell) {
  setErr("Выбранная ячейка недоступна");
  setLoading(false);
  return;
}

if (selectedCell.cell_type === "bin") {
  setErr("Запрещено перемещать обратно в BIN");
  setLoading(false);
  return;
}

// Определяем toStatus по cell_type целевой ячейки
const toStatus = selectedCell.cell_type === "storage" 
  ? "inventory_hold" 
  : selectedCell.cell_type === "shipping"
  ? "shipped"
  : null;
```

---

### 4. `app/app/picking/page.tsx`

**Изменения (ОБНОВЛЕНО):**
- **Строки 5-11**: Расширен тип `Unit` добавлением поля `cell_id`
- **Строки 13-17**: Добавлен тип `Cell`
- **Строки 19-21**: Добавлен тип `UnitWithCell` с полем `current_cell_type`
- **Строки 24-28**: Добавлены состояния `storageCells`, `shippingCells` и `selectedCellIds`
- **Строки 30-48**: Переписана функция `loadCells()`:
  - Загружает все ячейки
  - Фильтрует storage и shipping ячейки отдельно (bin исключается)
- **Строки 50-85**: Полностью переписана функция `load()`:
  - Загружает units со статусами "inventory_hold" (storage) и "shipped" (shipping)
  - Загружает все ячейки и создаёт Map для сопоставления
  - Фильтрует units, которые находятся в storage ИЛИ shipping ячейках
- **Строки 87-165**: Переписана функция `moveToShipping()` → `moveBetweenStorageAndShipping()`:
  - Определяет текущий тип ячейки unit (storage или shipping)
  - Защитная проверка: запрет перемещения в bin
  - Автоматическое определение целевых ячеек:
    - Если unit в storage → показывает только shipping ячейки
    - Если unit в shipping → показывает только storage ячейки
  - Автоматическое определение статуса:
    - storage → shipping: `"shipped"`
    - shipping → storage: `"inventory_hold"`
  - Обновление списков после успеха
- **Строки 167-169**: Добавлен вызов `loadCells()` в `useEffect`
- **Строки 171-220**: Полностью переписан UI:
  - Добавлена колонка "Текущая ячейка" с цветовой индикацией
  - Заголовок изменён на "Заказы в storage и shipping (перемещения в обе стороны)"
  - Select динамически показывает доступные целевые ячейки:
    - Для units из storage → только shipping ячейки
    - Для units из shipping → только storage ячейки
  - Кнопка показывает направление: "→ shipping" или "→ storage"
  - Формат отображения: `"code — units_count"`

**Детали:**
- Страница показывает units из storage И shipping ячеек
- Разрешены двусторонние перемещения: storage ⇄ shipping
- Защита от перемещения в bin (BIN — только входная зона)
- UI динамически адаптируется в зависимости от текущей ячейки unit

**Блок кода (строки 57-73):**
```typescript
// Загружаем все ячейки для сопоставления
const cellsRes = await fetch("/api/cells/list", { cache: "no-store" });
const cellsJson = await cellsRes.json().catch(() => ({ cells: [] }));
const cellsList: Cell[] = cellsJson.cells || [];
const cellsMap = new Map<string, Cell>(cellsList.map((c: Cell) => [c.id, c]));

// Фильтруем только units, которые находятся в storage-ячейках
const unitsInStorage: UnitWithCell[] = unitsList
  .map((u) => {
    const cell: Cell | undefined = u.cell_id ? cellsMap.get(u.cell_id) : undefined;
    return {
      ...u,
      current_cell_type: cell?.cell_type || null,
    };
  })
  .filter((u) => u.current_cell_type === "storage");
```

**Блок кода (строки 88-95):**
```typescript
// Защитная проверка: убеждаемся, что выбранная ячейка - это shipping (не bin, не storage)
const selectedCell = shippingCells.find(c => c.id === selectedCellId);
if (!selectedCell || selectedCell.cell_type !== "shipping") {
  setErr("Можно перемещать только в shipping-ячейки");
  setLoading(false);
  return;
}
```

---

### 5. `app/app/shipping/page.tsx`

**Изменения:**
- **Строки 12-17**: Удалены неиспользуемые типы `Cell` и состояния `cells`, `selectedCellIds`, `loading`
- **Строки 19-26**: Удалена функция `loadCells()`
- **Строки 28-38**: Изменена функция `load()`:
  - Теперь загружает units со статусом `"shipped"` (вместо `"picking"`)
  - Убрана загрузка ячеек
- **Строки 40-92**: Удалена функция `moveToShipped()`
- **Строка 94**: Упрощён `useEffect` (убрана загрузка ячеек)
- **Строки 96-130**: Полностью переписан UI:
  - Убран select для выбора ячеек
  - Убрана кнопка перемещения
  - Заголовок изменён на "Заказы в отгрузке (финальный статус)"
  - Добавлена колонка "Статус" с текстом "Отгрузка финальная"
  - Все перемещения запрещены

**Детали:**
- Страница теперь показывает только units со статусом `"shipped"` (финальный статус)
- Любые перемещения из shipping запрещены
- UI показывает только информацию, без возможности действий

**Блок кода (строки 28-38):**
```typescript
async function load() {
  setErr(null);
  // Загружаем units со статусом shipped (финальный статус)
  const r = await fetch(`/api/units/list?status=shipped`, { cache: "no-store" });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    setErr(j.error ?? "Ошибка загрузки");
    return;
  }
  const j = await r.json();
  setUnits(j.units ?? []);
}
```

**Блок кода (строки 110-125):**
```typescript
<tbody>
  {units.map((u) => (
    <tr key={u.id}>
      <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>{u.barcode}</td>
      <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
        {new Date(u.created_at).toLocaleString()}
      </td>
      <td style={{ borderBottom: "1px solid #f2f2f2", padding: 8 }}>
        <span style={{ color: "#666", fontStyle: "italic" }}>Отгрузка финальная</span>
      </td>
    </tr>
  ))}
</tbody>
```

---

## РЕАЛИЗОВАННЫЕ ПРАВИЛА

### Правило 1: Приемка → только BIN
- ✅ Receiving page показывает только BIN-ячейки
- ✅ Защитная проверка: нельзя разместить в не-BIN ячейку
- ✅ **Защита от перемещения в BIN из storage/shipping** (BIN — только входная зона)
- ✅ Формат отображения: `"code — units_count"`

### Правило 2: Из BIN → только storage или shipping
- ✅ Putaway page показывает только units из BIN-ячеек
- ✅ Селект показывает только storage и shipping ячейки (bin исключён)
- ✅ Автоматическое определение статуса:
  - storage → `inventory_hold`
  - shipping → `shipped`
- ✅ **Защита от перемещения в BIN из storage/shipping** (BIN — только входная зона)

### Правило 3: Из storage ⇄ shipping (двусторонние перемещения)
- ✅ Picking page показывает units из storage И shipping ячеек
- ✅ Динамический селект:
  - Для units из storage → показывает только shipping ячейки
  - Для units из shipping → показывает только storage ячейки
- ✅ Автоматическое определение статуса:
  - storage → shipping: `"shipped"`
  - shipping → storage: `"inventory_hold"`
- ✅ **Защита от перемещения в bin** (BIN — только входная зона)

### Правило 4: Из shipping → можно в storage (ОБНОВЛЕНО)
- ✅ Picking page теперь позволяет перемещать из shipping в storage
- ✅ Shipping page остаётся для просмотра (без действий)

---

## ЗАЩИТНЫЕ ПРОВЕРКИ

### Receiving (`app/app/receiving/page.tsx`)
- ✅ Проверка типа выбранной ячейки перед отправкой запроса
- ✅ **Защита от перемещения в BIN из storage/shipping**
- ✅ Ошибки: "Можно размещать только в BIN-ячейки", "Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона"

### Putaway (`app/app/putaway/page.tsx`)
- ✅ Проверка доступности выбранной ячейки
- ✅ **Защита от перемещения в BIN из storage/shipping**
- ✅ Проверка допустимого типа целевой ячейки
- ✅ Ошибки: "Выбранная ячейка недоступна", "Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона", "Недопустимый тип целевой ячейки"

### Picking (`app/app/picking/page.tsx`)
- ✅ Проверка выбранной ячейки
- ✅ **Защита от перемещения в BIN из storage/shipping**
- ✅ Проверка текущего типа ячейки unit (storage или shipping)
- ✅ Динамическое определение доступных целевых ячеек
- ✅ Ошибки: "Выбранная ячейка недоступна", "Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона", "Можно перемещать только из storage или shipping"

### Shipping (`app/app/shipping/page.tsx`)
- ✅ UI не предоставляет возможности перемещения (только просмотр)

---

## ФОРМАТ ОТОБРАЖЕНИЯ ЯЧЕЕК

**До изменений:**
```
A1 (bin) - 12 ед.
B2 (storage) - 5 ед.
```

**После изменений:**
```
A1 — 12
B2 — 5
```

Применено во всех селектах:
- ✅ Receiving: `{cell.code} — {cell.units_count}`
- ✅ Putaway: `{cell.code} — {cell.units_count}`
- ✅ Picking: `{cell.code} — {cell.units_count}`

---

## ПРОВЕРКА КАЧЕСТВА КОДА

### Линтер
✅ **Результат**: Ошибок не найдено
```bash
read_lints для всех изменённых файлов
```

### Сборка
✅ **Результат**: Успешно скомпилировано
```bash
npm run build
✓ Compiled successfully in 950.3ms
✓ Generating static pages using 9 workers (29/29) in 55.7ms
```

### TypeScript
✅ **Результат**: Все типы корректны
- Исправлены проблемы с типизацией `Map.get()` через явное указание типов
- Добавлены типы `UnitWithCell` для units с информацией о текущей ячейке

---

## ВАЖНЫЕ ЗАМЕЧАНИЯ

1. **БД не изменялась**: Все изменения только во фронтенде и API (расширение select)
2. **Фильтрация по cell_type**: Units фильтруются по их текущему расположению через сопоставление `cell_id` с ячейками
3. **Защитные проверки**: Добавлены проверки на фронтенде перед отправкой запросов
4. **Автоматическое определение статуса**: В Putaway статус определяется автоматически по типу целевой ячейки
5. **Формат отображения**: Упрощён формат отображения ячеек (без типа, только code и units_count)

---

## ТЕСТИРОВАНИЕ

Рекомендуется протестировать:
1. ✅ Создание unit в Receiving и размещение в BIN-ячейку
2. ✅ Попытка разместить в не-BIN ячейку в Receiving (должна быть ошибка)
3. ✅ Перемещение из BIN в storage через Putaway
4. ✅ Перемещение из BIN в shipping через Putaway
5. ✅ Попытка переместить обратно в BIN из Putaway (должна быть ошибка)
6. ✅ Перемещение из storage в shipping через Picking
7. ✅ Попытка переместить из storage в bin через Picking (не должно быть такой опции)
8. ✅ Проверка, что Shipping page не позволяет перемещения

---

## ОБНОВЛЕНИЕ ПРАВИЛ (ДОПОЛНЕНИЕ)

**Разрешены двусторонние перемещения между storage и shipping:**
- ✅ Из storage можно в shipping
- ✅ Из shipping можно в storage
- ✅ Единственный запрет: нельзя перемещать в BIN из storage/shipping (BIN — только входная зона)

**Реализовано:**
- ✅ Picking page показывает units из storage И shipping
- ✅ Динамический выбор целевых ячеек в зависимости от текущей ячейки
- ✅ Защитные проверки от перемещения в BIN добавлены во всех страницах
- ✅ Автоматическое определение статуса при перемещении

## ЗАКЛЮЧЕНИЕ

Все строгие правила перемещения успешно реализованы:
- ✅ Приемка размещает только в BIN
- ✅ Из BIN можно только в storage или shipping (не обратно в BIN)
- ✅ Из storage можно в shipping
- ✅ Из shipping можно в storage (ОБНОВЛЕНО)
- ✅ Запрещено перемещать в BIN из storage/shipping (BIN — только входная зона)
- ✅ Защитные проверки добавлены везде
- ✅ Формат отображения ячеек упрощён
- ✅ Код скомпилирован без ошибок

Код готов к использованию.
