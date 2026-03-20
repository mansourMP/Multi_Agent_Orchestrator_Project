#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${ROOT_DIR}/.orion-stack"
LOG_DIR="${STATE_DIR}/logs"
PID_DIR="${STATE_DIR}/pids"
OPENAI_KEY_FILE="${STATE_DIR}/openai_api_key"
START_LOCK_FILE="${STATE_DIR}/start.lock"
START_META_FILE="${STATE_DIR}/start.meta.json"
START_OPS_DAEMON_HELPER="scripts/start_empyralis_ops_daemon.sh"
STATUS_OPS_DAEMON_HELPER="scripts/status_empyralis_ops_daemon.sh"
STOP_OPS_DAEMON_HELPER="scripts/stop_empyralis_ops_daemon.sh"
INSTALL_OPS_DAEMON_LAUNCHD_HELPER="scripts/install_empyralis_ops_daemon_launchd.sh"
STATUS_OPS_DAEMON_LAUNCHD_HELPER="scripts/status_empyralis_ops_daemon_launchd.sh"
UNINSTALL_OPS_DAEMON_LAUNCHD_HELPER="scripts/uninstall_empyralis_ops_daemon_launchd.sh"
LOGS_STACK_HELPER="scripts/logs_empyralis_local_stack.sh"
TERMINAL_WIZARD_HELPER="scripts/empyralis_terminal_wizard.sh"
ENV_READINESS_HELPER="scripts/empyralis_environment_readiness.sh"
STOP_STACK_HELPER="scripts/stop_empyralis_local_stack.sh"

ORION_HOST="${ORION_HOST:-127.0.0.1}"
# Bind host can differ from the advertised host (useful for mobile clients).
# Example: ORION_BIND_HOST=0.0.0.0 ORION_HOST=192.168.1.10
ORION_BIND_HOST="${ORION_BIND_HOST:-${ORION_HOST}}"
ORION_PORT="${ORION_PORT:-8001}"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_MODE="${BACKEND_MODE:-auto}" # auto|dist|dev|skip
START_RUNTIME="${START_RUNTIME:-1}"   # 1|0
START_BACKEND="${START_BACKEND:-1}"   # 1|0
START_FRONTEND="${START_FRONTEND:-1}" # 1|0
START_WORKER="${START_WORKER:-1}"     # 1|0
START_OPS_DAEMON="${START_OPS_DAEMON:-1}" # 1|0
TELEGRAM_AUTOPILOT_ENABLED="${EMPYRALIS_TELEGRAM_AUTOPILOT_ENABLED:-${ORION_TELEGRAM_AUTOPILOT_ENABLED:-1}}" # 1|0
TELEGRAM_AUTOPILOT_PROFILE="${EMPYRALIS_TELEGRAM_AUTOPILOT_PROFILE:-${ORION_TELEGRAM_AUTOPILOT_PROFILE:-assistant}}"
TELEGRAM_AUTOPILOT_ENGINE="${EMPYRALIS_TELEGRAM_AUTOPILOT_ENGINE:-${ORION_TELEGRAM_AUTOPILOT_ENGINE:-codex}}"
TELEGRAM_AUTOPILOT_REQUIRE_PREFIX="${EMPYRALIS_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX:-${ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX:-0}}" # 1|0
TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT="${EMPYRALIS_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT:-${ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT:-1}}" # 1|0
TELEGRAM_AUTOPILOT_EXECUTION_TARGET="${EMPYRALIS_TELEGRAM_AUTOPILOT_EXECUTION_TARGET:-${ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET:-local_companion}}" # auto|cloud|local_companion
WHATSAPP_AUTOPILOT_ENABLED="${EMPYRALIS_WHATSAPP_AUTOPILOT_ENABLED:-${ORION_WHATSAPP_AUTOPILOT_ENABLED:-1}}" # 1|0
WHATSAPP_AUTOPILOT_PROFILE="${EMPYRALIS_WHATSAPP_AUTOPILOT_PROFILE:-${ORION_WHATSAPP_AUTOPILOT_PROFILE:-assistant}}"
WHATSAPP_AUTOPILOT_ENGINE="${EMPYRALIS_WHATSAPP_AUTOPILOT_ENGINE:-${ORION_WHATSAPP_AUTOPILOT_ENGINE:-codex}}"
WHATSAPP_AUTOPILOT_REQUIRE_PREFIX="${EMPYRALIS_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX:-${ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX:-0}}" # 1|0
WHATSAPP_AUTOPILOT_EXECUTION_TARGET="${EMPYRALIS_WHATSAPP_AUTOPILOT_EXECUTION_TARGET:-${ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET:-local_companion}}" # auto|cloud|local_companion
OPENCLAW_GATEWAY_POLICY="${ORION_OPENCLAW_GATEWAY_POLICY:-auto_stop}" # auto_stop|warn|block|ignore
# Auth mode defaults:
# - Prefer codex unless user explicitly selects ORION_AUTH_MODE=api_key
#   or opts in with ORION_STACK_PREFER_API_KEY=1.
ORION_STACK_PREFER_API_KEY="${ORION_STACK_PREFER_API_KEY:-0}"
ORION_STACK_START_LOCK_WAIT_SECONDS="${ORION_STACK_START_LOCK_WAIT_SECONDS:-15}"
if [[ -n "${ORION_AUTH_MODE:-}" ]]; then
  ORION_AUTH_MODE_VALUE="${ORION_AUTH_MODE}"
else
  if [[ "${ORION_STACK_PREFER_API_KEY}" == "1" && -n "${OPENAI_API_KEY:-}" ]]; then
    ORION_AUTH_MODE_VALUE="api_key"
  else
    ORION_AUTH_MODE_VALUE="codex"
  fi
fi

# In api_key mode, OpenAI API keys should be enabled unless explicitly disabled.
if [[ -n "${ORION_DISABLE_OPENAI_API_KEY:-}" ]]; then
  ORION_DISABLE_OPENAI_API_KEY_VALUE="${ORION_DISABLE_OPENAI_API_KEY}"
else
  if [[ "${ORION_AUTH_MODE_VALUE}" == "api_key" ]]; then
    ORION_DISABLE_OPENAI_API_KEY_VALUE="0"
  else
    ORION_DISABLE_OPENAI_API_KEY_VALUE="1"
  fi
fi

RUNTIME_KEY_RAW="${1:-${RUNTIME_KEY:-${EMPYRALIS_API_KEY:-${ORION_API_KEY:-replace-with-strong-key}}}}"
RUNTIME_KEY="$(printf "%s" "${RUNTIME_KEY_RAW}" | tr -d '[:space:]')"
if [[ -z "${RUNTIME_KEY}" ]]; then
  RUNTIME_KEY="replace-with-strong-key"
fi
if [[ "${RUNTIME_KEY}" != "${RUNTIME_KEY_RAW}" ]]; then
  echo "Warning: runtime key contained whitespace and was normalized."
fi
ORION_API_URL="http://${ORION_HOST}:${ORION_PORT}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
BACKEND_HEALTH_URL="${BACKEND_URL}/api/v1/health"
BACKEND_EFFECTIVE_MODE=""
OPS_DAEMON_URL="http://${ORION_OPS_DAEMON_HOST:-127.0.0.1}:${ORION_OPS_DAEMON_PORT:-8787}"
OPS_DAEMON_STATUS="off"
STARTER_PID="$$"
STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LOCK_OWNER="${USER:-unknown}@$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo local)"
LOCK_HELD=0

mkdir -p "${LOG_DIR}" "${PID_DIR}"
printf "%s" "${RUNTIME_KEY}" > "${STATE_DIR}/runtime_key"
chmod 600 "${STATE_DIR}/runtime_key" 2>/dev/null || true

# Persist API key for future auto-starts (read only if env key is missing).
if [[ -z "${OPENAI_API_KEY:-}" && -f "${OPENAI_KEY_FILE}" ]]; then
  OPENAI_API_KEY="$(tr -d '\r\n' < "${OPENAI_KEY_FILE}" 2>/dev/null || true)"
  export OPENAI_API_KEY
fi
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  printf "%s" "${OPENAI_API_KEY}" > "${OPENAI_KEY_FILE}"
  chmod 600 "${OPENAI_KEY_FILE}" 2>/dev/null || true
fi

cat > "${STATE_DIR}/stack.env" <<EOF
EMPYRALIS_TELEGRAM_AUTOPILOT_ENABLED=${TELEGRAM_AUTOPILOT_ENABLED}
EMPYRALIS_TELEGRAM_AUTOPILOT_PROFILE=${TELEGRAM_AUTOPILOT_PROFILE}
EMPYRALIS_TELEGRAM_AUTOPILOT_ENGINE=${TELEGRAM_AUTOPILOT_ENGINE}
EMPYRALIS_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX=${TELEGRAM_AUTOPILOT_REQUIRE_PREFIX}
EMPYRALIS_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT=${TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT}
EMPYRALIS_TELEGRAM_AUTOPILOT_EXECUTION_TARGET=${TELEGRAM_AUTOPILOT_EXECUTION_TARGET}
ORION_TELEGRAM_AUTOPILOT_ENABLED=${TELEGRAM_AUTOPILOT_ENABLED}
ORION_TELEGRAM_AUTOPILOT_PROFILE=${TELEGRAM_AUTOPILOT_PROFILE}
ORION_TELEGRAM_AUTOPILOT_ENGINE=${TELEGRAM_AUTOPILOT_ENGINE}
ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX=${TELEGRAM_AUTOPILOT_REQUIRE_PREFIX}
ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT=${TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT}
ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET=${TELEGRAM_AUTOPILOT_EXECUTION_TARGET}
EMPYRALIS_WHATSAPP_AUTOPILOT_ENABLED=${WHATSAPP_AUTOPILOT_ENABLED}
EMPYRALIS_WHATSAPP_AUTOPILOT_PROFILE=${WHATSAPP_AUTOPILOT_PROFILE}
EMPYRALIS_WHATSAPP_AUTOPILOT_ENGINE=${WHATSAPP_AUTOPILOT_ENGINE}
EMPYRALIS_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX=${WHATSAPP_AUTOPILOT_REQUIRE_PREFIX}
EMPYRALIS_WHATSAPP_AUTOPILOT_EXECUTION_TARGET=${WHATSAPP_AUTOPILOT_EXECUTION_TARGET}
ORION_WHATSAPP_AUTOPILOT_ENABLED=${WHATSAPP_AUTOPILOT_ENABLED}
ORION_WHATSAPP_AUTOPILOT_PROFILE=${WHATSAPP_AUTOPILOT_PROFILE}
ORION_WHATSAPP_AUTOPILOT_ENGINE=${WHATSAPP_AUTOPILOT_ENGINE}
ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX=${WHATSAPP_AUTOPILOT_REQUIRE_PREFIX}
ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET=${WHATSAPP_AUTOPILOT_EXECUTION_TARGET}
ORION_AUTH_MODE=${ORION_AUTH_MODE_VALUE}
ORION_DISABLE_OPENAI_API_KEY=${ORION_DISABLE_OPENAI_API_KEY_VALUE}
EOF
chmod 600 "${STATE_DIR}/stack.env" 2>/dev/null || true

release_start_lock() {
  if [[ "${LOCK_HELD}" != "1" ]]; then
    return 0
  fi
  if [[ -f "${START_LOCK_FILE}" ]]; then
    local lock_pid
    lock_pid="$(cut -d'|' -f1 "${START_LOCK_FILE}" 2>/dev/null || true)"
    if [[ "${lock_pid}" == "${STARTER_PID}" ]]; then
      rm -f "${START_LOCK_FILE}" 2>/dev/null || true
    fi
  fi
  LOCK_HELD=0
}

write_start_metadata() {
  local runtime_fp
  runtime_fp="$(printf "%s" "${RUNTIME_KEY}" | shasum -a 256 | awk '{print $1}' | cut -c1-12)"
  cat > "${START_META_FILE}" <<EOF
{
  "starter_pid": ${STARTER_PID},
  "started_at": "${STARTED_AT}",
  "lock_owner": "${LOCK_OWNER}",
  "runtime_key_fingerprint": "${runtime_fp}",
  "openclaw_policy": "${OPENCLAW_GATEWAY_POLICY}",
  "auth_mode": "${ORION_AUTH_MODE_VALUE}"
}
EOF
  chmod 600 "${START_META_FILE}" 2>/dev/null || true
}

is_pid_alive() {
  local pid="${1:-}"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

cleanup_stale_pid_file() {
  local name="$1"
  local file="${PID_DIR}/${name}.pid"
  if [[ ! -f "${file}" ]]; then
    return 0
  fi
  local pid
  pid="$(cat "${file}" 2>/dev/null || true)"
  if [[ -z "${pid}" ]]; then
    echo "Removing empty pid file for ${name}"
    rm -f "${file}" 2>/dev/null || true
    return 0
  fi
  if ! is_pid_alive "${pid}"; then
    echo "Removing stale pid file for ${name} (${pid})"
    rm -f "${file}" 2>/dev/null || true
  fi
}

cleanup_stale_pid_files() {
  cleanup_stale_pid_file "runtime"
  cleanup_stale_pid_file "backend"
  cleanup_stale_pid_file "frontend"
  cleanup_stale_pid_file "worker"
  cleanup_stale_pid_file "ops-daemon"
}

service_log_path() {
  local name="$1"
  case "${name}" in
    runtime) echo "${LOG_DIR}/runtime.log" ;;
    backend) echo "${LOG_DIR}/backend.log" ;;
    frontend) echo "${LOG_DIR}/frontend.log" ;;
    worker) echo "${LOG_DIR}/worker.log" ;;
    ops-daemon) echo "${LOG_DIR}/ops-daemon.log" ;;
    *) echo "${LOG_DIR}/${name}.log" ;;
  esac
}

fail_service_startup() {
  local name="$1"
  local reason="$2"
  echo "${name} failed to start: ${reason}"
  echo "Check log: $(service_log_path "${name}")"
  exit 1
}

wait_pid_file_alive() {
  local name="$1"
  local max_tries="${2:-20}"
  local sleep_s="${3:-0.3}"
  local file="${PID_DIR}/${name}.pid"
  local attempt pid
  for ((attempt=1; attempt<=max_tries; attempt++)); do
    pid="$(cat "${file}" 2>/dev/null || true)"
    if is_pid_alive "${pid}"; then
      return 0
    fi
    sleep "${sleep_s}"
  done
  return 1
}

assert_service_running() {
  local name="$1"
  local port="${2:-}"
  local pid_file="${PID_DIR}/${name}.pid"
  local pid
  pid="$(cat "${pid_file}" 2>/dev/null || true)"

  if [[ -n "${port}" ]]; then
    local port_pid
    port_pid="$(lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null | head -n1 | tr -d '[:space:]' || true)"
    if [[ -z "${port_pid}" ]]; then
      fail_service_startup "${name}" "listener port ${port} is not active"
    fi
    echo "${port_pid}" > "${pid_file}"
    pid="${port_pid}"
  fi

  if ! is_pid_alive "${pid}"; then
    fail_service_startup "${name}" "pid file is missing or process is not alive"
  fi
}

acquire_start_lock() {
  local waited="0"
  local max_wait
  max_wait="$(python3 - <<'PY'
import os
raw = os.getenv("ORION_STACK_START_LOCK_WAIT_SECONDS", "15")
try:
    value = float(raw)
except Exception:
    value = 15.0
print(max(1.0, min(value, 120.0)))
PY
)"
  while true; do
    if ( set -o noclobber; printf "%s|%s|%s\n" "${STARTER_PID}" "${STARTED_AT}" "${LOCK_OWNER}" > "${START_LOCK_FILE}" ) 2>/dev/null; then
      LOCK_HELD=1
      trap release_start_lock EXIT
      return 0
    fi
    local existing_pid existing_started existing_owner
    existing_pid="$(cut -d'|' -f1 "${START_LOCK_FILE}" 2>/dev/null || true)"
    existing_started="$(cut -d'|' -f2 "${START_LOCK_FILE}" 2>/dev/null || true)"
    existing_owner="$(cut -d'|' -f3 "${START_LOCK_FILE}" 2>/dev/null || true)"
    if [[ -z "${existing_pid}" ]] || ! kill -0 "${existing_pid}" 2>/dev/null; then
      rm -f "${START_LOCK_FILE}" 2>/dev/null || true
      continue
    fi
    if python3 - "${waited}" "${max_wait}" <<'PY'
import sys
waited = float(sys.argv[1])
max_wait = float(sys.argv[2])
sys.exit(0 if waited >= max_wait else 1)
PY
    then
      echo "Another Empyralis stack startup is already running."
      echo "lock_owner: ${existing_owner:-unknown} pid=${existing_pid} started_at=${existing_started:-unknown}"
      echo "Wait for it to finish, or if stale run: rm -f ${START_LOCK_FILE}"
      exit 1
    fi
    sleep 0.2
    waited="$(python3 - "${waited}" <<'PY'
import sys
value = float(sys.argv[1]) + 0.2
print(f"{value:.1f}")
PY
)"
  done
}

acquire_start_lock

is_openclaw_gateway_running() {
  if pgrep -f "openclaw gateway" >/dev/null 2>&1; then
    return 0
  fi
  if pgrep -f "ai.openclaw.gateway" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

enforce_openclaw_gateway_policy() {
  if [[ "${TELEGRAM_AUTOPILOT_ENABLED}" != "1" ]]; then
    return 0
  fi
  if [[ "${OPENCLAW_GATEWAY_POLICY}" == "ignore" ]]; then
    return 0
  fi
  if ! is_openclaw_gateway_running; then
    return 0
  fi

  echo "OpenClaw gateway conflict detected."
  echo "If OpenClaw uses the same Telegram bot token, it can consume updates before Empyralis."

  case "${OPENCLAW_GATEWAY_POLICY}" in
    auto_stop)
      if command -v openclaw >/dev/null 2>&1; then
        echo "Policy=auto_stop. Stopping OpenClaw gateway..."
        openclaw gateway stop >/dev/null 2>&1 || true
        sleep 0.5
      fi
      if is_openclaw_gateway_running; then
        echo "Could not stop OpenClaw gateway automatically."
        echo "Run: openclaw gateway stop"
        echo "Or bypass this check once: ORION_OPENCLAW_GATEWAY_POLICY=ignore"
        exit 1
      fi
      echo "OpenClaw gateway stopped."
      ;;
    warn)
      echo "Warning: continuing with conflict risk."
      echo "         Recommended: openclaw gateway stop"
      ;;
    block)
      echo "Policy=block. Refusing to start with Telegram consumer conflict."
      echo "Run: openclaw gateway stop"
      echo "Or bypass this check once: ORION_OPENCLAW_GATEWAY_POLICY=ignore"
      exit 1
      ;;
    *)
      echo "Unknown ORION_OPENCLAW_GATEWAY_POLICY='${OPENCLAW_GATEWAY_POLICY}'."
      echo "Allowed values: auto_stop, warn, block, ignore"
      exit 1
      ;;
  esac
}

enforce_openclaw_gateway_policy

kill_port_if_busy() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:${port} 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    local compact
    compact="$(echo "${pids}" | tr '\n' ' ' | xargs)"
    echo "Port ${port} is busy. Stopping old process(es): ${compact}"
    echo "${pids}" | xargs kill -9 2>/dev/null || true
  fi
}

start_runtime() {
  echo "Starting Empyralis runtime on ${ORION_BIND_HOST}:${ORION_PORT} (advertised: ${ORION_HOST}:${ORION_PORT}) ..."
  local -a runtime_launcher
  if [[ -x "${ROOT_DIR}/venv/bin/uvicorn" ]]; then
    runtime_launcher=("${ROOT_DIR}/venv/bin/uvicorn")
  elif [[ -x "${ROOT_DIR}/.venv/bin/uvicorn" ]]; then
    runtime_launcher=("${ROOT_DIR}/.venv/bin/uvicorn")
  elif [[ -x "${ROOT_DIR}/venv/bin/python" ]]; then
    runtime_launcher=("${ROOT_DIR}/venv/bin/python" "-m" "uvicorn")
  elif [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
    runtime_launcher=("${ROOT_DIR}/.venv/bin/python" "-m" "uvicorn")
  else
    runtime_launcher=("uvicorn")
  fi
  (
    cd "${ROOT_DIR}"
    ORION_AUTH_REQUIRED=1 \
    ORION_API_KEY="${RUNTIME_KEY}" \
    ORION_LOCAL_COMPANION_ENABLED=1 \
    EMPYRALIS_TELEGRAM_AUTOPILOT_ENABLED="${TELEGRAM_AUTOPILOT_ENABLED}" \
    EMPYRALIS_TELEGRAM_AUTOPILOT_PROFILE="${TELEGRAM_AUTOPILOT_PROFILE}" \
    EMPYRALIS_TELEGRAM_AUTOPILOT_ENGINE="${TELEGRAM_AUTOPILOT_ENGINE}" \
    EMPYRALIS_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX="${TELEGRAM_AUTOPILOT_REQUIRE_PREFIX}" \
    EMPYRALIS_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT="${TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT}" \
    EMPYRALIS_TELEGRAM_AUTOPILOT_EXECUTION_TARGET="${TELEGRAM_AUTOPILOT_EXECUTION_TARGET}" \
    ORION_TELEGRAM_AUTOPILOT_ENABLED="${TELEGRAM_AUTOPILOT_ENABLED}" \
    ORION_TELEGRAM_AUTOPILOT_PROFILE="${TELEGRAM_AUTOPILOT_PROFILE}" \
    ORION_TELEGRAM_AUTOPILOT_ENGINE="${TELEGRAM_AUTOPILOT_ENGINE}" \
    ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX="${TELEGRAM_AUTOPILOT_REQUIRE_PREFIX}" \
    ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT="${TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT}" \
    ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET="${TELEGRAM_AUTOPILOT_EXECUTION_TARGET}" \
    EMPYRALIS_WHATSAPP_AUTOPILOT_ENABLED="${WHATSAPP_AUTOPILOT_ENABLED}" \
    EMPYRALIS_WHATSAPP_AUTOPILOT_PROFILE="${WHATSAPP_AUTOPILOT_PROFILE}" \
    EMPYRALIS_WHATSAPP_AUTOPILOT_ENGINE="${WHATSAPP_AUTOPILOT_ENGINE}" \
    EMPYRALIS_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX="${WHATSAPP_AUTOPILOT_REQUIRE_PREFIX}" \
    EMPYRALIS_WHATSAPP_AUTOPILOT_EXECUTION_TARGET="${WHATSAPP_AUTOPILOT_EXECUTION_TARGET}" \
    ORION_WHATSAPP_AUTOPILOT_ENABLED="${WHATSAPP_AUTOPILOT_ENABLED}" \
    ORION_WHATSAPP_AUTOPILOT_PROFILE="${WHATSAPP_AUTOPILOT_PROFILE}" \
    ORION_WHATSAPP_AUTOPILOT_ENGINE="${WHATSAPP_AUTOPILOT_ENGINE}" \
    ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX="${WHATSAPP_AUTOPILOT_REQUIRE_PREFIX}" \
    ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET="${WHATSAPP_AUTOPILOT_EXECUTION_TARGET}" \
    ORION_AUTH_MODE="${ORION_AUTH_MODE_VALUE}" \
    ORION_DISABLE_OPENAI_API_KEY="${ORION_DISABLE_OPENAI_API_KEY_VALUE}" \
    OPENAI_HEALTHCHECK="${OPENAI_HEALTHCHECK:-0}" \
    nohup "${runtime_launcher[@]}" server:app --host "${ORION_BIND_HOST}" --port "${ORION_PORT}" > "${LOG_DIR}/runtime.log" 2>&1 &
    echo $! > "${PID_DIR}/runtime.pid"
  )
}

start_backend() {
  local mode="${BACKEND_MODE}"
  if [[ "${mode}" == "auto" ]]; then
    if [[ -f "${ROOT_DIR}/backend/dist/main.js" ]]; then
      mode="dist"
    else
      mode="dev"
    fi
  fi

  BACKEND_EFFECTIVE_MODE="${mode}"

  if [[ "${mode}" == "skip" ]]; then
    echo "Skipping backend startup (BACKEND_MODE=skip)."
    return 0
  fi

  echo "Starting backend on 127.0.0.1:${BACKEND_PORT} (mode=${mode}) ..."
  (
    cd "${ROOT_DIR}/backend"
    if [[ "${mode}" == "dist" ]]; then
      if [[ -f "dist/main.js" ]]; then
        nohup node --enable-source-maps dist/main.js > "${LOG_DIR}/backend.log" 2>&1 &
      else
        nohup npm run start:prod > "${LOG_DIR}/backend.log" 2>&1 &
      fi
    else
      nohup npm run start:dev > "${LOG_DIR}/backend.log" 2>&1 &
    fi
    echo $! > "${PID_DIR}/backend.pid"
  )
}

start_frontend() {
  echo "Starting frontend on ${FRONTEND_HOST}:${FRONTEND_PORT} ..."
  (
    cd "${ROOT_DIR}/frontend"
    NEXT_PUBLIC_ORION_API_URL="${ORION_API_URL}" \
    NEXT_PUBLIC_ORION_API_KEY="${RUNTIME_KEY}" \
    nohup npm run dev -- --hostname "${FRONTEND_HOST}" --port "${FRONTEND_PORT}" > "${LOG_DIR}/frontend.log" 2>&1 &
    echo $! > "${PID_DIR}/frontend.pid"
  )
}

start_worker() {
  echo "Starting local worker ..."
  (
    cd "${ROOT_DIR}"
    RUNTIME_KEY="${RUNTIME_KEY}" \
    ORION_API_URL="${ORION_API_URL}" \
    ORION_AUTH_MODE="${ORION_AUTH_MODE_VALUE}" \
    ORION_DISABLE_OPENAI_API_KEY="${ORION_DISABLE_OPENAI_API_KEY_VALUE}" \
    nohup bash scripts/run_local_worker.sh > "${LOG_DIR}/worker.log" 2>&1 &
    echo $! > "${PID_DIR}/worker.pid"
  )
}

start_ops_daemon() {
  if [[ "${START_OPS_DAEMON}" != "1" ]]; then
    OPS_DAEMON_STATUS="disabled"
    return 0
  fi
  local start_script="${ROOT_DIR}/${START_OPS_DAEMON_HELPER}"
  if [[ ! -x "${start_script}" ]]; then
    start_script="${ROOT_DIR}/scripts/start_orion_ops_daemon.sh"
  fi
  if [[ ! -x "${start_script}" ]]; then
    OPS_DAEMON_STATUS="missing_script"
    return 0
  fi
  if ORION_API_URL="${ORION_API_URL}" RUNTIME_KEY="${RUNTIME_KEY}" bash "${start_script}" >/dev/null 2>&1; then
    OPS_DAEMON_STATUS="on"
  else
    OPS_DAEMON_STATUS="error"
    echo "Warning: ops daemon failed to start. Continue without daemon."
    echo "         Run: bash ${START_OPS_DAEMON_HELPER}"
  fi
}

wait_http_ok() {
  local url="$1"
  local max_tries="${2:-40}"
  local sleep_s="${3:-0.5}"
  local i
  for ((i=1; i<=max_tries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${sleep_s}"
  done
  return 1
}

record_pid_from_port() {
  local name="$1"
  local port="$2"
  local pids
  pids="$(lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    local pid
    pid="$(echo "${pids}" | head -n1 | tr -d '[:space:]')"
    if [[ -n "${pid}" ]]; then
      echo "${pid}" > "${PID_DIR}/${name}.pid"
    fi
  fi
}

verify_stack_running() {
  if [[ "${START_RUNTIME}" == "1" ]]; then
    if ! wait_http_ok "${ORION_API_URL}/health" 10 0.3; then
      fail_service_startup "runtime" "health endpoint did not stay ready"
    fi
    assert_service_running "runtime" "${ORION_PORT}"
  fi

  if [[ "${BACKEND_EFFECTIVE_MODE}" != "skip" ]]; then
    if ! wait_http_ok "${BACKEND_HEALTH_URL}" 10 0.3; then
      fail_service_startup "backend" "health endpoint did not stay ready"
    fi
    assert_service_running "backend" "${BACKEND_PORT}"
  fi

  if [[ "${START_FRONTEND}" == "1" ]]; then
    if ! wait_http_ok "http://127.0.0.1:${FRONTEND_PORT}" 10 0.3; then
      fail_service_startup "frontend" "HTTP endpoint did not stay ready"
    fi
    assert_service_running "frontend" "${FRONTEND_PORT}"
  fi

  if [[ "${START_WORKER}" == "1" ]]; then
    assert_service_running "worker"
  fi

  if [[ "${START_OPS_DAEMON}" == "1" ]]; then
    if [[ "${OPS_DAEMON_STATUS}" != "on" ]]; then
      fail_service_startup "ops-daemon" "startup helper reported status=${OPS_DAEMON_STATUS}"
    fi
    if ! wait_http_ok "${OPS_DAEMON_URL}/health" 10 0.3; then
      fail_service_startup "ops-daemon" "health endpoint did not stay ready"
    fi
    assert_service_running "ops-daemon" "${ORION_OPS_DAEMON_PORT:-8787}"
  fi
}

cleanup_stale_pid_files

if [[ "${START_RUNTIME}" == "1" ]]; then
  kill_port_if_busy "${ORION_PORT}"
fi
if [[ "${START_BACKEND}" == "1" ]]; then
  kill_port_if_busy "${BACKEND_PORT}"
fi
if [[ "${START_FRONTEND}" == "1" ]]; then
  kill_port_if_busy "${FRONTEND_PORT}"
fi

if [[ "${START_RUNTIME}" == "1" ]]; then
  start_runtime
  if ! wait_http_ok "${ORION_API_URL}/health" 50 0.4; then
    fail_service_startup "runtime" "health endpoint did not become ready"
  fi
  record_pid_from_port "runtime" "${ORION_PORT}"
else
  echo "Skipping runtime startup (START_RUNTIME=0)."
fi
if [[ "${START_BACKEND}" == "1" ]]; then
  start_backend
  if ! wait_http_ok "${BACKEND_HEALTH_URL}" 80 0.4; then
    echo "Backend did not become ready (mode=${BACKEND_EFFECTIVE_MODE}). Check: ${LOG_DIR}/backend.log"
    if [[ "${BACKEND_MODE}" == "auto" && "${BACKEND_EFFECTIVE_MODE}" == "dev" && -f "${ROOT_DIR}/backend/dist/main.js" ]]; then
      echo "Auto fallback: retrying backend in dist mode..."
      if [[ -f "${PID_DIR}/backend.pid" ]]; then
        old_backend_pid="$(cat "${PID_DIR}/backend.pid" 2>/dev/null || true)"
        if [[ -n "${old_backend_pid}" ]]; then
          kill "${old_backend_pid}" 2>/dev/null || true
          sleep 0.4
          kill -9 "${old_backend_pid}" 2>/dev/null || true
        fi
      fi
      BACKEND_EFFECTIVE_MODE="dist"
      (
        cd "${ROOT_DIR}/backend"
        nohup node --enable-source-maps dist/main.js > "${LOG_DIR}/backend.log" 2>&1 &
        echo $! > "${PID_DIR}/backend.pid"
      )
      if ! wait_http_ok "${BACKEND_HEALTH_URL}" 80 0.4; then
        fail_service_startup "backend" "fallback dist mode did not become ready"
      fi
    else
      fail_service_startup "backend" "health endpoint did not become ready"
    fi
  fi
  record_pid_from_port "backend" "${BACKEND_PORT}"
else
  BACKEND_EFFECTIVE_MODE="skip"
  echo "Skipping backend startup (START_BACKEND=0)."
fi
if [[ "${START_FRONTEND}" == "1" ]]; then
  start_frontend
  if ! wait_http_ok "http://127.0.0.1:${FRONTEND_PORT}" 80 0.4; then
    fail_service_startup "frontend" "HTTP endpoint did not become ready"
  fi
  record_pid_from_port "frontend" "${FRONTEND_PORT}"
else
  echo "Skipping frontend startup (START_FRONTEND=0)."
fi
if [[ "${START_WORKER}" == "1" ]]; then
  start_worker
  if ! wait_pid_file_alive "worker" 20 0.3; then
    fail_service_startup "worker" "process did not stay alive"
  fi
else
  echo "Skipping local worker startup (START_WORKER=0)."
fi

start_ops_daemon
sleep 2
echo "Running final stack verification..."
verify_stack_running

echo
echo "Empyralis local stack is up."
echo "Runtime:  ${ORION_API_URL}"
echo "Backend:  http://127.0.0.1:${BACKEND_PORT}"
echo "Frontend: http://${FRONTEND_HOST}:${FRONTEND_PORT}"
echo "Modes:    runtime=${START_RUNTIME} backend=${BACKEND_EFFECTIVE_MODE:-skip} frontend=${START_FRONTEND} worker=${START_WORKER} telegram_autopilot=${TELEGRAM_AUTOPILOT_ENABLED} whatsapp_autopilot=${WHATSAPP_AUTOPILOT_ENABLED}"
echo "Telegram: profile=${TELEGRAM_AUTOPILOT_PROFILE}"
echo "Telegram: engine=${TELEGRAM_AUTOPILOT_ENGINE}"
echo "Telegram: prefix_required=${TELEGRAM_AUTOPILOT_REQUIRE_PREFIX}"
echo "Telegram: allow_any_chat=${TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT}"
echo "Telegram: execution_target=${TELEGRAM_AUTOPILOT_EXECUTION_TARGET}"
echo "WhatsApp: profile=${WHATSAPP_AUTOPILOT_PROFILE}"
echo "WhatsApp: engine=${WHATSAPP_AUTOPILOT_ENGINE}"
echo "WhatsApp: prefix_required=${WHATSAPP_AUTOPILOT_REQUIRE_PREFIX}"
echo "WhatsApp: execution_target=${WHATSAPP_AUTOPILOT_EXECUTION_TARGET}"
echo "OpenClaw policy: ${OPENCLAW_GATEWAY_POLICY}"
echo "Auth: mode=${ORION_AUTH_MODE_VALUE} disable_openai_api_key=${ORION_DISABLE_OPENAI_API_KEY_VALUE}"
echo "Ops daemon: ${OPS_DAEMON_STATUS} (${OPS_DAEMON_URL})"
echo "Ops daemon autorecover: enabled=${ORION_OPS_DAEMON_AUTORECOVER:-1} poll=${ORION_OPS_DAEMON_HEALTH_POLL_SECONDS:-8}s threshold=${ORION_OPS_DAEMON_FAILURE_THRESHOLD:-2} cooldown=${ORION_OPS_DAEMON_RECOVERY_COOLDOWN_SECONDS:-45}s"
echo
echo "Runtime key: ${RUNTIME_KEY}"
echo
echo "Health checks:"
echo "  curl -s -H \"X-API-Key: ${RUNTIME_KEY}\" ${ORION_API_URL}/health"
echo "  curl -s -H \"X-API-Key: ${RUNTIME_KEY}\" \"${ORION_API_URL}/local/workers/status\""
echo "  curl -s -H \"X-API-Key: ${RUNTIME_KEY}\" \"${ORION_API_URL}/connectors/vault?workspace_id=default\""
echo "  curl -s -H \"X-API-Key: ${RUNTIME_KEY}\" \"${ORION_API_URL}/channels/telegram/autopilot/status\""
echo "  curl -s -H \"X-API-Key: ${RUNTIME_KEY}\" \"${ORION_API_URL}/channels/whatsapp/autopilot/status\""
echo
echo "Logs:"
echo "  bash ${LOGS_STACK_HELPER}"
echo "  tail -f ${LOG_DIR}/runtime.log"
echo "  tail -f ${LOG_DIR}/backend.log"
echo "  tail -f ${LOG_DIR}/frontend.log"
echo "  tail -f ${LOG_DIR}/worker.log"
echo
echo "Terminal wizard:"
echo "  bash ${TERMINAL_WIZARD_HELPER} --runtime-key \"${RUNTIME_KEY}\""
echo
echo "Connector setup helpers:"
echo "  bash scripts/setup_google_workspace_connector.sh"
echo "  bash scripts/setup_telegram_connector.sh"
echo "  bash scripts/setup_whatsapp_connector.sh"
echo "  bash scripts/whatsapp_webhook_probe.sh"
echo
echo "Environment readiness:"
echo "  bash ${ENV_READINESS_HELPER}"
echo
echo "Ops daemon helpers:"
echo "  bash ${START_OPS_DAEMON_HELPER}"
echo "  bash ${STATUS_OPS_DAEMON_HELPER}"
echo "  bash ${STOP_OPS_DAEMON_HELPER}"
echo "  bash ${INSTALL_OPS_DAEMON_LAUNCHD_HELPER}"
echo "  bash ${STATUS_OPS_DAEMON_LAUNCHD_HELPER}"
echo "  bash ${UNINSTALL_OPS_DAEMON_LAUNCHD_HELPER}"
echo
echo "To stop all:"
echo "  bash ${STOP_STACK_HELPER}"

write_start_metadata
