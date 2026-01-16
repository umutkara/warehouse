#!/bin/bash

# Скрипт для загрузки проекта на GitHub
# Использование: ./deploy-to-github.sh <github-repo-url>
# Например: ./deploy-to-github.sh https://github.com/username/warehouse.git

if [ -z "$1" ]; then
    echo "Ошибка: Укажите URL репозитория GitHub"
    echo "Использование: ./deploy-to-github.sh <github-repo-url>"
    echo "Пример: ./deploy-to-github.sh https://github.com/username/warehouse.git"
    exit 1
fi

GITHUB_URL=$1

# Инициализация git репозитория
echo "Инициализация git репозитория..."
git init

# Добавление всех файлов
echo "Добавление файлов..."
git add .

# Первый коммит
echo "Создание первого коммита..."
git commit -m "Initial commit: Warehouse management system"

# Добавление remote репозитория
echo "Добавление remote репозитория..."
git remote add origin $GITHUB_URL

# Переименование ветки в main (если нужно)
git branch -M main

# Отправка на GitHub
echo "Отправка на GitHub..."
git push -u origin main

echo "Проект успешно загружен на GitHub!"
