#!/bin/bash

# Скрипт для установки Command Line Tools через softwareupdate
# Запустите этот скрипт в терминале: bash install-clt.sh

echo "Установка Command Line Tools for Xcode..."
echo "Вам будет предложено ввести пароль администратора"

# Установка через softwareupdate
sudo softwareupdate --install "Command Line Tools for Xcode-16.4"

# После установки настроим путь
sudo xcode-select --switch /Library/Developer/CommandLineTools

echo "Проверка установки..."
xcode-select -p

echo ""
echo "Если путь указан выше - установка завершена успешно!"
echo "Теперь можно использовать git!"
