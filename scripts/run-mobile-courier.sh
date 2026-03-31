#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/mc (mobile courier)"
ENV_FILE="$ROOT_DIR/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

API_BASE_URL="$(python3 - <<'PY' "$ENV_FILE"
import pathlib
import re
import sys

env_path = pathlib.Path(sys.argv[1])
text = env_path.read_text(encoding="utf-8")
match = re.search(r"^MOBILE_API_BASE_URL=(.+)$", text, re.MULTILINE)
if match:
    print(match.group(1).strip())
PY
)"

if [ -z "${API_BASE_URL:-}" ]; then
  echo "MOBILE_API_BASE_URL is not set in $ENV_FILE"
  echo "Example: MOBILE_API_BASE_URL=https://your-server.example.com"
  exit 1
fi

DEVICE_ID="${1:-}"

if [ -z "$DEVICE_ID" ]; then
  DEVICE_ID="$(flutter devices --machine --device-timeout 10 | python3 - <<'PY'
import json
import sys

try:
    devices = json.load(sys.stdin)
except Exception:
    devices = []

wireless_android = [
    d for d in devices
    if d.get("platformType") == "android"
    and "wireless" in (d.get("name", "").lower() + " " + d.get("id", "").lower())
]
chosen = wireless_android[0]["id"] if wireless_android else ""
print(chosen)
PY
)"
fi

if [ -z "$DEVICE_ID" ]; then
  echo "No wireless Android device found."
  echo "Usage: ./scripts/run-mobile-courier.sh <flutter-device-id>"
  exit 1
fi

echo "Running mobile courier on device: $DEVICE_ID"
echo "API_BASE_URL: $API_BASE_URL"

cd "$MOBILE_DIR"
flutter run --no-pub -d "$DEVICE_ID" --dart-define="API_BASE_URL=$API_BASE_URL"
