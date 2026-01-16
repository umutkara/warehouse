# Инструкция по загрузке проекта на GitHub

## Проблема
Git требует авторизацию для отправки кода на GitHub.

## Решение 1: Push через HTTPS с токеном (БЫСТРЫЙ СПОСОБ)

1. Создайте Personal Access Token на GitHub:
   - Откройте: https://github.com/settings/tokens
   - Нажмите "Generate new token" → "Generate new token (classic)"
   - Название: "warehouse-push"
   - Выберите: `repo` (доступ к репозиториям)
   - Нажмите "Generate token"
   - **СКОПИРУЙТЕ ТОКЕН** (он показывается только один раз!)

2. Выполните команду в терминале:
   ```bash
   cd /Users/umut/Downloads/warehouse-main
   git push -u origin main --force
   ```
   
3. При запросе введите:
   - Username: `umutkara`
   - Password: **вставьте токен** (не обычный пароль!)

## Решение 2: Настроить SSH ключ (ДЛЯ БУДУЩЕГО)

1. Создайте SSH ключ:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   # Нажмите Enter для всех вопросов
   ```

2. Скопируйте публичный ключ:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

3. Добавьте ключ на GitHub:
   - Откройте: https://github.com/settings/keys
   - Нажмите "New SSH key"
   - Вставьте скопированный ключ
   - Сохраните

4. Измените remote на SSH:
   ```bash
   cd /Users/umut/Downloads/warehouse-main
   git remote set-url origin git@github.com:umutkara/warehouse.git
   git push -u origin main --force
   ```

## Что уже готово
✅ Git репозиторий инициализирован
✅ Все файлы добавлены в git
✅ Первый коммит создан
✅ Remote origin настроен: https://github.com/umutkara/warehouse.git
✅ Готов к отправке!

## Важно
Используйте `--force` потому что на GitHub уже есть другие коммиты, и вы хотите заменить их своей версией проекта.
