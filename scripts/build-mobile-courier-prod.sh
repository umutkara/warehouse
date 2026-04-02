#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/mc (mobile courier)"

API_BASE_URL="${API_BASE_URL:-}"
if [ -z "${API_BASE_URL}" ]; then
  echo "Missing API_BASE_URL env var."
  echo "Example:"
  echo "  API_BASE_URL=https://your-prod-api.example.com ./scripts/build-mobile-courier-prod.sh"
  exit 1
fi

cd "$MOBILE_DIR"

flutter pub get
flutter build appbundle --release --dart-define="API_BASE_URL=$API_BASE_URL"

echo "Built:"
echo "  $MOBILE_DIR/build/app/outputs/bundle/release/app-release.aab"

