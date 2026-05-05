#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/mc (mobile courier)"
DEFAULT_API_BASE_URL="https://warehouse-nu-three.vercel.app"

API_BASE_URL="${API_BASE_URL:-$DEFAULT_API_BASE_URL}"
if ! python3 - <<'PY' "$API_BASE_URL"
from urllib.parse import urlparse
import sys

url = sys.argv[1]
parsed = urlparse(url)
if parsed.scheme not in ("http", "https") or not parsed.netloc:
    raise SystemExit(1)
PY
then
  echo "Invalid API_BASE_URL: $API_BASE_URL"
  echo "Example: API_BASE_URL=https://your-prod-api.example.com ./scripts/build-mobile-courier-prod.sh"
  exit 1
fi

cd "$MOBILE_DIR"

if [ ! -f "$MOBILE_DIR/android/key.properties" ]; then
  echo "Missing android/key.properties — Play rejects debug-signed AABs."
  echo "Copy:  cp \"\$MOBILE_DIR/android/key.properties.example\" \"\$MOBILE_DIR/android/key.properties\""
  echo "Then create upload-keystore.jks (see comments in key.properties.example)."
  echo "Docs: https://developer.android.com/studio/publish/app-signing"
  exit 1
fi

flutter pub get
# Privacy policy URL defaults to "${API_BASE_URL origin}/privacy" in the app; override if needed:
#   --dart-define=PRIVACY_POLICY_URL=https://example.com/privacy
echo "API_BASE_URL: $API_BASE_URL"
flutter build appbundle --release --dart-define="API_BASE_URL=$API_BASE_URL"

echo "Built:"
echo "  $MOBILE_DIR/build/app/outputs/bundle/release/app-release.aab"

