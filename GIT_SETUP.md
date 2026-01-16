# Инструкция по загрузке проекта на GitHub

## Проблема

Git не работает, потому что на macOS не установлены **Xcode Command Line Tools**. Это обязательное требование для работы git на Mac.

## Решение

### Шаг 1: Установите Xcode Command Line Tools

Выполните команду в терминале:
```bash
xcode-select --install
```

Откроется диалоговое окно - нажмите "Установить" и дождитесь завершения установки (может занять 10-15 минут).

### Шаг 2: Создайте репозиторий на GitHub

1. Перейдите на https://github.com
2. Войдите в свой аккаунт (или создайте новый)
3. Нажмите кнопку "+" в правом верхнем углу → "New repository"
4. Назовите репозиторий (например: `warehouse-main`)
5. **НЕ** добавляйте README, .gitignore или license (они уже есть в проекте)
6. Нажмите "Create repository"

### Шаг 3: Загрузите проект

После установки Xcode Command Line Tools, выполните следующие команды в терминале:

```bash
cd /Users/umut/Downloads/warehouse-main

# Инициализация git репозитория
git init

# Добавление всех файлов
git add .

# Создание первого коммита
git commit -m "Initial commit: Warehouse management system"

# Добавление remote репозитория (замените URL на ваш)
git remote add origin https://github.com/ВАШ_USERNAME/НАЗВАНИЕ_РЕПОЗИТОРИЯ.git

# Переименование ветки в main
git branch -M main

# Отправка на GitHub
git push -u origin main
```

**Важно:** Замените `ВАШ_USERNAME` и `НАЗВАНИЕ_РЕПОЗИТОРИЯ` на реальные значения из шага 2.

## Альтернативный способ (через GitHub Desktop)

Если не хотите использовать командную строку:
1. Установите GitHub Desktop: https://desktop.github.com
2. Откройте приложение
3. File → Add Local Repository → выберите папку `/Users/umut/Downloads/warehouse-main`
4. Нажмите "Publish repository" → следуйте инструкциям

## Почему не получилось автоматически?

Git на macOS зависит от Xcode Command Line Tools - это базовые инструменты разработчика (компиляторы, библиотеки). Без них git не может работать. Это системное требование macOS, а не проблема проекта.
