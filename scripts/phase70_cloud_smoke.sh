#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${1:-${EMPYRALIS_PUBLIC_URL:-}}"
API_KEY="${EMPYRALIS_RUNTIME_API_KEY:-${ORION_API_KEY:-}}"

if [[ -z "${PUBLIC_URL}" ]]; then
  echo "Usage: EMPYRALIS_PUBLIC_URL=https://runtime.example.com $0"
  exit 1
fi

PUBLIC_URL="${PUBLIC_URL%/}"

echo "==> /health"
curl -fsS "${PUBLIC_URL}/health" | python3 -m json.tool >/dev/null

echo "==> /health/db"
curl -fsS "${PUBLIC_URL}/health/db" | python3 -m json.tool

if [[ -n "${API_KEY}" ]]; then
  echo "==> /doctor"
  curl -fsS -H "X-API-Key: ${API_KEY}" "${PUBLIC_URL}/doctor" | python3 -m json.tool >/dev/null
fi

echo "Phase 70 cloud smoke passed for ${PUBLIC_URL}"

