#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${ROOT_DIR}/desktop"
OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
OS_ARCH="$(uname -m 2>/dev/null || echo unknown)"
FRONTEND_URL="${ORION_DESKTOP_FRONTEND_URL:-http://127.0.0.1:3000}"
RUNTIME_URL="${ORION_DESKTOP_RUNTIME_URL:-http://127.0.0.1:8001/health}"
START_STACK_SCRIPT="${ROOT_DIR}/scripts/start_empyralis_local_stack.sh"
if [[ ! -x "${START_STACK_SCRIPT}" ]]; then
  START_STACK_SCRIPT="${ROOT_DIR}/scripts/start_orion_local_stack.sh"
fi

if [[ ! -f "${DESKTOP_DIR}/package.json" ]]; then
  echo "[error] desktop/package.json not found."
  exit 1
fi

ensure_stack_ready() {
  local frontend_ok runtime_ok
  frontend_ok=0
  runtime_ok=0

  if curl -fsS "${FRONTEND_URL}" >/dev/null 2>&1; then
    frontend_ok=1
  fi
  if curl -fsS "${RUNTIME_URL}" >/dev/null 2>&1; then
    runtime_ok=1
  fi

  if [[ "${frontend_ok}" == "1" && "${runtime_ok}" == "1" ]]; then
    return 0
  fi

  echo "[setup] Local stack is not fully ready. Starting Empyralis services..."
  bash "${START_STACK_SCRIPT}"

  if ! curl -fsS "${FRONTEND_URL}" >/dev/null 2>&1; then
    echo "[error] Frontend did not become ready at ${FRONTEND_URL}"
    echo "        Check: ${ROOT_DIR}/.orion-stack/logs/frontend.log"
    exit 1
  fi
  if ! curl -fsS "${RUNTIME_URL}" >/dev/null 2>&1; then
    echo "[error] Runtime did not become ready at ${RUNTIME_URL}"
    echo "        Check: ${ROOT_DIR}/.orion-stack/logs/runtime.log"
    exit 1
  fi
}

ensure_stack_ready

cd "${DESKTOP_DIR}"

if [[ ! -d node_modules/electron ]]; then
  echo "[setup] Installing desktop dependencies..."
  npm install
fi

echo "[run] Launching Empyralis Workbench desktop (${OS_NAME})..."
DESKTOP_DISABLE_GPU="${EMPYRALIS_DESKTOP_DISABLE_GPU:-}"
DESKTOP_GL_BACKEND="${EMPYRALIS_DESKTOP_GL:-}"
DESKTOP_DISABLE_METAL="${EMPYRALIS_DESKTOP_DISABLE_METAL:-}"
DESKTOP_DISABLE_VULKAN="${EMPYRALIS_DESKTOP_DISABLE_VULKAN:-}"
if [[ -z "${DESKTOP_DISABLE_GPU}" && "${OS_NAME}" == "Darwin" && "${OS_ARCH}" == "arm64" ]]; then
  DESKTOP_DISABLE_GPU="1"
  echo "[run] Apple Silicon detected. Launching Electron with GPU acceleration disabled for stability."
fi
if [[ -z "${DESKTOP_GL_BACKEND}" && "${OS_NAME}" == "Darwin" && "${OS_ARCH}" == "arm64" ]]; then
  DESKTOP_GL_BACKEND="swiftshader"
  echo "[run] Apple Silicon detected. Forcing Electron to use SwiftShader for software rendering."
fi
if [[ -z "${DESKTOP_DISABLE_METAL}" && "${OS_NAME}" == "Darwin" && "${OS_ARCH}" == "arm64" ]]; then
  DESKTOP_DISABLE_METAL="1"
fi

ELECTRON_ENABLE_LOGGING="${ELECTRON_ENABLE_LOGGING:-1}" \
ELECTRON_ENABLE_STACK_DUMPING="${ELECTRON_ENABLE_STACK_DUMPING:-1}" \
EMPYRALIS_DESKTOP_DISABLE_GPU="${DESKTOP_DISABLE_GPU}" \
EMPYRALIS_DESKTOP_GL="${DESKTOP_GL_BACKEND}" \
EMPYRALIS_DESKTOP_DISABLE_METAL="${DESKTOP_DISABLE_METAL}" \
EMPYRALIS_DESKTOP_DISABLE_VULKAN="${DESKTOP_DISABLE_VULKAN}" \
npm run dev
