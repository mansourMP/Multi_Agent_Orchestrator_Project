#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

START_TS="$(date +%s)"

declare -a REPORT_LINES=()

PYTHON_BIN=""
if [[ -x "venv/bin/python" ]]; then
  PYTHON_BIN="venv/bin/python"
elif [[ -x ".venv/bin/python" ]]; then
  PYTHON_BIN=".venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
fi

record_result() {
  local status="$1"
  local name="$2"
  local command="$3"
  local duration_s="$4"
  local reason="$5"
  REPORT_LINES+=("${status}|${name}|${command}|${duration_s}|${reason}")
}

run_step() {
  local name="$1"
  local command="$2"

  local step_start
  step_start="$(date +%s)"

  set +e
  (
    eval "${command}"
  ) >/tmp/empyralis-cert-"${name}".log 2>&1
  local exit_code=$?
  set -e

  local step_end
  step_end="$(date +%s)"
  local duration_s=$((step_end - step_start))

  if [[ ${exit_code} -eq 0 ]]; then
    record_result "PASS" "${name}" "${command}" "${duration_s}" "ok"
    return 0
  fi

  local reason
  reason="$(tail -n 1 /tmp/empyralis-cert-"${name}".log 2>/dev/null | tr '|' '/' | tr '\n' ' ')"
  if [[ -z "${reason}" ]]; then
    reason="command failed"
  fi
  record_result "FAIL" "${name}" "${command}" "${duration_s}" "${reason}"
  return 1
}

skip_step() {
  local name="$1"
  local command="$2"
  local reason="$3"
  record_result "SKIPPED" "${name}" "${command}" "0" "${reason}"
}

all_ok=0

if [[ -n "${PYTHON_BIN}" ]]; then
  if ! run_step "backend_tests_auth_bootstrap" "${PYTHON_BIN} -m pytest server_modules/tests/test_auth.py server_modules/tests/test_auth_account_shell.py server_modules/tests/test_workspace_bootstrap_service.py -q"; then
    all_ok=1
  fi
else
  skip_step "backend_tests_auth_bootstrap" "python -m pytest ..." "python interpreter missing"
  all_ok=1
fi

if [[ -d "frontend/node_modules" ]]; then
  if ! run_step "frontend_typecheck" "cd frontend && npm run typecheck --silent"; then
    all_ok=1
  fi
else
  skip_step "frontend_typecheck" "cd frontend && npm run typecheck --silent" "frontend/node_modules missing"
  all_ok=1
fi

if [[ -d "mobile/node_modules" ]]; then
  if ! run_step "mobile_typecheck" "cd mobile && npx tsc --noEmit"; then
    all_ok=1
  fi
else
  skip_step "mobile_typecheck" "cd mobile && npx tsc --noEmit" "mobile/node_modules missing"
  all_ok=1
fi

if [[ -d "empyralis-gateway/node_modules" ]]; then
  if ! run_step "gateway_typecheck" "cd empyralis-gateway && npm run typecheck --silent"; then
    all_ok=1
  fi
  if grep -q "\"test\":" "empyralis-gateway/package.json"; then
    if ! run_step "gateway_tests" "cd empyralis-gateway && npm run test --silent"; then
      all_ok=1
    fi
  else
    skip_step "gateway_tests" "cd empyralis-gateway && npm run test --silent" "gateway package has no test script"
  fi
else
  skip_step "gateway_typecheck" "cd empyralis-gateway && npm run typecheck --silent" "empyralis-gateway/node_modules missing"
  skip_step "gateway_tests" "cd empyralis-gateway && npm run test --silent" "empyralis-gateway/node_modules missing"
  all_ok=1
fi

if ! run_step "git_diff_check" "git diff --check"; then
  all_ok=1
fi

END_TS="$(date +%s)"
TOTAL_S=$((END_TS - START_TS))

printf 'STATUS|STEP|COMMAND|DURATION_SECONDS|REASON\n'
for line in "${REPORT_LINES[@]}"; do
  printf '%s\n' "${line}"
done
printf 'SUMMARY|total_duration_seconds=%s|result=%s\n' "${TOTAL_S}" "$([[ ${all_ok} -eq 0 ]] && echo PASS || echo FAIL)"

exit "${all_ok}"
