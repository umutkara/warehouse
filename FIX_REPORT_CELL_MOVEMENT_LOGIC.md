# FIX REPORT: Доработка логики перемещений между ячейками

## Дата: 2024
## Задача: Доработать логику перемещений unit между ячейками - разрешить внутренние перемещения и обновить фильтрацию

---

## ОБЗОР ИЗМЕНЕНИЙ

Реализованы расширенные правила перемещения unit между ячейками:
1. **Внутренние перемещения**: разрешены перемещения внутри одного типа (storage → storage, shipping → shipping)
2. **Межтиповые перемещения**: разрешены перемещения между типами (storage ⇄ shipping)
3. **BIN — только входная зона**: разрешено bin → storage/shipping, запрещено storage/shipping → bin
4. **Умная фильтрация**: список целевых ячеек зависит от текущего типа ячейки unit
5. **Защитные проверки**: добавлена проверка `if (toType === "bin" && fromType !== "bin")` во всех страницах

---

## ИЗМЕНЁННЫЕ ФАЙЛЫ

### 1. `app/app/picking/page.tsx`

**Изменения:**
- **Строки 200-206**: Обновлена логика определения доступных целевых ячеек:
  - Если `fromType = storage` → показывать `storage + shipping` (включая storage для внутренних перемещений)
  - Если `fromType = shipping` → показывать `shipping + storage` (включая shipping для внутренних перемещений)
  - Никогда не показывать bin
- **Строки 106-121**: Обновлена защитная проверка:
  - Используется переменная `toType` для явного определения типа целевой ячейки
  - Проверка: `if (toType === "bin" && fromType !== "bin")` → ошибка
- **Строка 243**: Изменён текст кнопки с `"→ shipping"` / `"→ storage"` на `"Переместить"` (так как теперь возможны внутренние перемещения)

**Детали:**
- Страница теперь показывает units из storage И shipping ячеек
- Разрешены внутренние перемещения:
  - storage → storage (между storage-ячейками)
  - shipping → shipping (между shipping-ячейками)
- Разрешены межтиповые перемещения:
  - storage → shipping
  - shipping → storage
- Защита от перемещения в bin (BIN — только входная зона)

**Блок кода (строки 200-206):**
```typescript
// Определяем доступные целевые ячейки в зависимости от текущей
// Если fromType = storage -> показывать storage + shipping (включая storage для внутренних перемещений)
// Если fromType = shipping -> показывать shipping + storage (включая shipping для внутренних перемещений)
// Никогда не показывать bin
const availableCells = u.current_cell_type === "storage" 
  ? [...storageCells, ...shippingCells] // storage + shipping
  : u.current_cell_type === "shipping"
  ? [...shippingCells, ...storageCells] // shipping + storage
  : [];
```

**Блок кода (строки 117-121):**
```typescript
const toType = selectedCell.cell_type;

// Защитная проверка: if (toType === "bin" && fromType !== "bin") -> ошибка
if (toType === "bin" && fromType !== "bin") {
  setErr("Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона");
  setLoading(false);
  return;
}
```

---

### 2. `app/app/putaway/page.tsx`

**Изменения:**
- **Строки 104-118**: Обновлена защитная проверка:
  - Используется переменная `toType` для явного определения типа целевой ячейки
  - Проверка: `if (toType === "bin" && fromType !== "bin")` → ошибка
- **Строки 42-46**: Фильтрация ячеек уже правильная:
  - Для bin показываются только storage + shipping (bin исключён)

**Детали:**
- Страница показывает только units из BIN-ячеек
- В селекте доступны только storage и shipping ячейки (bin исключён)
- Защита от перемещения в BIN из storage/shipping (BIN — только входная зона)

**Блок кода (строки 114-118):**
```typescript
const toType = selectedCell.cell_type;

// Защитная проверка: if (toType === "bin" && fromType !== "bin") -> ошибка
if (toType === "bin" && fromType !== "bin") {
  setErr("Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона");
  setLoading(false);
  return;
}
```

---

### 3. `app/app/receiving/page.tsx`

**Изменения:**
- **Строки 99-115**: Обновлена защитная проверка:
  - Используется переменная `toType` для явного определения типа целевой ячейки
  - Проверка: `if (toType === "bin" && fromType !== "bin" && fromType !== null)` → ошибка
  - Добавлена проверка `fromType !== null` для разрешения создания новых units (когда fromType = null)

**Детали:**
- UI показывает только BIN-ячейки
- Разрешено размещение новых units в BIN (когда fromType = null)
- Защита от перемещения в BIN из storage/shipping (BIN — только входная зона)

**Блок кода (строки 113-118):**
```typescript
const toType = selectedCell.cell_type;

// Защитная проверка: if (toType === "bin" && fromType !== "bin") -> ошибка
if (toType === "bin" && fromType !== "bin" && fromType !== null) {
  setError("Запрещено перемещать в BIN из storage/shipping. BIN — только входная зона");
  setLoading(false);
  return;
}
```

---

## РЕАЛИЗОВАННЫЕ ПРАВИЛА

### Правило 1: Внутренние перемещения
- ✅ storage → storage (между storage-ячейками)
- ✅ shipping → shipping (между shipping-ячейками)

### Правило 2: Межтиповые перемещения
- ✅ storage → shipping
- ✅ shipping → storage

### Правило 3: BIN — только входная зона
- ✅ bin → storage/shipping (разрешено)
- ✅ storage/shipping → bin (запрещено)

### Правило 4: Умная фильтрация целевых ячеек
- ✅ Если `fromType = bin` → показывать `storage + shipping`
- ✅ Если `fromType = storage` → показывать `storage + shipping` (включая storage для внутренних перемещений)
- ✅ Если `fromType = shipping` → показывать `shipping + storage` (включая shipping для внутренних перемещений)
- ✅ Если `fromType != bin` → никогда не показывать bin в списке

### Правило 5: Защитная проверка
- ✅ `if (toType === "bin" && fromType !== "bin")` → показывать ошибку и не отправлять запрос
- ✅ Реализовано во всех страницах: Receiving, Putaway, Picking

---

## ЗАЩИТНЫЕ ПРОВЕРКИ

### Receiving (`app/app/receiving/page.tsx`)
- ✅ Проверка типа выбранной ячейки (только bin)
- ✅ Защита: `if (toType === "bin" && fromType !== "bin" && fromType !== null)` → ошибка
- ✅ Разрешено создание новых units в BIN (когда fromType = null)

### Putaway (`app/app/putaway/page.tsx`)
- ✅ Проверка доступности выбранной ячейки
- ✅ Защита: `if (toType === "bin" && fromType !== "bin")` → ошибка
- ✅ Фильтрация: показываются только storage + shipping (bin исключён)

### Picking (`app/app/picking/page.tsx`)
- ✅ Проверка выбранной ячейки
- ✅ Защита: `if (toType === "bin" && fromType !== "bin")` → ошибка
- ✅ Умная фильтрация:
  - Для storage → показываются storage + shipping
  - Для shipping → показываются shipping + storage
  - Bin никогда не показывается

---

## ЛОГИКА ФИЛЬТРАЦИИ ЯЧЕЕК

### Picking Page
```typescript
// Если fromType = storage -> показывать storage + shipping
const availableCells = u.current_cell_type === "storage" 
  ? [...storageCells, ...shippingCells] // storage + shipping
  : u.current_cell_type === "shipping"
  ? [...shippingCells, ...storageCells] // shipping + storage
  : [];
```

### Putaway Page
```typescript
// Если fromType = bin -> показывать storage + shipping (bin исключён)
const allowedCells = all.filter((cell: Cell) => 
  cell.cell_type === "storage" || cell.cell_type === "shipping"
);
```

### Receiving Page
```typescript
// Показывать только bin ячейки
const binCells = (json.cells || []).filter((cell: Cell) => cell.cell_type === "bin");
```

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
✓ Compiled successfully in 1047.0ms
✓ Generating static pages using 9 workers (29/29) in 56.5ms
```

---

## ВАЖНЫЕ ЗАМЕЧАНИЯ

1. **БД не изменялась**: Все изменения только во фронтенде
2. **Внутренние перемещения**: Теперь разрешены перемещения внутри одного типа (storage → storage, shipping → shipping)
3. **Умная фильтрация**: Список целевых ячеек динамически адаптируется в зависимости от текущего типа ячейки unit
4. **Защитные проверки**: Единообразная проверка `if (toType === "bin" && fromType !== "bin")` во всех страницах
5. **Создание новых units**: В Receiving разрешено создание новых units в BIN (когда fromType = null)

---

## ТЕСТИРОВАНИЕ

Рекомендуется протестировать:
1. ✅ Перемещение storage → storage (внутреннее перемещение)
2. ✅ Перемещение shipping → shipping (внутреннее перемещение)
3. ✅ Перемещение storage → shipping (межтиповое)
4. ✅ Перемещение shipping → storage (межтиповое)
5. ✅ Перемещение bin → storage (из Putaway)
6. ✅ Перемещение bin → shipping (из Putaway)
7. ✅ Попытка переместить storage → bin (должна быть ошибка)
8. ✅ Попытка переместить shipping → bin (должна быть ошибка)
9. ✅ Проверка фильтрации ячеек в Picking (storage показывает storage+shipping, shipping показывает shipping+storage)
10. ✅ Создание нового unit в BIN (из Receiving)

---

## ЗАКЛЮЧЕНИЕ

Все требования успешно реализованы:
- ✅ Разрешены внутренние перемещения (storage → storage, shipping → shipping)
- ✅ Разрешены межтиповые перемещения (storage ⇄ shipping)
- ✅ BIN — только входная зона (bin → storage/shipping разрешено, storage/shipping → bin запрещено)
- ✅ Умная фильтрация целевых ячеек в зависимости от текущего типа
- ✅ Защитные проверки добавлены везде
- ✅ Код скомпилирован без ошибок

Код готов к использованию.
