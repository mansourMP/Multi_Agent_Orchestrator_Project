#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_DIR="${ROOT_DIR}/.orion-stack"
STATE_DIR="${EMPYRALIS_AGENT_COMPUTER_STATE_DIR:-${STACK_DIR}/agent-computer}"
LOG_DIR="${STACK_DIR}/logs"
PID_DIR="${STACK_DIR}/pids"
ENV_FILE="${STATE_DIR}/agent-computer.env"
SUPERVISOR_PID_FILE="${PID_DIR}/agent-computer-supervisor.pid"
EDGE_PID_FILE="${PID_DIR}/agent-computer-edge.pid"
SUPERVISOR_BIN="${ROOT_DIR}/empyralis-supervisor/target/release/empyralis-supervisor"
EDGE_ENTRY="${ROOT_DIR}/empyralis-gateway/dist/index.js"
SUPERVISOR_URL="${EMPYRALIS_SUPERVISOR_URL:-http://127.0.0.1:7788}"
CONTROL_PLANE_URL="${EMPYRALIS_GATEWAY_API_URL:-http://127.0.0.1:8001/api}"
DISPLAY_NAME="${EMPYRALIS_GATEWAY_DISPLAY_NAME:-$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo "Agent Computer")}"

usage() {
  cat <<'EOF'
Agent Computer runtime

Usage:
  scripts/agent_computer.sh install
  scripts/agent_computer.sh start
  scripts/agent_computer.sh stop
  scripts/agent_computer.sh status
  scripts/agent_computer.sh launchd-install
  scripts/agent_computer.sh launchd-uninstall

Environment:
  EMPYRALIS_GATEWAY_PAIRING_TOKEN   Pairing token from Empyralis, used on first start.
  EMPYRALIS_GATEWAY_TOKEN           Existing paired-device token.
  EMPYRALIS_GATEWAY_API_URL         Control plane URL. Defaults to local dev runtime.
EOF
}

shell_quote() {
  printf "%q" "$1"
}

generate_secret() {
  python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
}

mkdirs() {
  mkdir -p "${STATE_DIR}" "${LOG_DIR}" "${PID_DIR}"
}

load_env_if_present() {
  if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
  fi
}

write_env() {
  mkdirs
  load_env_if_present
  local secret="${EMPYRALIS_SUPERVISOR_SECRET:-}"
  if [[ -z "${secret}" ]]; then
    secret="$(generate_secret)"
  fi
  local state_dir="${EMPYRALIS_GATEWAY_STATE_DIR:-${STATE_DIR}/edge}"
  cat > "${ENV_FILE}" <<EOF
export EMPYRALIS_SUPERVISOR_SECRET=$(shell_quote "${secret}")
export EMPYRALIS_SUPERVISOR_URL=$(shell_quote "${SUPERVISOR_URL}")
export EMPYRALIS_SUPERVISOR_AUDIT_DB=$(shell_quote "${STATE_DIR}/supervisor-audit.sqlite3")
export EMPYRALIS_GATEWAY_API_URL=$(shell_quote "${CONTROL_PLANE_URL}")
export EMPYRALIS_GATEWAY_STATE_DIR=$(shell_quote "${state_dir}")
export EMPYRALIS_GATEWAY_DISPLAY_NAME=$(shell_quote "${DISPLAY_NAME}")
export EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT=$(shell_quote "${ROOT_DIR}")
EOF
  chmod 600 "${ENV_FILE}" 2>/dev/null || true
}

load_runtime_env() {
  write_env
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
}

is_pid_alive() {
  local pid="${1:-}"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

pid_from_file() {
  local file="$1"
  [[ -f "${file}" ]] && cat "${file}" 2>/dev/null || true
}

collect_descendants() {
  local parent="$1"
  local children
  children="$(pgrep -P "${parent}" 2>/dev/null || true)"
  [[ -z "${children}" ]] && return 0
  local child
  for child in ${children}; do
    echo "${child}"
    collect_descendants "${child}"
  done
}

kill_tree() {
  local root_pid="$1"
  local pids=()
  local descendants
  descendants="$(collect_descendants "${root_pid}" || true)"
  if [[ -n "${descendants}" ]]; then
    while IFS= read -r pid; do
      [[ -n "${pid}" ]] && pids+=("${pid}")
    done <<< "${descendants}"
  fi
  local idx
  for ((idx=${#pids[@]}-1; idx>=0; idx--)); do
    kill "${pids[$idx]}" 2>/dev/null || true
  done
  kill "${root_pid}" 2>/dev/null || true
  sleep 0.3
  for ((idx=${#pids[@]}-1; idx>=0; idx--)); do
    kill -9 "${pids[$idx]}" 2>/dev/null || true
  done
  kill -9 "${root_pid}" 2>/dev/null || true
}

install_runtime() {
  mkdirs
  write_env
  echo "[Agent Computer] Installing local runtime dependencies..."
  (cd "${ROOT_DIR}/empyralis-gateway" && npm install && npm run build)
  (cd "${ROOT_DIR}/empyralis-supervisor" && cargo build --release)
  echo "[Agent Computer] Installed."
  echo "Config: ${ENV_FILE}"
  echo "Start:  scripts/agent_computer.sh start"
  echo "Status: scripts/agent_computer.sh status"
}

ensure_installed() {
  if [[ ! -f "${EDGE_ENTRY}" || ! -x "${SUPERVISOR_BIN}" ]]; then
    echo "[Agent Computer] Runtime is not built yet. Run:"
    echo "  scripts/agent_computer.sh install"
    exit 1
  fi
}

wait_for_supervisor() {
  for _ in $(seq 1 30); do
    if curl -fsS "${SUPERVISOR_URL}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

start_supervisor() {
  local pid
  pid="$(pid_from_file "${SUPERVISOR_PID_FILE}")"
  if is_pid_alive "${pid}"; then
    echo "[Agent Computer] Local runner already running (pid ${pid})."
    return 0
  fi
  rm -f "${SUPERVISOR_PID_FILE}"
  if wait_for_supervisor; then
    echo "[Agent Computer] Local runner health is already reachable at ${SUPERVISOR_URL}."
    return 0
  fi
  echo "[Agent Computer] Starting local runner..."
  nohup env \
    EMPYRALIS_SUPERVISOR_SECRET="${EMPYRALIS_SUPERVISOR_SECRET}" \
    EMPYRALIS_SUPERVISOR_AUDIT_DB="${EMPYRALIS_SUPERVISOR_AUDIT_DB}" \
    "${SUPERVISOR_BIN}" \
    > "${LOG_DIR}/agent-computer-supervisor.log" 2>&1 &
  echo "$!" > "${SUPERVISOR_PID_FILE}"
  chmod 600 "${SUPERVISOR_PID_FILE}" 2>/dev/null || true
  if ! wait_for_supervisor; then
    echo "[Agent Computer] Local runner failed to become healthy."
    echo "Log: ${LOG_DIR}/agent-computer-supervisor.log"
    exit 1
  fi
}

has_pairing_material() {
  if [[ -n "${EMPYRALIS_GATEWAY_PAIRING_TOKEN:-}" || -n "${EMPYRALIS_GATEWAY_TOKEN:-}" ]]; then
    return 0
  fi
  if [[ -f "${EMPYRALIS_GATEWAY_STATE_DIR}/tokens.json" ]]; then
    return 0
  fi
  return 1
}

start_edge() {
  local pid
  pid="$(pid_from_file "${EDGE_PID_FILE}")"
  if is_pid_alive "${pid}"; then
    echo "[Agent Computer] Cloud connection already running (pid ${pid})."
    return 0
  fi
  rm -f "${EDGE_PID_FILE}"
  if ! has_pairing_material; then
    echo "[Agent Computer] Local runner is ready, but this computer is not paired yet."
    echo "Pair it from Empyralis, then rerun:"
    echo "  EMPYRALIS_GATEWAY_PAIRING_TOKEN=... scripts/agent_computer.sh start"
    return 0
  fi
  echo "[Agent Computer] Starting cloud connection..."
  nohup env \
    EMPYRALIS_SUPERVISOR_SECRET="${EMPYRALIS_SUPERVISOR_SECRET}" \
    EMPYRALIS_SUPERVISOR_URL="${EMPYRALIS_SUPERVISOR_URL}" \
    EMPYRALIS_GATEWAY_API_URL="${EMPYRALIS_GATEWAY_API_URL}" \
    EMPYRALIS_GATEWAY_STATE_DIR="${EMPYRALIS_GATEWAY_STATE_DIR}" \
    EMPYRALIS_GATEWAY_DISPLAY_NAME="${EMPYRALIS_GATEWAY_DISPLAY_NAME}" \
    EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT="${EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT}" \
    EMPYRALIS_GATEWAY_PAIRING_TOKEN="${EMPYRALIS_GATEWAY_PAIRING_TOKEN:-}" \
    EMPYRALIS_GATEWAY_TOKEN="${EMPYRALIS_GATEWAY_TOKEN:-}" \
    node "${EDGE_ENTRY}" \
    > "${LOG_DIR}/agent-computer-edge.log" 2>&1 &
  echo "$!" > "${EDGE_PID_FILE}"
  chmod 600 "${EDGE_PID_FILE}" 2>/dev/null || true
}

start_runtime() {
  ensure_installed
  load_runtime_env
  start_supervisor
  start_edge
  status_runtime
}

stop_pid_file() {
  local label="$1"
  local file="$2"
  local pid
  pid="$(pid_from_file "${file}")"
  if is_pid_alive "${pid}"; then
    echo "[Agent Computer] Stopping ${label} (pid ${pid})..."
    kill_tree "${pid}"
  fi
  rm -f "${file}"
}

stop_runtime() {
  stop_pid_file "cloud connection" "${EDGE_PID_FILE}"
  stop_pid_file "local runner" "${SUPERVISOR_PID_FILE}"
  echo "[Agent Computer] Stopped."
}

status_line() {
  local label="$1"
  local file="$2"
  local pid
  pid="$(pid_from_file "${file}")"
  if is_pid_alive "${pid}"; then
    echo "${label}: running pid=${pid}"
  else
    echo "${label}: stopped"
  fi
}

status_runtime() {
  load_env_if_present
  echo "== Agent Computer status =="
  status_line "local_runner" "${SUPERVISOR_PID_FILE}"
  status_line "cloud_connection" "${EDGE_PID_FILE}"
  if curl -fsS "${SUPERVISOR_URL}/health" >/dev/null 2>&1; then
    echo "health: local runner ok (${SUPERVISOR_URL})"
  else
    echo "health: local runner unavailable (${SUPERVISOR_URL})"
  fi
  echo "config: ${ENV_FILE}"
  echo "logs: ${LOG_DIR}/agent-computer-supervisor.log, ${LOG_DIR}/agent-computer-edge.log"
}

launchd_install() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "launchd-install is only available on macOS."
    exit 1
  fi
  mkdirs
  local plist_dir="${HOME}/Library/LaunchAgents"
  local plist_path="${plist_dir}/ai.empyralis.agent-computer.plist"
  mkdir -p "${plist_dir}"
  cat > "${plist_path}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.empyralis.agent-computer</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT_DIR}/scripts/agent_computer.sh</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/agent-computer-launchd.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/agent-computer-launchd.log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/ai.empyralis.agent-computer" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "${plist_path}"
  launchctl enable "gui/$(id -u)/ai.empyralis.agent-computer"
  launchctl kickstart -k "gui/$(id -u)/ai.empyralis.agent-computer"
  echo "[Agent Computer] Installed macOS auto-start service: ${plist_path}"
}

launchd_uninstall() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "launchd-uninstall is only available on macOS."
    exit 1
  fi
  local service="gui/$(id -u)/ai.empyralis.agent-computer"
  local plist_path="${HOME}/Library/LaunchAgents/ai.empyralis.agent-computer.plist"
  launchctl bootout "${service}" >/dev/null 2>&1 || true
  launchctl disable "${service}" >/dev/null 2>&1 || true
  rm -f "${plist_path}"
  echo "[Agent Computer] Removed macOS auto-start service."
}

cmd="${1:-}"
case "${cmd}" in
  install) install_runtime ;;
  start) start_runtime ;;
  stop) stop_runtime ;;
  status) status_runtime ;;
  launchd-install) launchd_install ;;
  launchd-uninstall) launchd_uninstall ;;
  -h|--help|help|"") usage ;;
  *)
    echo "Unknown command: ${cmd}"
    usage
    exit 1
    ;;
esac
