#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${ORION_API_URL:-http://127.0.0.1:8001}"
RUNTIME_KEY="${1:-${RUNTIME_KEY:-${ORION_API_KEY:-}}}"
WORKER_ID="${WORKER_ID:-}"
POLL_SECONDS="${ORION_LOCAL_WORKER_POLL_SECONDS:-3.0}"
IDLE_HEARTBEAT_SECONDS="${ORION_LOCAL_WORKER_IDLE_HEARTBEAT_SECONDS:-15.0}"

if [[ -z "${RUNTIME_KEY}" ]]; then
  echo "Usage:"
  echo "  RUNTIME_KEY='replace-with-strong-key' bash scripts/run_local_worker.sh"
  echo "  or: bash scripts/run_local_worker.sh replace-with-strong-key"
  exit 1
fi

cd "${ROOT_DIR}"
if [[ -z "${WORKER_ID}" ]]; then
  HOST_ID="$(hostname | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  WORKER_ID="empyralis-local-${HOST_ID}"
fi

ARGS=(
  --runtime-url "${API_URL}"
  --api-key "${RUNTIME_KEY}"
  --poll-seconds "${POLL_SECONDS}"
  --idle-heartbeat-seconds "${IDLE_HEARTBEAT_SECONDS}"
)
if [[ -n "${WORKER_ID}" ]]; then
  ARGS+=(--worker-id "${WORKER_ID}")
fi
PYTHONUNBUFFERED=1 python3 -u scripts/orion_local_worker.py "${ARGS[@]}"
