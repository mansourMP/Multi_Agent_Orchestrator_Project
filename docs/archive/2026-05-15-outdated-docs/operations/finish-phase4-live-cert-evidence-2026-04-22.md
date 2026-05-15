# Finish Phase 4 Live Certification Evidence

Date: 2026-04-22

## Scope

This evidence log captures what was actually proven on this machine during the
Finish Phase 4 run and what remained blocked.

## Commands Run

### Local stack bring-up

```bash
bash scripts/start_empyralis_local_stack.sh
```

Observed:

- stack cleaned stale PID files
- runtime started on `127.0.0.1:8001`
- frontend started on `127.0.0.1:3000`
- runtime key written to `.orion-stack/runtime_key`

### Runtime health

```bash
curl -sS -H 'X-API-Key: restart' http://127.0.0.1:8001/health
```

Observed:

```json
{"ok":true}
```

### Existing personal session inspection

Inspected:

- `~/.empyralis/state/personal_channels/personal-channels.sqlite3`
- legacy files under `~/.empyralis/state/channels/telegram/`
- legacy files under `~/.empyralis/state/channels/whatsapp/`

Observed:

- `personal_channel_whatsapp_states`: empty
- `personal_channel_telegram_states`: empty
- legacy `autopilot_state.json` files existed, but they belong to the older
  connector/autopilot lane and do not certify the new personal gateway lane

Result:

- WhatsApp personal live proof blocked by missing linked personal session
- Telegram personal live proof blocked by missing linked personal session

### Gateway pairing and registration

Created pairing intent:

```bash
curl -sS -X POST \
  -H 'X-API-Key: restart' \
  -H 'Content-Type: application/json' \
  -d '{"workspace_id":"default","display_name":"Codex Live Cert Gateway","platform":"macos"}' \
  http://127.0.0.1:8001/api/gateway/pairings/intents
```

Observed:

- `pairing_id`: `gpairing_b6a00a1c12104ccba931d921b2045bd0`
- live `pairing_token` returned

Started gateway against the live runtime and pairing token. The first outside
the sandbox launch succeeded and produced a real gateway registration.

Observed through:

- `/api/gateway/registrations?workspace_id=default`
- `.orion-stack/live-cert-gateway/registration.json`
- `.orion-stack/live-cert-gateway/tokens.json`
- `.orion-stack/live-cert-gateway/hello.json`
- `.orion-stack/live-cert-gateway/journal.ndjson`

Live proof captured:

- `gateway_id`: `gateway_39f41ecc-526e-4392-9d75-3ca04ecb50b0`
- `device_id`: `device_4d50f2ed-87a2-427b-b1d3-aab473e2c7e6`
- initial session: `gsess_fea64f66570841318a47c4ca94981172`
- hello and presence frames recorded
- heartbeat frames recorded

### Gateway reconnect recovery

Stopped the live gateway process, then restarted it against the same persisted
state directory without re-pairing.

Observed through:

- `/api/gateway/registrations/{gateway_id}/events`
- `.orion-stack/live-cert-gateway/checkpoints.json`
- `.orion-stack/live-cert-gateway/hello.json`
- runtime log websocket open/close entries

Live proof captured:

- old session: `gsess_fea64f66570841318a47c4ca94981172`
- new resumed session: `gsess_d0a6fd0cb5c54ac3893cbf0cd2e617b3`
- same `gateway_id` reused
- same `device_id` reused
- second `gateway.connect` and `gateway.hello` recorded
- checkpoint file updated to the new session

Result:

- gateway offline/reconnect recovery: PROVEN LIVE

### Browser attach route before rebuild

Attempted:

```bash
curl -sS -X POST \
  -H 'X-API-Key: restart' \
  -H 'Content-Type: application/json' \
  -d '{"session_mode":"existing_session_attach","url":"https://example.com","run_id":"run-browser-cert-1","trace_id":"trace-browser-cert-1"}' \
  http://127.0.0.1:8001/api/gateway/registrations/gateway_39f41ecc-526e-4392-9d75-3ca04ecb50b0/browser/sessions
```

Observed:

- route reached the live gateway
- gateway journal recorded a real `tool.invoke` for `browser.session.start`
- response returned `fetch failed`

Root cause found:

- `empyralis-gateway/dist/` was stale
- compiled `dist/index.js` and `dist/supervisor/capability-router.js` did not
  include the browser runtime at all
- browser session requests were falling through to the supervisor path

### Gateway rebuild

Ran:

```bash
cd empyralis-gateway
npm run build
```

Observed:

- rebuilt `dist/browser/runtime.js`
- rebuilt `dist/browser/worker.js`
- rebuilt `dist/browser/session-store.js`
- rebuilt `dist/index.js` now includes browser + WhatsApp + Telegram runtimes

### Browser attach after rebuild

Restarting the rebuilt gateway exposed a new live blocker:

Observed startup failure:

```text
Error: Gateway scope is not active.
    at GatewayWsClient.publishStateUpdate ...
    at TelegramPersonalRuntime.flushState ...
    at async TelegramPersonalRuntime.connectClient ...
    at async TelegramPersonalRuntime.start ...
```

Source location:

- `empyralis-gateway/src/index.ts`
- `empyralis-gateway/src/channels/telegram/runtime.ts`

Meaning:

- the current rebuilt gateway now crashes during startup because Telegram
  personal tries to publish state before websocket scope activation
- this blocks live browser attach certification on the rebuilt current code path

## Matrix Status

### 1. Real WhatsApp personal account flow

Status: BLOCKED

Why:

- no linked WhatsApp personal state in the personal channel database
- no live linked session available on this machine for gateway proof

### 2. Real Telegram personal account flow

Status: BLOCKED

Why:

- no linked Telegram personal state in the personal channel database
- rebuilt gateway startup currently crashes in Telegram runtime before scope is
  active

### 3. Gateway offline/reconnect recovery

Status: PROVEN LIVE

Why:

- real pairing succeeded
- real gateway websocket session established
- gateway was stopped and restarted
- second live session and hello/presence evidence recorded

### 4. Existing-session browser attach

Status: BLOCKED

Why:

- pre-rebuild `dist/` artifact was stale and routed browser requests incorrectly
- post-rebuild gateway crashes during Telegram startup before the browser route
  can be exercised on current code

## Final Phase 4 Verdict

Finish Phase 4 is RED on this machine.

Exact blockers:

1. no real linked WhatsApp personal session
2. no real linked Telegram personal session
3. rebuilt current gateway crashes during Telegram startup because state publish
   is attempted before gateway scope activation
4. browser attach cannot be certified on current rebuilt code until that startup
   regression is fixed

## Rerun After Blocker Fixes

After the targeted Telegram startup fix, I reran the live-cert flow on current
rebuilt code and found one additional runtime blocker in the browser worker
path, then fixed that too:

- Telegram startup regression fixed in
  `/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-gateway/src/channels/telegram/runtime.ts`
- Browser worker Python resolution fixed in
  `/Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-gateway/src/config.ts`

### Additional commands run

```bash
cd empyralis-gateway
npm run build
```

```bash
curl -sS -X POST \
  -H 'X-API-Key: restart' \
  -H 'Content-Type: application/json' \
  -d '{"workspace_id":"default","display_name":"Codex Live Cert Gateway 2","platform":"macos"}' \
  http://127.0.0.1:8001/api/gateway/pairings/intents
```

```bash
env \
  EMPYRALIS_GATEWAY_API_URL=http://127.0.0.1:8001/api \
  EMPYRALIS_GATEWAY_PAIRING_TOKEN='[redacted live token]' \
  EMPYRALIS_GATEWAY_STATE_DIR=/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/live-cert-gateway-2 \
  EMPYRALIS_SUPERVISOR_URL=http://127.0.0.1:7788 \
  EMPYRALIS_SUPERVISOR_SECRET="$(cat /Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/supervisor_secret)" \
  EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT=/Users/mansur/Multi_Agent_Orchestrator_Project \
  node /Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-gateway/dist/index.js
```

Then restarted the same gateway without re-pairing against the same persisted
state dir:

```bash
env \
  EMPYRALIS_GATEWAY_API_URL=http://127.0.0.1:8001/api \
  EMPYRALIS_GATEWAY_STATE_DIR=/Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/live-cert-gateway-2 \
  EMPYRALIS_SUPERVISOR_URL=http://127.0.0.1:7788 \
  EMPYRALIS_SUPERVISOR_SECRET="$(cat /Users/mansur/Multi_Agent_Orchestrator_Project/.orion-stack/supervisor_secret)" \
  EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT=/Users/mansur/Multi_Agent_Orchestrator_Project \
  node /Users/mansur/Multi_Agent_Orchestrator_Project/empyralis-gateway/dist/index.js
```

Browser attach route on the rebuilt live gateway:

```bash
curl -sS -X POST \
  -H 'X-API-Key: restart' \
  -H 'Content-Type: application/json' \
  -d '{"session_mode":"existing_session_attach","url":"https://example.com","run_id":"run-browser-cert-3","trace_id":"trace-browser-cert-3"}' \
  http://127.0.0.1:8001/api/gateway/registrations/gateway_26475797-62f4-4d23-8f7e-73fe2cf7a8de/browser/sessions
```

### Observed

- Current rebuilt gateway booted cleanly on live code.
- Telegram personal no longer crashes startup before websocket scope activation.
- Live gateway registration created:
  - `gateway_id`: `gateway_26475797-62f4-4d23-8f7e-73fe2cf7a8de`
  - `device_id`: `device_361efa42-de3e-4d78-8fa1-88da2eb31367`
  - initial session on this rerun: `gsess_2c94112dbb594fee8073f4be720dab97`
- Telegram personal state is now visible through the live gateway metadata as:
  - `status`: `authorization_required`
  - `login_hint`: `api_credentials_required`
- Restarting the same gateway against the same state dir produced a new live
  session in `.orion-stack/live-cert-gateway-2/checkpoints.json`:
  - resumed session: `gsess_f62a232daf3149849c239667d1c4e1c5`
  - same `gateway_id` reused
  - same `device_id` reused
- Browser attach route on the live gateway now returns governed attach state
  instead of crashing:

```json
{
  "status": "attach_required",
  "browser_session": {
    "status": "attach_required",
    "metadata": {
      "browser_session_mode": "existing_session_attach",
      "browser_attach_state": "attach_required"
    }
  }
}
```

- The live browser execution binding now resolves through the repo virtualenv
  instead of plain system `python3`:
  - `/Users/mansur/Multi_Agent_Orchestrator_Project/venv/bin/python3.14 -m server_modules.execution_router`

### Updated matrix status

#### 1. Real WhatsApp personal account flow

Status: BLOCKED

Why:

- `personal_channel_whatsapp_states` is still empty
- no live linked WhatsApp personal session exists on this machine for gateway
  proof

#### 2. Real Telegram personal account flow

Status: BLOCKED

Why:

- `personal_channel_telegram_states` is still empty
- startup is now fixed, but no live linked Telegram personal session exists on
  this machine for actual personal-account proof

#### 3. Gateway offline/reconnect recovery

Status: PROVEN LIVE

Why:

- current rebuilt gateway started successfully
- same persisted gateway state was reused
- reconnect produced a new live session on the same gateway/device identity

#### 4. Existing-session browser attach

Status: PROVEN LIVE

Why:

- the live gateway accepted `existing_session_attach`
- the route returned the governed `attach_required` state on current rebuilt
  code instead of crashing
- browser-session metadata preserved the attach contract and execution binding

## Updated Final Phase 4 Verdict

Finish Phase 4 remains RED on this machine, but the remaining blockers are now
purely live-account setup blockers:

1. no real linked WhatsApp personal session
2. no real linked Telegram personal session
