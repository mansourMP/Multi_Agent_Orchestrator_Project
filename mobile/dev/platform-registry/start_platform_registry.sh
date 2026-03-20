#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$BASE_DIR/../.." && pwd)"
REPO_DIR="$(cd "$MOBILE_DIR/.." && pwd)"
HOST="${EMPYRALIS_PLATFORM_REGISTRY_HOST:-0.0.0.0}"
PORT="${EMPYRALIS_PLATFORM_REGISTRY_PORT:-8011}"
REGISTRY_FILE="${EMPYRALIS_PLATFORM_REGISTRY_FILE:-$BASE_DIR/state/registry.json}"
SEED_FILE="${EMPYRALIS_PLATFORM_REGISTRY_SEED:-$BASE_DIR/platform_registry.seed.json}"
API_KEY="${EMPYRALIS_PLATFORM_REGISTRY_KEY:-replace-with-platform-key}"

export EMPYRALIS_PLATFORM_REGISTRY_FILE="$REGISTRY_FILE"
export EMPYRALIS_PLATFORM_REGISTRY_SEED="$SEED_FILE"
export EMPYRALIS_PLATFORM_REGISTRY_KEY="$API_KEY"

cd "$BASE_DIR"

if [[ -x "$REPO_DIR/.venv/bin/uvicorn" ]]; then
  UVICORN_BIN="$REPO_DIR/.venv/bin/uvicorn"
else
  UVICORN_BIN="uvicorn"
fi

echo "Platform registry: http://${HOST}:${PORT}"
echo "Registry file: $REGISTRY_FILE"
echo "Seed file: $SEED_FILE"
echo "Platform key: $API_KEY"
echo "Uvicorn: $UVICORN_BIN"
echo
if [[ "$API_KEY" == "replace-with-platform-key" ]]; then
  echo "Set EMPYRALIS_PLATFORM_REGISTRY_KEY before production use."
  echo
fi

echo "Health check:"
echo "  curl -s -H \"X-API-Key: ${API_KEY}\" http://127.0.0.1:${PORT}/health"
echo

"$UVICORN_BIN" platform_registry_server:app --host "$HOST" --port "$PORT"
