#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${ROOT_DIR}/desktop"

if [[ ! -f "${DESKTOP_DIR}/package.json" ]]; then
  echo "[error] desktop/package.json not found."
  exit 1
fi

echo "[setup] Installing Empyralis desktop dependencies..."
cd "${DESKTOP_DIR}"
npm install

echo
echo "Desktop dependencies installed."
echo "Run:"
echo "  bash scripts/run_empyralis_desktop.sh"
echo "  # Windows PowerShell: scripts/run_empyralis_desktop.ps1"
echo
echo "Build packages:"
echo "  bash scripts/build_empyralis_desktop.sh auto"
echo "  # or: mac | win | linux | all | dir"
