#!/usr/bin/env bash
set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:4000/api/v1}"
USER_AGENT="${USER_AGENT:-tauri}"

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/empyralis-frontend-workflow-smoke.XXXXXX")"
cookiejar="${tmpdir}/cookies.txt"
trap 'rm -rf "$tmpdir"' EXIT

email="codex.workflow.$(date +%s)@local.test"
password='CodexWorkflow!234'

common_headers=(
  -H "Origin: ${FRONTEND_URL}"
  -H "User-Agent: ${USER_AGENT}"
)

signup_json="${tmpdir}/signup.json"
login_json="${tmpdir}/login.json"

signup_payload="$(jq -n \
  --arg email "$email" \
  --arg password "$password" \
  --arg name 'Codex Workflow Smoke' \
  '{email:$email,password:$password,name:$name}')"

curl -sS -X POST "${BACKEND_URL}/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "$signup_payload" \
  > "$signup_json"

jq -e 'has("token") and (.token | type == "string") and (.token | length > 0)' "$signup_json" >/dev/null

login_payload="$(jq -n \
  --arg email "$email" \
  --arg password "$password" \
  '{email:$email,password:$password,return_to:"/workflows"}')"

curl -sS -c "$cookiejar" -b "$cookiejar" -X POST "${FRONTEND_URL}/api/control-plane/auth/login" \
  "${common_headers[@]}" \
  -H 'Content-Type: application/json' \
  -d "$login_payload" \
  > "$login_json"

jq -e '.ok == true and .auth_type == "bearer" and .admin == true' "$login_json" >/dev/null

workflow_payload="$(jq -n '{
  name:"Frontend Workflow Smoke",
  description:"Authenticated BFF workflow smoke",
  definition:{
    version:"empyralist.workflow.v2",
    nodes:[
      {
        id:"trigger_1",
        type:"trigger",
        variant:"connector_event",
        data:{label:"Inbound"},
        config:{connector:"telegram_bot",event:"inbound_message"}
      },
      {
        id:"data_1",
        type:"data",
        variant:"transform",
        data:{label:"Transform"},
        config:{template:"Normalize the inbound event"}
      }
    ],
    edges:[
      {id:"edge_1",source:"trigger_1",target:"data_1"}
    ]
  }
}')"

workflow_create_json="${tmpdir}/workflow-create.json"
curl -sS -c "$cookiejar" -b "$cookiejar" -X POST "${FRONTEND_URL}/api/workflows?workspaceId=default" \
  "${common_headers[@]}" \
  -H 'Content-Type: application/json' \
  -d "$workflow_payload" \
  > "$workflow_create_json"

workflow_id="$(jq -r '.id // empty' "$workflow_create_json")"
if [[ -z "$workflow_id" ]]; then
  echo "Workflow creation failed:" >&2
  cat "$workflow_create_json" >&2 || true
  exit 1
fi

workflow_publish_json="${tmpdir}/workflow-publish.json"
curl -sS -c "$cookiejar" -b "$cookiejar" -X POST "${FRONTEND_URL}/api/workflows/${workflow_id}/publish" \
  "${common_headers[@]}" \
  > "$workflow_publish_json"

jq -e '.status == "published"' "$workflow_publish_json" >/dev/null

workflow_run_payload="$(jq -n --arg workflow_id "$workflow_id" '{
  engine:"orion",
  workflow_id:$workflow_id,
  workspace_id:"default",
  user_goal:"Run workflow through frontend BFF smoke",
  metadata:{
    origin:"frontend_workflow_smoke",
    trust_mode:"guarded"
  }
}')"

workflow_run_json="${tmpdir}/workflow-run.json"
curl -sS -c "$cookiejar" -b "$cookiejar" -X POST "${FRONTEND_URL}/api/workflows/${workflow_id}/run" \
  "${common_headers[@]}" \
  -H 'Content-Type: application/json' \
  -d "$workflow_run_payload" \
  > "$workflow_run_json"

run_id="$(jq -r '.run_id // empty' "$workflow_run_json")"
if [[ -z "$run_id" ]]; then
  echo "Workflow run start failed:" >&2
  cat "$workflow_run_json" >&2 || true
  exit 1
fi

run_detail_json="${tmpdir}/run-detail.json"
run_status=""
for _ in $(seq 1 20); do
  curl -sS -c "$cookiejar" -b "$cookiejar" "${FRONTEND_URL}/api/runs/${run_id}" \
    "${common_headers[@]}" \
    > "$run_detail_json"
  run_status="$(jq -r '.status // empty' "$run_detail_json")"
  case "$run_status" in
    completed|waiting_for_input|failed)
      break
      ;;
  esac
  sleep 0.5
done

if [[ "$run_status" != "completed" ]]; then
  echo "Workflow run did not complete:" >&2
  cat "$run_detail_json" >&2 || true
  exit 1
fi

echo "PASS frontend workflow bff smoke"
echo "  email: ${email}"
echo "  workflow_id: ${workflow_id}"
echo "  run_id: ${run_id}"
echo "  frontend: ${FRONTEND_URL}"
