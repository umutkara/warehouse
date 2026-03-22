#!/bin/bash
# Reconnect Samsung/Android device over WiFi for Android Studio
# Run when device disappears from Device Manager after ADB restart
#
# Usage:
#   ./scripts/connect-android-wifi.sh <IP>:<port>
# Example:
#   ./scripts/connect-android-wifi.sh 192.168.1.42:37231
#
# Get IP and port from phone: Settings → Developer options → Wireless debugging

set -e
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"

if [ -z "$1" ]; then
  echo "Usage: $0 <IP>:<port>"
  echo ""
  echo "Find IP:port on your phone:"
  echo "  Settings → Developer options → Wireless debugging"
  echo ""
  echo "If pairing needed first (new device/network):"
  echo "  adb pair <IP>:<pairing_port>   # use 6-digit code from phone"
  echo "  $0 <IP>:<connect_port>"
  exit 1
fi

echo "Restarting ADB and connecting to $1..."
"$ADB" kill-server 2>/dev/null || true
sleep 1
"$ADB" start-server
"$ADB" connect "$1"

echo ""
"$ADB" devices -l
echo ""
echo "If device shows above, reopen Android Studio or use Troubleshoot in Device Manager."
