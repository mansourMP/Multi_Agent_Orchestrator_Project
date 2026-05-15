# Finish Phase 4 Live Certification Runbook

Last updated: 2026-04-22

## Goal

Produce live operational proof for the gateway-backed personal runtime lane.
This runbook is intentionally limited to the Finish Phase 4 matrix:

1. real WhatsApp personal account flow
2. real Telegram personal account flow
3. gateway offline/reconnect recovery
4. existing-session browser attach

This runbook does not treat repo tests as completion criteria.

## Preconditions

- Repo root: `/Users/mansur/Multi_Agent_Orchestrator_Project`
- Active backend/runtime: FastAPI/Python in `server_modules/`
- Node dependencies already installed for `empyralis-gateway/`
- Local stack start helper available:
  - `bash scripts/start_empyralis_local_stack.sh`
- Runtime API key available after stack start in:
  - `.orion-stack/runtime_key`

## Phase 4 Commands

### 1. Start the local stack

```bash
bash scripts/start_empyralis_local_stack.sh
```

Expected success:

- runtime up on `127.0.0.1:8001`
- frontend up on `127.0.0.1:3000`
- runtime key written to `.orion-stack/runtime_key`

### 2. Confirm runtime health

```bash
curl -sS -H "X-API-Key: $(cat .orion-stack/runtime_key)" http://127.0.0.1:8001/health
```

Expected success:

```json
{"ok":true}
```

### 3. Inspect existing personal session state

Do not treat legacy connector/autopilot state as proof for the new personal
gateway lane.

```bash
python3 - <<'PY'
import sqlite3, os
path=os.path.expanduser('~/.empyralis/state/personal_channels/personal-channels.sqlite3')
conn=sqlite3.connect('file:'+path+'?mode=ro&immutable=1', uri=True)
cur=conn.cursor()
for tbl in ['personal_channel_whatsapp_states','personal_channel_telegram_states']:
    print(tbl, cur.execute(f'select * from {tbl}').fetchall())
PY
```

Expected success criteria:

- non-empty WhatsApp personal state for real linked WhatsApp proof
- non-empty Telegram personal state for real linked Telegram proof

If both tables are empty, the personal-account portion of the matrix is blocked
before runtime execution.

### 4. Create a gateway pairing intent

```bash
curl -sS -X POST \
  -H "X-API-Key: $(cat .orion-stack/runtime_key)" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"default","display_name":"Codex Live Cert Gateway","platform":"macos"}' \
  http://127.0.0.1:8001/api/gateway/pairings/intents
```

Capture the returned `pairing_token`.

### 5. Start the gateway with an isolated state directory

First ensure the compiled artifact matches current TypeScript source:

```bash
cd empyralis-gateway
npm run build
```

Then launch the gateway:

```bash
env \
  EMPYRALIS_GATEWAY_API_URL=http://127.0.0.1:8001/api \
  EMPYRALIS_GATEWAY_PAIRING_TOKEN="<pairing_token>" \
  EMPYRALIS_GATEWAY_STATE_DIR=/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/live-cert-gateway \
  EMPYRALIS_SUPERVISOR_URL=http://127.0.0.1:7788 \
  EMPYRALIS_SUPERVISOR_SECRET="$(cat /Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/supervisor_secret)" \
  EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT=/Users/mansur/Multi_Agent_Orchestrator_Project \
  node /Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-gateway/dist/index.js
```

Expected success:

- registration created
- session created
- websocket connected
- state persisted under `.orion-stack/live-cert-gateway/`

Useful verification:

```bash
curl -sS -H "X-API-Key: $(cat .orion-stack/runtime_key)" \
  "http://127.0.0.1:8001/api/gateway/registrations?workspace_id=default"
```

### 6. Capture reconnect proof

With the gateway connected, terminate the gateway process and restart it with the
same `EMPYRALIS_GATEWAY_STATE_DIR`, but without a new pairing token.

```bash
env \
  EMPYRALIS_GATEWAY_API_URL=http://127.0.0.1:8001/api \
  EMPYRALIS_GATEWAY_STATE_DIR=/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/live-cert-gateway \
  EMPYRALIS_SUPERVISOR_URL=http://127.0.0.1:7788 \
  EMPYRALIS_SUPERVISOR_SECRET="$(cat /Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/supervisor_secret)" \
  EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT=/Users/mansur/Multi_Agent_Orchestrator_Project \
  node /Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-gateway/dist/index.js
```

Success criteria:

- new gateway session created
- same `gateway_id` and `device_id` reused
- `.orion-stack/live-cert-gateway/checkpoints.json` updated to the new session
- `/api/gateway/registrations/{gateway_id}/events` shows a second
  `gateway.connect` and `gateway.hello`

### 7. Existing-session browser attach

Use the real browser session route:

```bash
curl -sS -X POST \
  -H "X-API-Key: $(cat .orion-stack/runtime_key)" \
  -H "Content-Type: application/json" \
  -d '{"session_mode":"existing_session_attach","url":"https://example.com","run_id":"run-browser-cert-1","trace_id":"trace-browser-cert-1"}' \
  http://127.0.0.1:8001/api/gateway/registrations/<gateway_id>/browser/sessions
```

Success criteria:

- `attach_required` if no CDP endpoint is supplied
- `attached` or active browser session metadata when a real CDP endpoint is
  supplied

If the route returns `fetch failed`, inspect whether `empyralis-gateway/dist/`
is stale or whether the rebuilt gateway is crashing before the websocket scope
becomes active.

### 8. Real personal account flows

These require actual linked personal sessions. The finish gate stays RED unless
both can be proven live:

- WhatsApp personal account linked through the gateway runtime
- Telegram personal account linked through the gateway runtime

Proof should include:

- live linked state present
- inbound or outbound activity observed through the gateway path
- state visible via the gateway doctor/operator APIs

## Evidence Artifacts

During a run, keep the following as evidence:

- `.orion-stack/live-cert-gateway/identity.json`
- `.orion-stack/live-cert-gateway/registration.json`
- `.orion-stack/live-cert-gateway/tokens.json`
- `.orion-stack/live-cert-gateway/checkpoints.json`
- `.orion-stack/live-cert-gateway/hello.json`
- `.orion-stack/live-cert-gateway/journal.ndjson`

## Exit Rule

Finish Phase 4 is GREEN only if all four matrix items are proven live.

It stays RED if any of these are true:

- no real WhatsApp personal linked session
- no real Telegram personal linked session
- browser attach is blocked by runtime failure
- reconnect cannot be reproduced on the live gateway path
