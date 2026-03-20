#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${ROOT_DIR}/.orion-stack"
PID_DIR="${STATE_DIR}/pids"
LOG_DIR="${STATE_DIR}/logs"
START_LOCK_FILE="${STATE_DIR}/start.lock"
START_META_FILE="${STATE_DIR}/start.meta.json"

port_for_service() {
  local name="$1"
  case "${name}" in
    runtime) echo "8001" ;;
    backend) echo "4000" ;;
    frontend) echo "3000" ;;
    *) echo "" ;;
  esac
}

collect_descendants() {
  local parent="$1"
  local children
  children="$(pgrep -P "${parent}" 2>/dev/null || true)"
  if [[ -z "${children}" ]]; then
    return 0
  fi
  local child
  for child in ${children}; do
    echo "${child}"
    collect_descendants "${child}"
  done
}

proc_cmd() {
  local pid="$1"
  ps -p "${pid}" -o command= 2>/dev/null | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]\{1,\}/ /g'
}

show_pid_state() {
  local name="$1"
  local file="${PID_DIR}/${name}.pid"
  local fallback_port
  fallback_port="$(port_for_service "${name}")"
  if [[ ! -f "${file}" ]]; then
    if [[ -n "${fallback_port}" ]]; then
      local port_pids
      port_pids="$(lsof -ti tcp:${fallback_port} -sTCP:LISTEN 2>/dev/null || true)"
      if [[ -n "${port_pids}" ]]; then
        local compact
        compact="$(echo "${port_pids}" | tr '\n' ' ' | xargs)"
        echo "${name}: running (detected via port ${fallback_port}: ${compact})"
        return
      fi
    fi
    echo "${name}: not tracked"
    return
  fi
  local pid
  pid="$(cat "${file}" 2>/dev/null || true)"
  if [[ -z "${pid}" ]]; then
    echo "${name}: pid file empty"
    return
  fi
  if kill -0 "${pid}" 2>/dev/null; then
    local cmd
    cmd="$(proc_cmd "${pid}")"
    local descendants
    descendants="$(collect_descendants "${pid}" | tr '\n' ' ' | xargs || true)"
    if [[ -n "${descendants}" ]]; then
      echo "${name}: running (pid ${pid}, children: ${descendants})"
    else
      echo "${name}: running (pid ${pid})"
    fi
    if [[ -n "${cmd}" ]]; then
      echo "  cmd: ${cmd}"
    fi
  else
    if [[ -n "${fallback_port}" ]]; then
      local port_pids
      port_pids="$(lsof -ti tcp:${fallback_port} -sTCP:LISTEN 2>/dev/null || true)"
      if [[ -n "${port_pids}" ]]; then
        local compact
        compact="$(echo "${port_pids}" | tr '\n' ' ' | xargs)"
        echo "${name}: running (pid file stale ${pid}; detected via port ${fallback_port}: ${compact})"
        return
      fi
    fi
    echo "${name}: stale pid file (${pid})"
  fi
}

echo "== Empyralis local stack status =="
show_pid_state "runtime"
show_pid_state "backend"
show_pid_state "frontend"
show_pid_state "worker"

echo
echo "Ports:"
for port in 8001 4000 3000; do
  pids="$(lsof -ti tcp:${port} 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    compact="$(echo "${pids}" | tr '\n' ' ' | xargs)"
    echo "  ${port}: in use (${compact})"
  else
    echo "  ${port}: free"
  fi
done

echo
if [[ -f "${START_LOCK_FILE}" ]]; then
  lock_pid="$(cut -d'|' -f1 "${START_LOCK_FILE}" 2>/dev/null || true)"
  lock_started="$(cut -d'|' -f2 "${START_LOCK_FILE}" 2>/dev/null || true)"
  lock_owner="$(cut -d'|' -f3 "${START_LOCK_FILE}" 2>/dev/null || true)"
  echo "Start lock: active (pid=${lock_pid:-unknown} owner=${lock_owner:-unknown} started_at=${lock_started:-unknown})"
else
  echo "Start lock: none"
fi

if [[ -f "${START_META_FILE}" ]]; then
  echo "Start metadata:"
  python3 - "${START_META_FILE}" <<'PY'
import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
except Exception:
    data = {}
def _field(name):
    value = data.get(name)
    return str(value) if value is not None else "-"
print(f"  starter_pid: {_field('starter_pid')}")
print(f"  started_at: {_field('started_at')}")
print(f"  lock_owner: {_field('lock_owner')}")
print(f"  openclaw_policy: {_field('openclaw_policy')}")
print(f"  auth_mode: {_field('auth_mode')}")
print(f"  runtime_key_fingerprint: {_field('runtime_key_fingerprint')}")
PY
else
  echo "Start metadata: none"
fi

echo
echo "Logs directory: ${LOG_DIR}"
