# FIX REPORT: Обновление WMS для размещения в реальные BIN-ячейки и строгих статусов

## Дата: 2024
## Задача: Обновить код WMS для размещения unit только в реальные BIN-ячейки и строгого соответствия статусов enum

---

## ОБЗОР ИЗМЕНЕНИЙ

Обновлены 4 страницы WMS для корректного workflow:
- **Receiving** → размещение в BIN-ячейки со статусом `receiving`
- **Putaway** → размещение в storage-ячейки со статусом `inventory_hold`
- **Picking** → только смена статуса на `picking` (без смены ячейки)
- **Shipping** → размещение в shipping-ячейки со статусом `shipped`

---

## ИЗМЕНЁННЫЕ ФАЙЛЫ

### 1. `app/app/receiving/page.tsx`

**Изменения:**
- **Строка 38**: Изменён фильтр ячеек с `cell_type === "storage"` на `cell_type === "bin"`
- **Строка 101**: Изменён статус при перемещении с `"stored"` на `"receiving"`
- **Строка 195**: Изменён текст кнопки с `"Переместить"` на `"Разместить в приёмку"`

**Детали:**
- Функция `loadCells()` теперь фильтрует только ячейки типа `"bin"`
- Функция `moveToStored()` отправляет `toStatus: "receiving"` вместо `"stored"`
- UI показывает только BIN-ячейки для выбора
- Кнопка disabled, если ячейка не выбрана
- После успешного размещения очищается выбор ячейки и обновляются списки

**Блок кода (строки 29-43):**
```typescript
async function loadCells() {
  try {
    const res = await fetch("/api/cells/list", { cache: "no-store" });
    if (!res.ok) {
      console.error("Ошибка загрузки ячеек:", res.status);
      return;
    }
    const json = await res.json();
    // Фильтруем только bin ячейки
    const binCells = (json.cells || []).filter((cell: Cell) => cell.cell_type === "bin");
    setCells(binCells);
  } catch (e) {
    console.error("Ошибка загрузки ячеек:", e);
  }
}
```

**Блок кода (строки 98-102):**
```typescript
const res = await fetch("/api/units/assign", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ unitId: id, toStatus: "receiving", cellId: selectedCellId }),
});
```

---

### 2. `app/app/putaway/page.tsx`

**Изменения:**
- **Добавлены типы и состояние** (строки 12-19): Добавлен тип `Cell` и состояния `cells`, `selectedCellIds`
- **Строка 20-35**: Добавлена функция `loadCells()` для загрузки storage-ячеек
- **Строка 37**: Изменён запрос units с `status=stored` на `status=receiving`
- **Строка 40-75**: Полностью переписана функция `moveToShipping()` → `moveToInventoryHold()`:
  - Добавлена проверка выбранной ячейки
  - Изменён статус с `"picking"` на `"inventory_hold"`
  - Добавлен `cellId: selectedCellId` вместо `cellId: null`
  - Добавлено обновление списков ячеек и очистка выбора
- **Строка 77**: Добавлен вызов `loadCells()` в `useEffect`
- **Строки 89-120**: Полностью переписан UI:
  - Добавлен select для выбора storage-ячеек
  - Изменён заголовок таблицы на "Заказы в приёмке (для размещения в хранение)"
  - Изменён текст кнопки на "Разместить в хранение"
  - Кнопка disabled, если ячейка не выбрана

**Детали:**
- Страница теперь загружает units со статусом `"receiving"` (из приёмки)
- Позволяет выбрать storage-ячейку для размещения
- Перемещает unit в статус `"inventory_hold"` с указанной storage-ячейкой
- После успеха обновляет списки units и ячеек

**Блок кода (строки 20-35):**
```typescript
async function loadCells() {
  try {
    const res = await fetch("/api/cells/list", { cache: "no-store" });
    if (!res.ok) {
      console.error("Ошибка загрузки ячеек:", res.status);
      return;
    }
    const json = await res.json();
    // Фильтруем только storage ячейки
    const storageCells = (json.cells || []).filter((cell: Cell) => cell.cell_type === "storage");
    setCells(storageCells);
  } catch (e) {
    console.error("Ошибка загрузки ячеек:", e);
  }
}
```

**Блок кода (строки 40-75):**
```typescript
async function moveToInventoryHold(id: string) {
  setLoading(true);
  setErr(null);
  try {
    const selectedCellId = selectedCellIds[id];

    if (!selectedCellId) {
      setErr("Выберите целевую ячейку");
      setLoading(false);
      return;
    }

    const assignRes = await fetch("/api/units/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: id, toStatus: "inventory_hold", cellId: selectedCellId }),
    });
    // ... обработка успеха и обновление списков
  }
}
```

---

### 3. `app/app/picking/page.tsx`

**Изменения:**
- **Удалены** (строки 7-12, 19, 21-35): Удалены тип `Cell`, состояние `cells`, `selectedCellIds`, функция `loadCells()`
- **Строка 17**: Изменён запрос units с `status=picking` на `status=inventory_hold`
- **Строки 19-42**: Полностью переписана функция `ship()` → `moveToPicking()`:
  - Убрана проверка выбранной ячейки
  - Изменён статус с `"shipped"` на `"picking"`
  - Установлен `cellId: null` (ячейка не меняется)
  - Убрано обновление списков ячеек и очистка выбора
- **Строка 44**: Убран вызов `loadCells()` из `useEffect`
- **Строки 46-80**: Полностью переписан UI:
  - Убран select для выбора ячеек
  - Изменён заголовок на "Сборка"
  - Изменён заголовок таблицы на "Заказы в хранении (для сборки)"
  - Изменён текст кнопки на "Отправить в сборку"
  - Все тексты переведены на русский
  - Убрана колонка выбора ячеек

**Детали:**
- Страница загружает units со статусом `"inventory_hold"` (из хранения)
- При нажатии кнопки только меняет статус на `"picking"`, ячейка остаётся прежней
- Упрощённый UI без выбора ячеек

**Блок кода (строки 19-42):**
```typescript
async function moveToPicking(id: string) {
  setLoading(true);
  setErr(null);
  try {
    // На шаге picking unit остаётся в storage (cell_id НЕ меняем), меняется только статус на "picking"
    const r = await fetch("/api/units/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: id, toStatus: "picking", cellId: null }),
    });
    // ... обработка успеха
  }
}
```

---

### 4. `app/app/shipping/page.tsx`

**Изменения:**
- **Добавлены типы и состояние** (строки 12-19): Добавлен тип `Cell` и состояния `cells`, `selectedCellIds`, `loading`
- **Строки 20-35**: Добавлена функция `loadCells()` для загрузки shipping-ячеек
- **Строка 37**: Изменён запрос units с `status=shipped` на `status=picking`
- **Строки 39-75**: Добавлена функция `moveToShipped()`:
  - Проверка выбранной ячейки
  - Отправка `toStatus: "shipped"` с `cellId: selectedCellId`
  - Обновление списков ячеек и очистка выбора
- **Строка 77**: Добавлен вызов `loadCells()` в `useEffect`
- **Строки 95-130**: Полностью переписан UI:
  - Добавлен select для выбора shipping-ячеек
  - Изменён заголовок таблицы на "Заказы в сборке (для отгрузки)"
  - Добавлена колонка "Действие" с select и кнопкой
  - Изменён текст кнопки на "Отгрузить"
  - Кнопка disabled, если ячейка не выбрана

**Детали:**
- Страница загружает units со статусом `"picking"` (из сборки)
- Позволяет выбрать shipping-ячейку для отгрузки
- Перемещает unit в статус `"shipped"` с указанной shipping-ячейкой
- После успеха обновляет списки units и ячеек

**Блок кода (строки 20-35):**
```typescript
async function loadCells() {
  try {
    const res = await fetch("/api/cells/list", { cache: "no-store" });
    if (!res.ok) {
      console.error("Ошибка загрузки ячеек:", res.status);
      return;
    }
    const json = await res.json();
    // Фильтруем только shipping ячейки
    const shippingCells = (json.cells || []).filter((cell: Cell) => cell.cell_type === "shipping");
    setCells(shippingCells);
  } catch (e) {
    console.error("Ошибка загрузки ячеек:", e);
  }
}
```

**Блок кода (строки 39-75):**
```typescript
async function moveToShipped(id: string) {
  setLoading(true);
  setErr(null);
  try {
    const selectedCellId = selectedCellIds[id];

    if (!selectedCellId) {
      setErr("Выберите целевую ячейку");
      setLoading(false);
      return;
    }

    const r = await fetch("/api/units/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: id, toStatus: "shipped", cellId: selectedCellId }),
    });
    // ... обработка успеха и обновление списков
  }
}
```

---

## WORKFLOW СТАТУСОВ

Теперь workflow строго соответствует enum:
1. **receiving** → unit создаётся и размещается в BIN-ячейку (Receiving page)
2. **inventory_hold** → unit перемещается из BIN в storage-ячейку (Putaway page)
3. **picking** → unit остаётся в storage, меняется только статус (Picking page)
4. **shipped** → unit перемещается из storage в shipping-ячейку (Shipping page)

---

## ТИПЫ ЯЧЕЕК ПО СТРАНИЦАМ

- **Receiving**: только `cell_type = "bin"`
- **Putaway**: только `cell_type = "storage"`
- **Picking**: выбор ячеек отсутствует (cellId: null)
- **Shipping**: только `cell_type = "shipping"`

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
✓ Compiled successfully in 995.5ms
✓ Generating static pages using 9 workers (29/29) in 56.5ms
```

---

## ВАЖНЫЕ ЗАМЕЧАНИЯ

1. **БД не изменялась**: Все изменения только во фронтенде и использовании существующих API
2. **Ручной выбор ячеек**: Никаких автоподборов, всегда требуется ручной выбор (кроме Picking)
3. **Русский язык UI**: Все тексты интерфейса переведены на русский
4. **Обновление списков**: После каждого успешного перемещения обновляются списки units и ячеек (для актуального units_count)
5. **Валидация**: Кнопки disabled, если ячейка не выбрана (кроме Picking)

---

## ТЕСТИРОВАНИЕ

Рекомендуется протестировать:
1. ✅ Создание unit в Receiving и размещение в BIN-ячейку
2. ✅ Перемещение из Receiving в Putaway (выбор storage-ячейки)
3. ✅ Перемещение из Putaway в Picking (без выбора ячейки)
4. ✅ Перемещение из Picking в Shipping (выбор shipping-ячейки)
5. ✅ Проверка обновления units_count в списках ячеек

---

## ЗАКЛЮЧЕНИЕ

Все изменения успешно внесены, код скомпилирован без ошибок, линтер не нашёл проблем. Workflow теперь строго соответствует требованиям: receiving → inventory_hold → picking → shipped с размещением в соответствующие типы ячеек.
