#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${ORION_API_URL:-http://127.0.0.1:8001}"
RUNTIME_KEY_FILE="${ROOT_DIR}/.orion-stack/runtime_key"
RUNTIME_KEY="${RUNTIME_KEY:-${ORION_API_KEY:-}}"
WORKSPACE_ID="${WORKSPACE_ID:-default}"
LABEL="${LABEL:-WhatsApp Twilio}"
ACCOUNT_SID="${ACCOUNT_SID:-${TWILIO_ACCOUNT_SID:-}}"
AUTH_TOKEN="${AUTH_TOKEN:-${TWILIO_AUTH_TOKEN:-}}"
FROM_NUMBER="${FROM_NUMBER:-${TWILIO_WHATSAPP_FROM:-whatsapp:+14155238886}}"
TO_NUMBER="${TO_NUMBER:-${TWILIO_WHATSAPP_TO:-whatsapp:*}}"
WEBHOOK_BASE_URL="${WEBHOOK_BASE_URL:-${API_URL}}"
WEBHOOK_SECRET="${ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET:-}"
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
RUN_PROBE="${RUN_PROBE:-0}"

is_interactive="0"
if [[ -t 0 && -t 1 ]]; then
  is_interactive="1"
fi

if [[ -z "${RUNTIME_KEY}" && -f "${RUNTIME_KEY_FILE}" ]]; then
  RUNTIME_KEY="$(tr -d '\r\n' < "${RUNTIME_KEY_FILE}" 2>/dev/null || true)"
fi
RUNTIME_KEY="$(printf "%s" "${RUNTIME_KEY}" | tr -d '[:space:]')"

if [[ -z "${RUNTIME_KEY}" ]]; then
  echo "Missing runtime API key."
  echo "Set RUNTIME_KEY or ORION_API_KEY, or start stack first."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install jq and rerun."
  exit 1
fi

if [[ -z "${ACCOUNT_SID}" && "${is_interactive}" == "1" && "${NON_INTERACTIVE}" != "1" ]]; then
  read -r -p "Twilio Account SID: " ACCOUNT_SID
fi

if [[ -z "${AUTH_TOKEN}" && "${is_interactive}" == "1" && "${NON_INTERACTIVE}" != "1" ]]; then
  read -r -s -p "Twilio Auth Token: " AUTH_TOKEN
  echo
fi

if [[ "${is_interactive}" == "1" && "${NON_INTERACTIVE}" != "1" ]]; then
  read -r -p "WhatsApp from number [${FROM_NUMBER}]: " _from || true
  if [[ -n "${_from:-}" ]]; then
    FROM_NUMBER="${_from}"
  fi
  read -r -p "Allowed inbound sender (to_number) [${TO_NUMBER}]: " _to || true
  if [[ -n "${_to:-}" ]]; then
    TO_NUMBER="${_to}"
  fi
fi

if [[ -z "${ACCOUNT_SID}" || -z "${AUTH_TOKEN}" ]]; then
  echo "Account SID and Auth Token are required."
  echo "Set ACCOUNT_SID/AUTH_TOKEN or TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN."
  exit 1
fi

if [[ ! "${ACCOUNT_SID}" =~ ^AC[0-9a-zA-Z]{32}$ ]]; then
  echo "Twilio Account SID format looks invalid. Expected AC + 32 chars."
  exit 1
fi

if [[ "${FROM_NUMBER}" != whatsapp:* ]]; then
  echo "from_number must start with 'whatsapp:'"
  exit 1
fi
if [[ "${TO_NUMBER}" != whatsapp:* ]]; then
  echo "to_number must start with 'whatsapp:'"
  exit 1
fi

echo "Validating Twilio credentials..."
TWILIO_CHECK="$(curl -fsS -u "${ACCOUNT_SID}:${AUTH_TOKEN}" "https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}.json" || true)"
TWILIO_SID="$(echo "${TWILIO_CHECK}" | jq -r '.sid // empty')"
if [[ -z "${TWILIO_SID}" ]]; then
  echo "Twilio credentials failed:"
  echo "${TWILIO_CHECK}" | jq
  exit 1
fi
echo "Twilio OK: ${TWILIO_SID}"

PAYLOAD="$(jq -n \
  --arg label "${LABEL}" \
  --arg ws "${WORKSPACE_ID}" \
  --arg sid "${ACCOUNT_SID}" \
  --arg token "${AUTH_TOKEN}" \
  --arg from "${FROM_NUMBER}" \
  --arg to "${TO_NUMBER}" \
  '{label:$label,connector:"whatsapp_twilio",workspace_id:$ws,credentials:{account_sid:$sid,auth_token:$token,from_number:$from,to_number:$to}}')"

echo "Saving connector to vault..."
CREATE_OUT="$(curl -fsS -X POST \
  -H "X-API-Key: ${RUNTIME_KEY}" \
  -H "Content-Type: application/json" \
  "${API_URL}/connectors/vault" \
  -d "${PAYLOAD}" || true)"

if echo "${CREATE_OUT}" | jq -e '.id? // empty' >/dev/null 2>&1; then
  echo "Connector created:"
  echo "${CREATE_OUT}" | jq '{id,label,connector,workspace_id,status}'
else
  echo "Connector create response:"
  echo "${CREATE_OUT}" | jq
  exit 1
fi

echo
echo "Autopilot status:"
WA_STATUS="$(curl -fsS -H "X-API-Key: ${RUNTIME_KEY}" "${API_URL}/channels/whatsapp/autopilot/status" || echo '{}')"
echo "${WA_STATUS}" | jq '{ok,autopilot:{enabled,active,thread_alive,processed_messages,runs_started,connectors_seen,last_error},connectors}'

WA_ENABLED="$(echo "${WA_STATUS}" | jq -r '.autopilot.enabled // false' 2>/dev/null || echo "false")"
if [[ "${WA_ENABLED}" != "true" ]]; then
  echo
  echo "WhatsApp autopilot is disabled in runtime config."
  echo "Restart stack with:"
  echo "  ORION_WHATSAPP_AUTOPILOT_ENABLED=1 bash scripts/start_empyralis_local_stack.sh"
fi

WEBHOOK_URL="${WEBHOOK_BASE_URL%/}/channels/whatsapp/twilio/webhook"
if [[ -n "${WEBHOOK_SECRET}" ]]; then
  WEBHOOK_URL="${WEBHOOK_URL}?secret=${WEBHOOK_SECRET}"
fi

echo
echo "Twilio inbound webhook URL:"
echo "  ${WEBHOOK_URL}"
if [[ "${WEBHOOK_BASE_URL}" == http://127.0.0.1:* || "${WEBHOOK_BASE_URL}" == http://localhost:* ]]; then
  echo "Note: Twilio cannot reach localhost directly. Use a tunnel (ngrok/cloudflared) and set WEBHOOK_BASE_URL."
fi

echo
if [[ "${RUN_PROBE}" == "1" || ( "${is_interactive}" == "1" && "${NON_INTERACTIVE}" != "1" ) ]]; then
  _probe="n"
  if [[ "${RUN_PROBE}" == "1" ]]; then
    _probe="y"
  else
    read -r -p "Run local webhook probe now? [y/N]: " _probe || true
  fi
fi

if [[ "${_probe:-}" =~ ^[Yy]$ ]]; then
  PROBE_FROM="${TO_NUMBER}"
  if [[ "${PROBE_FROM}" == "whatsapp:*" || -z "${PROBE_FROM}" ]]; then
    PROBE_FROM="whatsapp:+15551234567"
    if [[ "${is_interactive}" == "1" && "${NON_INTERACTIVE}" != "1" ]]; then
      read -r -p "Probe sender number [${PROBE_FROM}]: " _probe_from || true
      if [[ -n "${_probe_from:-}" ]]; then
        PROBE_FROM="${_probe_from}"
      fi
    fi
  fi
  ACCOUNT_SID="${ACCOUNT_SID}" \
  TO_NUMBER="${FROM_NUMBER}" \
  FROM_NUMBER="${PROBE_FROM}" \
  MESSAGE_TEXT="/empyralis status" \
  WEBHOOK_SECRET="${WEBHOOK_SECRET}" \
  RUNTIME_KEY="${RUNTIME_KEY}" \
  ORION_API_URL="${API_URL}" \
  bash "${ROOT_DIR}/scripts/whatsapp_webhook_probe.sh" || true
fi

echo
echo "Done. If autopilot is enabled and webhook is reachable, WhatsApp runs will appear in:"
echo "  ./bin/empyralis autopilot watch-line 2"
