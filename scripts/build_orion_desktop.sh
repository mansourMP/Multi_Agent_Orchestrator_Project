#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${ROOT_DIR}/desktop"
TARGET="${1:-auto}"

if [[ ! -f "${DESKTOP_DIR}/package.json" ]]; then
  echo "[error] desktop/package.json not found."
  exit 1
fi

if [[ ! -d "${DESKTOP_DIR}/node_modules/electron" ]]; then
  echo "[setup] Installing desktop dependencies..."
  (cd "${DESKTOP_DIR}" && npm install)
fi

if [[ "${TARGET}" == "auto" ]]; then
  OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "${OS_NAME}" in
    darwin*) TARGET="mac" ;;
    linux*) TARGET="linux" ;;
    msys*|mingw*|cygwin*) TARGET="win" ;;
    *)
      echo "[error] Unknown platform '${OS_NAME}'. Use: mac | win | linux | all | dir"
      exit 1
      ;;
  esac
fi

echo "[build] Empyralis desktop target: ${TARGET}"
cd "${DESKTOP_DIR}"

case "${TARGET}" in
  mac)
    npm run pack:mac
    ;;
  win)
    npm run pack:win
    ;;
  linux)
    npm run pack:linux
    ;;
  all)
    npm run pack:all
    ;;
  dir)
    npm run pack:dir
    ;;
  *)
    echo "[error] Invalid target '${TARGET}'. Use: mac | win | linux | all | dir"
    exit 1
    ;;
esac

echo
echo "Build output:"
echo "  ${DESKTOP_DIR}/dist"
