# Empyralis One File Blueprint

Single source of truth for Empyralis to operate like OpenClaw style one-app workflow, without breaking unrelated parts.

## Scope

- This file is the operating blueprint.
- Use this file as the only coordination doc for future agents.
- Do not scatter planning across multiple docs.

## Product Goal

Build Empyralis into a one-app agent platform where:

- Operator uses one terminal entrypoint.
- Telegram and terminal both route into the same runtime/session model.
- Replies are direct and clean (no noisy run metadata unless explicitly enabled).
- Setup is minimal by default, advanced config is separate.

## Architecture Draw (OpenClaw Style, Empyralis Mapping)

```text
Telegram / WhatsApp / Web UI
            |
            v
      [ Empyralis Runtime API ]  <-- single control plane (server.py)
            |
            +--> Channel autopilot (ingress/egress)
            |     - telegram poll + sender allowlist gate
            |     - run dispatch + concise reply
            |
            +--> Policy core (runtime_policy.py)
            |     - tool policy: allow / approval_required / blocked
            |     - trust mode + execution target resolution
            |
            +--> Run orchestration
            |     - queue + approvals + idempotency + history
            |
            +--> Local companion worker
                  - executes run safely
                  - returns final response
```

## No Endless Debug Contract

If chat fails, never free-debug randomly. Always run this exact chain:

1. Runtime + auth truth
```bash
curl -s -H "X-API-Key: replace-with-strong-key" http://127.0.0.1:8001/health | jq '{ok,auth_mode,openai_key_valid,openai_credential_source,errors,tool_policy}'
```

2. Channel truth
```bash
./bin/orion autopilot status
./bin/orion autopilot watch-line 2
```

3. Latest run root cause
```bash
RUNTIME_KEY='replace-with-strong-key' bash scripts/show_latest_run.sh
```

4. Tool policy truth (new endpoint)
```bash
curl -s -H "X-API-Key: replace-with-strong-key" -H "Content-Type: application/json" \
  -d '{"tool_ids":["send_message","execute_shell_command"],"trust_mode":"guarded","target":"local_companion"}' \
  http://127.0.0.1:8001/tools/policy/evaluate | jq
```

If one of these fails, fix only that layer before touching anything else.

## Execution Plan (Implemented)

1. Enforce tool policy at runtime execution points.
Status: done.
Files:
- `server.py` (`pack_prepare` precheck + connector write gates)
- `server_modules/runtime_policy.py`

2. Persist policy decisions in run audit/history.
Status: done.
Files:
- `server.py` (`tool_policy_audit`, `tool_policy_precheck`, history summaries)

3. Surface policy precheck before run start (TUI + web/runtime API).
Status: done.
Files:
- `server.py` (`POST /runs/precheck`, upgraded `POST /routing/preview`)
- `scripts/orion_terminal/clients/runtime.py`
- `scripts/orion_terminal/flows_run.py`
- `scripts/orion_terminal/tui/handlers/chat_actions.py`

4. Phase 3 memory contract (profile/project/session) with runtime traces.
Status: done.
Files:
- `server.py` (`/memory/health`, `/memory/search`, `/memory/upsert`, run-time memory read/write hooks, history/snapshot memory_trace)
- `server_modules/doctor_report.py` (memory runtime doctor checks)

## What To Keep

- Keep gateway-first runtime (`server.py` + `server_modules`).
- Keep local companion execution target support.
- Keep Codex auth mode as first-class.
- Keep existing channel connector vault model.

## What To Remove From Default UX

- Excess onboarding prompts in the default setup path.
- Repeated approval spam banners in live chat.
- Confusing "started request/run_id" acknowledgements in normal Telegram chat.

## OpenClaw Patterns To Mirror

1. One-app mode by default.
2. Split quick setup vs advanced configure.
3. Provider -> auth method grouped selection.
4. Gateway as single source for runs/sessions/events.
5. Thin channel adapters (ingress/egress only).
6. TUI as transcript/timeline, not a separate orchestration system.

## Current Known Facts (Verified)

- Telegram autopilot path is in `server_modules/autopilot_connectors.py`.
- The run ack text comes from `_telegram_poll_connector()` when `ORION_TELEGRAM_AUTOPILOT_SEND_ACK=1`.
- Run metadata in replies is controlled by `ORION_AUTOPILOT_INCLUDE_RUN_META`.
- Local fallback behavior exists when provider auth/scope fails.
- Missing OpenAI scope `api.responses.write` can cause failed/timeout behavior.

## One-App Contract (Target)

### Operator Contract

- `orion app` is the primary command.
- `orion app` ensures runtime is up and enters one-app TUI.
- Default engine for one-app mode is `codex`.

### Setup Contract

- `orion setup`: minimal quickstart only:
  - gateway location
  - provider/auth choice
  - one channel choice
  - run goal
- `orion configure`: all advanced settings only.

### Channel Contract

- Inbound text -> create run -> wait terminal status -> send concise final reply.
- No start-ack in normal mode.
- No run_id in final reply in normal mode.
- Optional verbose mode can re-enable metadata.

## Architecture Blueprint

### A) Runtime Layer

Files:

- `server.py`
- `server_modules/autopilot_connectors.py`
- `server_modules/runtime_policy.py`
- `server_modules/local_queue.py`

Responsibilities:

- Run lifecycle, routing, approvals, history.
- Channel autopilot polling and response delivery.
- Local companion claim/complete loop.

### B) CLI Layer

Files:

- `bin/orion`
- `scripts/orion_terminal_wizard.py`
- `scripts/orion_terminal/*`

Responsibilities:

- One-app entrypoint.
- Setup/configure/preflight flows.
- TUI rendering and command handling.

### C) Connector Layer

Files:

- `scripts/telegram_rebind_and_watch.sh`
- `scripts/telegram_updates_debug.sh`
- `scripts/setup_telegram_connector.sh`

Responsibilities:

- Bind connector credentials.
- Validate inbound handshake.
- Diagnose update polling and chat_id mismatch quickly.

## Build Plan (Do In Order)

### Phase 1: Lock One-App Default

1. Ensure `orion app` exists and is documented in CLI help/install output.
2. Keep clean TUI environment defaults inside `orion app`.
3. Do not require manual env unsets for normal use.

Acceptance:

- `orion --help` shows `orion app`.
- `orion app` launches TUI directly with codex engine default.

### Phase 2: Minimal Setup Only

1. Reduce `scripts/orion_terminal/flows_orion_setup.py` to strict quick path.
2. Move advanced model/credential prompts to configure flow only.
3. Keep "use existing codex session" path, but avoid extra credential branches in setup.

Acceptance:

- Setup path stays short and deterministic.
- Advanced provider details are only in configure.

### Phase 3: Telegram Behavior Cleanup

1. Default `ORION_TELEGRAM_AUTOPILOT_SEND_ACK=0`.
2. Default `ORION_AUTOPILOT_INCLUDE_RUN_META=0`.
3. Keep final response only, unless explicit debug/verbose mode.
4. Keep auto-approval behavior for autopilot where intended.

Acceptance:

- Telegram gets direct answer text, not start-ack spam.
- No run_id text by default.

### Phase 4: Reliability and Diagnostics

1. Keep handshake gate before saying "stack is up" for Telegram usability.
2. Fail fast with clear reason if no inbound updates.
3. Surface auth scope errors as friendly, actionable messages.
4. Keep autopilot status line concise and actionable.

Acceptance:

- When broken, operator sees exactly one clear fix path.
- No fake healthy state when channel cannot actually receive inbound.

### Phase 5: One-Command Operator Flow

1. Add `orion go` as the default no-debug startup command.
2. `orion go` must:
   - start stack
   - run health/autopilot/worker truth checks
   - print a single actionable summary
3. Optional `--watch` flag starts autopilot watch-line immediately.

Acceptance:

- Operator can recover from most issues using one command.
- No multiline command copy/paste mistakes needed for normal operation.

## Non-Break Rules

- Do not change frontend web UI in this track.
- Do not change cognitive daemon objective logic in this track.
- Do not change database schemas unless required by runtime errors.
- Keep patches focused to these files first:
  - `bin/orion`
  - `scripts/install_orion_cli.sh`
  - `scripts/orion_terminal/flows_orion_setup.py`
  - `scripts/orion_terminal/question_catalog.py`
  - `server_modules/autopilot_connectors.py`
  - `scripts/telegram_rebind_and_watch.sh`

## Test Checklist

Run after every patch set:

1. Shell syntax

```bash
bash -n bin/orion
bash -n scripts/install_orion_cli.sh
```

2. Runtime health

```bash
curl -s -H "X-API-Key: replace-with-strong-key" http://127.0.0.1:8001/health | jq
```

3. Autopilot status

```bash
./bin/orion autopilot status
./bin/orion autopilot watch-line 2
```

4. One-app launch

```bash
orion app
```

5. Telegram live probe

```bash
bash scripts/telegram_rebind_and_watch.sh
```

## Operator Commands (Stable)

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
bash scripts/install_orion_cli.sh
hash -r
orion app
```

If stack is down:

```bash
bash scripts/start_orion_local_stack.sh
```

If Telegram is not receiving inbound:

```bash
bash scripts/telegram_rebind_and_watch.sh
```

## Prompt For Other Agent (Copy/Paste)

Use this exact prompt with any helper agent:

```text
Work only from docs/ORION_ONE_FILE_BLUEPRINT.md.
Goal: enforce one-app Empyralis behavior with OpenClaw-style flow.
Rules:
1) Do not modify unrelated files.
2) Keep setup minimal; move advanced prompts to configure.
3) Keep Telegram replies concise (no start-ack/run_id by default).
4) Preserve gateway-first architecture and local companion route.
5) After edits, run shell/runtime/autopilot checks listed in the blueprint.
6) Report only: files changed, why, and acceptance check results.
```

## Definition Of Done

- Operator can run `orion app` and chat cleanly.
- Setup path is short and professional.
- Telegram responds with final answer text by default.
- Diagnostics clearly explain failures (auth scope, inbound handshake, worker offline).
- This file remains the single source for architecture and execution plan.
