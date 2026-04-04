# Empyralis x OpenClaw Blueprint (No Endless Debug)

This is the single source of truth for making Empyralis feel as professional as OpenClaw while keeping Empyralis's own identity.

## Product Principle

- Match OpenClaw reliability patterns.
- Keep Empyralis branding, UX language, and opinionated defaults.
- Optimize for "set once, then use Telegram/Web daily".

## North-Star UX

1. `orion` opens **Launcher** (control center), not raw chat.
2. Chat is explicit: `orion chat` or Telegram bot.
3. First-time setup is short; adaptive profile happens in chat over time.
4. User always has visible state: health, autopilot, worker, latest run.
5. Runtime degrades safely (approval gates, policy checks, fallback messaging).

## Current Baseline (Done)

- Telegram autopilot stable with connector state and watch-line.
- Codex auth path working (`provider: codex_cli` runs succeed).
- Telegram command routing improved:
  - `orion`, `home`, `commands`, `orion run ...`.
- Adaptive onboarding resume exists (continues from missing profile field).
- Telegram menu buttons + submenu routing exist.
- Brand tokens updated:
  - primary `#6D28D9`
  - highlight `#8B5CF6`
  - warning `#F59E0B`
- Release checks added:
  - `orion release-status`
  - `orion release-gate`

## Phase Plan

### Phase 1: Operational Hardening

- Keep runtime always verifiable with one command.
- Prevent "looks up but broken" states.

Acceptance:
- `orion release-status` reports `release_ready: true`.
- `orion release-gate 15` passes locally.

### Phase 2: Chat-First Product Flow

- Telegram becomes primary operator surface.
- Launcher only for setup/diagnostics.

Acceptance:
- Message -> run -> response path works repeatedly.
- `orion autopilot watch-line 2` shows processed/runs increasing without persistent errors.

### Phase 3: Memory + Profile Quality

- Guard against low-quality onboarding input.
- Keep profile evolving from real conversation, not one-time static form.

Acceptance:
- Garbage profile inputs trigger retry/clarification.
- Profile context improves response quality in later runs.

### Phase 4: Professional Web Surface

- Browser UI reflects runtime truth (health, channels, approvals, run logs).
- OpenClaw-like confidence, Empyralis visual identity.

Acceptance:
- Web UI and CLI show consistent run status and approvals.
- No hidden failures; all failure paths are user-visible.

## Safety/Policy Model (OpenClaw-Inspired)

- `trust_mode=guarded` default for cloud actions.
- Sensitive actions -> approval required.
- Critical actions -> blocked in cloud unless explicitly allowed.

Validation command:

```bash
curl -s -H "X-API-Key: replace-with-strong-key" \
  -H "Content-Type: application/json" \
  -d '{"tool_ids":["send_message","execute_shell_command"],"trust_mode":"guarded","target":"cloud"}' \
  http://127.0.0.1:8001/tools/policy/evaluate | jq
```

## Daily Runbook

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
orion go --watch
```

Then:

```bash
orion autopilot status
orion autopilot watch-line 2
RUNTIME_KEY='replace-with-strong-key' bash scripts/show_latest_run.sh --auto
```

If Telegram stops responding:

```bash
RUNTIME_KEY='replace-with-strong-key' bash scripts/telegram_rebind_and_watch.sh
```

## Definition of "Professional Enough"

All must be true:

- Runtime health green.
- Local worker connected.
- Telegram autopilot active and thread alive.
- Latest run provider is `codex_cli` or intended cloud provider (not fallback unexpectedly).
- Policy precheck behaves as configured (guarded approvals/blocking).
- Release gate passes.

## Strict Parity Checklist (Single Command)

Run:

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
RUNTIME_KEY='replace-with-strong-key' bash scripts/orion_strict_parity_check.sh --strict
```

Deep parity (includes heavy scanner/gates):

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
RUNTIME_KEY='replace-with-strong-key' bash scripts/orion_strict_parity_check.sh --strict --deep
```

Required pass criteria in strict mode:

1. Runtime reachable.
2. AI auth valid for current mode (Codex/API key).
3. Local worker online.
4. Telegram autopilot active, thread alive, connector present.
5. `orion_release_status --strict` passes.
6. Environment readiness is at least `9/10`.
7. Latest run exists and is not silent fallback.
8. Ops daemon healthy/watchdog healthy (or explicitly marked optional warning when daemon is disabled).

Execution order (no endless debug):

1. `orion go --watch`
2. `bash scripts/orion_strict_parity_check.sh --strict`
3. If fail: run only the specific fixer for failed check (`setup_telegram_connector`, `setup_google_workspace_connector`, restart stack, etc.)
4. Re-run strict check until `fail=0`.

## Next Concrete Build Items

1. Add Web "Control Center" card with:
   - release-ready flag
   - autopilot counters
   - last run provider/status
2. Add approval queue panel in web UI (approve/reject from browser).
3. Add "quick intents" pack for Telegram main menu (business, study, operations).
4. Add nightly self-check cron script with alert message to Telegram owner chat.

## Latest OpenClaw Scan Snapshot (2026-03-15)

Command run:

```bash
bash scripts/openclaw_parity_scan.sh
```

Result:
- `pass=28`
- `miss=2`

Current misses:
- `lean_line_budget --strict` failed
- `terminal unit tests` failed (3 tests)
  - `test_collect_chat_rows_hides_runtime_boilerplate_lines`
  - `test_collect_chat_rows_hides_telegram_command_card`
  - `test_stream_inbox_events_uses_stream_endpoint_and_parses_sse`

Follow-up:
- Targeted fixes applied; unit tests now pass. Full parity scan not re-run yet.

## OpenClaw Release Baseline (2026-03-14)

- Latest OpenClaw release tracked: `v2026.3.13-1` (GitHub release).

Quality details:
- `bash scripts/lean_line_budget.sh --strict`: pass
- `python3 -m unittest discover -s scripts/orion_terminal/tests -p 'test_*.py'`: pass (`117`, `skipped=2`)

## OpenClaw Operating Pattern (Confirmed)

Source docs and references used:
- `https://docs.openclaw.ai/start/wizard`
- `https://docs.openclaw.ai/start/wizard-cli-auth`
- `https://docs.openclaw.ai/control-ui`
- `https://docs.openclaw.ai/cli`

Observed behavior to mirror:
1. Gateway-first control plane (`gateway start` / control UI first).
2. Wizard setup split into clear sections (workspace, model/auth, channels, gateway, daemon, health/doctor, skills).
3. QuickStart for fast setup, advanced/configure for full control.
4. Channel-first operation after setup (Telegram/other channels as main daily interface).
5. Explicit health/status/approvals visibility in UI and CLI.

## Empyralis Parity Decision (No Endless Debug)

The setup flow was intentionally simplified to a lean quick path.
That creates a deliberate mismatch with strict parity checks expecting explicit section prompts.

Decision mode:
- Keep lean setup UX in Empyralis Setup.
- Keep full control in Empyralis Configure.
- Align tests and parity checks to this contract.

Implementation rule:
1. If a behavior changed by design, update snapshots/checks.
2. Do not re-introduce complexity only to satisfy old tests.
3. Keep one-command recovery paths (`orion go --watch`, `telegram_rebind_and_watch.sh`).

## Single-File Rule for This Project

This file is the working source of truth for OpenClaw parity work.

Rules for all agents:
1. Do not create new planning docs for parity.
2. Add updates only in this file under dated sections.
3. For every parity change, include:
   - command used
   - expected output
   - pass/miss impact
   - rollback note (if any)

## Update Log (2026-03-03, Web-First Ops)

Change:
- Added browser-local operations endpoint for no-terminal daily ops:
  - `POST /api/local-ops`
  - actions: `start_services`, `restart_services`, `readiness`, `release_status`, `telegram_rebind`
- Added Control Center buttons in Home UI:
  - Start Services
  - Restart Services
  - Readiness
  - Release Status
  - Rebind Telegram
- Added setup helper links and clearer connector hints in Setup Wizard:
  - Telegram BotFather
  - Twilio Console
  - Google OAuth Playground
  - chat_id and timezone examples

Files:
- `frontend/app/api/local-ops/route.ts`
- `frontend/app/page.api.ts`
- `frontend/app/page.tsx`
- `frontend/components/orion/SetupWizard.tsx`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/frontend
npx eslint app/page.tsx app/page.api.ts components/orion/SetupWizard.tsx app/api/local-ops/route.ts
```

Expected output:
- Control Center can run operational actions from browser.
- Telegram rebind can be completed from web when bot token + chat id are provided.
- No need to type setup helper commands in terminal for normal operator flow.

Pass/miss impact:
- OpenClaw parity scan status remains green (`pass=30 miss=0`) from prior step.
- This update is UX/ops surface expansion; parity scan script does not currently score these new web actions.

Rollback note:
- Remove route `frontend/app/api/local-ops/route.ts`.
- Remove added methods in `frontend/app/page.api.ts`.
- Remove Control Center ops buttons and report panel in `frontend/app/page.tsx`.
- Remove helper link/hint block in `frontend/components/orion/SetupWizard.tsx`.

## Update Log (2026-03-03, Ops Daemon First)

Change:
- Added local ops daemon control scripts:
  - `scripts/start_orion_ops_daemon.sh`
  - `scripts/stop_orion_ops_daemon.sh`
  - `scripts/status_orion_ops_daemon.sh`
- Updated web local-ops API to call daemon first, with direct route fallback only when daemon is unavailable.
- Updated stack lifecycle scripts:
  - `start_orion_local_stack.sh` now auto-starts ops daemon (default `START_OPS_DAEMON=1`) and prints daemon helpers.
  - `stop_orion_local_stack.sh` now stops ops daemon and clears port `8787`.
- Updated `orion go` quick command list to include daemon status command.

Files:
- `frontend/app/api/local-ops/route.ts`
- `scripts/start_orion_ops_daemon.sh`
- `scripts/stop_orion_ops_daemon.sh`
- `scripts/status_orion_ops_daemon.sh`
- `scripts/start_orion_local_stack.sh`
- `scripts/stop_orion_local_stack.sh`
- `scripts/orion_go.sh`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
bash -n scripts/start_orion_ops_daemon.sh scripts/stop_orion_ops_daemon.sh scripts/status_orion_ops_daemon.sh scripts/start_orion_local_stack.sh scripts/stop_orion_local_stack.sh scripts/orion_go.sh
cd frontend
npx eslint app/api/local-ops/route.ts
```

Expected output:
- Browser ops actions run through daemon when available (`transport=ops_daemon`).
- If daemon is not up, route auto-starts it; if still unavailable, route fallback remains available.
- `bash scripts/stop_orion_local_stack.sh` fully stops runtime/backend/frontend/worker/ops-daemon.

Pass/miss impact:
- No change to parity scan result; this is reliability and operability hardening.

Rollback note:
- Remove daemon scripts listed above.
- Remove daemon-start block in `scripts/start_orion_local_stack.sh`.
- Remove daemon-stop lines in `scripts/stop_orion_local_stack.sh`.
- Revert daemon-first logic from `frontend/app/api/local-ops/route.ts`.

## Update Log (2026-03-03, Daemon Hardening + Web Status + Launchd)

Change:
- Hardened ops daemon:
  - localhost-only by default (remote requires `ORION_OPS_DAEMON_ALLOW_REMOTE=1`)
  - Bearer auth only
  - strict JSON/content-length checks
  - action allowlist
  - redaction for sensitive keys in daemon responses
- Expanded web local-ops:
  - added actions `ops_daemon_status` and `ops_daemon_restart`
  - web route now redacts sensitive fields before returning payloads
  - transport hint is surfaced in web logs (`ops_daemon` vs fallback)
- Control Center UX:
  - daemon status badge (running/stopped)
  - buttons: `Daemon Status`, `Restart Daemon`
  - daemon status line with URL/transport/check time
- Added macOS launchd helpers:
  - `scripts/install_orion_ops_daemon_launchd.sh`
  - `scripts/status_orion_ops_daemon_launchd.sh`
  - `scripts/uninstall_orion_ops_daemon_launchd.sh`

Files:
- `scripts/orion_ops_daemon.py`
- `frontend/app/api/local-ops/route.ts`
- `frontend/app/page.api.ts`
- `frontend/app/page.tsx`
- `scripts/start_orion_local_stack.sh`
- `scripts/install_orion_ops_daemon_launchd.sh`
- `scripts/status_orion_ops_daemon_launchd.sh`
- `scripts/uninstall_orion_ops_daemon_launchd.sh`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile scripts/orion_ops_daemon.py
bash -n scripts/start_orion_local_stack.sh scripts/start_orion_ops_daemon.sh scripts/stop_orion_ops_daemon.sh scripts/status_orion_ops_daemon.sh scripts/install_orion_ops_daemon_launchd.sh scripts/status_orion_ops_daemon_launchd.sh scripts/uninstall_orion_ops_daemon_launchd.sh
cd frontend
npx eslint app/api/local-ops/route.ts app/page.api.ts app/page.tsx
```

Expected output:
- Browser shows daemon status and can restart daemon.
- Local ops prefer daemon transport and log transport source.
- Daemon is safer by default and stays local unless explicitly overridden.

Pass/miss impact:
- No parity scan regressions expected; this improves operational safety/reliability.

Rollback note:
- Revert files listed above to previous versions.
- Remove launchd scripts if not needed.

## Update Log (2026-03-03, Platform IA + Skills Surface)

Change:
- Added first-class browser `Skills` page with:
  - skill library (built-in + custom local skills),
  - skill binding defaults (assistant vs automation),
  - runtime `Computer Control Policy` visibility via `/health` cognitive policy,
  - real policy simulation via `/tools/policy/evaluate`.
- Updated sidebar information architecture labels:
  - `Workflows` -> `Automations`
  - `Connected Accounts` -> `Integrations`
  - `Playground` -> `Lab`
  - added top-level `Skills`.

Files:
- `frontend/app/skills/page.tsx`
- `frontend/components/Sidebar.tsx`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project/frontend
npx eslint app/skills/page.tsx components/Sidebar.tsx
```

Expected output:
- Browser nav shows `Automations`, `Skills`, `Integrations`, `Lab`.
- `Skills` page can load runtime tool contracts/policy and evaluate decisions in guarded/strict modes.
- Users can define custom skill cards and bind defaults without touching terminal.

Pass/miss impact:
- No API contract break; UI-only extension on top of existing runtime endpoints.

Rollback note:
- Remove `frontend/app/skills/page.tsx`.
- Revert `frontend/components/Sidebar.tsx` labels/menu entries.

## Update Log (2026-03-03, Runtime Skills Wiring Across Channels)

Change:
- Promoted skills from UI-only to runtime behavior:
  - Added runtime skill state store (`.orion_runtime_skills.json`) with API endpoints:
    - `GET /skills/state`
    - `PUT /skills/state`
  - Runtime now auto-injects active skill defaults into run metadata at `create_run(...)`, so the behavior applies to web runs and channel-triggered runs (Telegram/WhatsApp) consistently.
  - Local worker now consumes `metadata.skill_prompt_append` / `metadata.skill_bundle` and appends active skill directives into the system prompt before generation.
- Frontend Skills page now syncs custom skills + bindings to runtime on load/update (best-effort).
- Frontend run-start path (`page.api.ts`) now also includes active automation skills in metadata payloads for explicit traceability.

Files:
- `server.py`
- `scripts/orion_local_worker.py`
- `frontend/lib/skills.ts`
- `frontend/app/skills/page.tsx`
- `frontend/app/page.api.ts`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile server.py scripts/orion_local_worker.py
cd frontend
npx eslint app/skills/page.tsx components/Sidebar.tsx lib/skills.ts
```

Expected output:
- Skills selected in browser are persisted to runtime and reflected in `GET /skills/state`.
- New runs include injected `skill_scope`, `skill_bundle`, and `skill_prompt_append` when defaults are configured.
- Telegram/web runs both follow the same active skill directives without per-channel manual prompt edits.

Pass/miss impact:
- Channel parity improves: behavior no longer diverges between browser-triggered and Telegram-triggered runs for skill defaults.
- Existing lint debt in `frontend/app/page.api.ts` remains (pre-existing `no-explicit-any` errors), but this step does not add new architecture blockers.

Rollback note:
- Revert files listed above.

## Update Log (2026-03-04, Server Line-Budget Fix + Deep Parity Green)

Change:
- Reduced `server.py` below strict line budget by extracting runtime request models + validators into:
  - `server_modules/runtime_models.py`
- Wired `server.py` to import shared request models and configured validation context once:
  - memory text max limit
  - memory bucket normalizer
  - action id normalizer
  - provider catalog
  - connector catalog
- No endpoint contract changes; request validation behavior preserved.

Files:
- `server.py`
- `server_modules/runtime_models.py`
- `docs/OPENCLAW_PARITY_BLUEPRINT.md`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile server.py server_modules/runtime_models.py
bash scripts/lean_line_budget.sh --strict
bash scripts/openclaw_parity_scan.sh
RUNTIME_KEY='replace-with-strong-key' bash scripts/orion_strict_parity_check.sh --strict --deep
```

Expected output:
- `server.py` budget check passes (`<= 6500`).
- OpenClaw parity scan passes (`pass=30 miss=0`).
- strict+deep parity check passes (`fail=0`).

Pass/miss impact:
- Removes remaining deep parity blocker (`lean_line_budget --strict` failure).
- Makes parity gate fully green with the existing test suite.

Rollback note:
- Revert `server.py` and remove `server_modules/runtime_models.py`.

## Update Log (2026-03-04, WhatsApp Parity Slice)

Change:
- Fixed WhatsApp autopilot liveliness reporting bug:
  - `thread_alive` now reflects webhook listener active state (instead of always false).
- Enabled WhatsApp autopilot by default in local stack/runtime boot config:
  - runtime env default: `ORION_WHATSAPP_AUTOPILOT_ENABLED=1`
  - local stack default: `WHATSAPP_AUTOPILOT_ENABLED=1`
- Added local webhook probe tool:
  - `scripts/whatsapp_webhook_probe.sh`
  - simulates Twilio webhook payload, validates processing counters, and prints TwiML response.
- Improved WhatsApp connector setup flow:
  - `scripts/setup_whatsapp_connector.sh` now:
    - normalizes runtime key
    - surfaces autopilot enabled/disabled state
    - prints exact enable command when disabled
    - optionally runs local webhook probe immediately after setup
- Tightened strict parity gate behavior for WhatsApp:
  - if WhatsApp connector exists, strict parity now requires WhatsApp autopilot active/lively.
  - if connector does not exist, script reports optional warning (not failure).

Files:
- `server_modules/autopilot_connectors.py`
- `server.py`
- `scripts/start_orion_local_stack.sh`
- `scripts/setup_whatsapp_connector.sh`
- `scripts/whatsapp_webhook_probe.sh`
- `scripts/orion_strict_parity_check.sh`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile server.py server_modules/autopilot_connectors.py
bash -n scripts/whatsapp_webhook_probe.sh scripts/setup_whatsapp_connector.sh scripts/orion_strict_parity_check.sh scripts/start_orion_local_stack.sh
RUNTIME_KEY='replace-with-strong-key' bash scripts/orion_strict_parity_check.sh --strict
RUNTIME_KEY='replace-with-strong-key' bash scripts/orion_strict_parity_check.sh --strict --deep
```

Expected output:
- WhatsApp status endpoint reports truthful `thread_alive` when active.
- strict parity check remains green without WhatsApp connector and becomes strict once connector is configured.
- setup flow gives direct webhook probe path with no manual guesswork.

Pass/miss impact:
- strict parity gate: `pass=10 fail=0 warn=1` (warn=no WhatsApp connector configured).
- strict+deep parity gate: `pass=12 fail=0 warn=1`.

Rollback note:
- Revert files listed above and remove `scripts/whatsapp_webhook_probe.sh`.

## Update Log (2026-03-04, Strict Parity Gate Script)

Change:
- Added single-command strict parity checker:
  - `scripts/orion_strict_parity_check.sh`
- Script validates operational parity gates in one run:
  - runtime/auth/worker
  - telegram autopilot state
  - release strict gate
  - environment readiness threshold
  - latest run presence/provider sanity
  - ops daemon watchdog health
- Added optional deep checks:
  - `openclaw_parity_scan.sh`
  - `orion_release_gate.sh`

Files:
- `scripts/orion_strict_parity_check.sh`
- `docs/OPENCLAW_PARITY_BLUEPRINT.md`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
bash -n scripts/orion_strict_parity_check.sh
RUNTIME_KEY='replace-with-strong-key' bash scripts/orion_strict_parity_check.sh
RUNTIME_KEY='replace-with-strong-key' bash scripts/orion_strict_parity_check.sh --deep
```

Expected output:
- Clear checklist lines:
  - `[PASS] ...`
  - `[FAIL] ...`
  - `[WARN] ...`
- Summary:
  - `summary: pass=X fail=Y warn=Z`
- In strict mode:
  - non-zero exit when any required check fails.

Pass/miss impact:
- Reduces random debugging by forcing a fixed parity gate sequence.
- Makes “are we as stable as OpenClaw behavior?” answerable with one command.
- Current baseline from deep run:
  - strict parity gate summary: `pass=11 fail=1 warn=0`
  - failing deep sub-check: `openclaw_parity_scan`
  - root cause: `lean_line_budget --strict` miss (`server.py` line-budget overflow)

Rollback note:
- Remove `scripts/orion_strict_parity_check.sh`.
- Remove this update section and strict checklist section from this blueprint.
- Remove `.orion_runtime_skills.json` if present.

## Update Log (2026-03-03, Telegram Skill Menus Like Clawbot)

Change:
- Added multi-step Telegram keyboard flow with `Skills` submenu:
  - main menu now includes `Skills`
  - new menu action: `menu_skills`
  - skill buttons map to skill-scoped runs
- Added skill command routing:
  - `skills` / `menu skills` opens skill menu
  - `skill <id|name>` triggers run using that skill
  - tapping `Skill: <title>` buttons triggers same behavior
- Added skill override propagation for Telegram-triggered runs:
  - `_create_telegram_run(..., skill_override=...)` now writes:
    - `metadata.skill_scope`
    - `metadata.skill_bundle`
    - `metadata.skill_prompt_append`
  - keeps behavior aligned with runtime skill wiring already added in `create_run(...)`.

Files:
- `server_modules/autopilot_connectors.py`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile server_modules/autopilot_connectors.py
python3 -m py_compile server.py scripts/orion_local_worker.py
```

Expected output:
- Telegram users can navigate `Main -> Skills -> Skill button` without typing long commands.
- Each skill button launches a run with explicit skill metadata so responses follow selected skill intent/guardrails.
- Prefix mode still works (`/orion skill <id>`, `/orion menu skills`).

Pass/miss impact:
- Improves Clawbot parity for chat UX by making navigation button-first, not command-only.
- Keeps terminal optional; channel UX becomes the primary interaction layer.

Rollback note:
- Revert `server_modules/autopilot_connectors.py`.

## Update Log (2026-03-03, Fail-Closed Runtime Auth Default)

Change:
- Implemented OpenClaw-style fail-closed auth behavior in runtime:
  - `ORION_AUTH_REQUIRED` now defaults to enabled when unset.
  - Added explicit insecure override flag for local debugging only:
    - `ORION_DEV_INSECURE_NO_AUTH=1`
  - Hardened request auth dependency:
    - if auth is enabled, API key must be configured
    - missing/invalid API key now consistently returns 401/503
- Added visibility in health/status payloads:
  - `auth_insecure_dev_override`

Files:
- `server.py`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile server.py
```

Expected output:
- Runtime is secure-by-default even when launched outside helper scripts.
- Development can still explicitly bypass auth with `ORION_DEV_INSECURE_NO_AUTH=1`.
- `/health` and status surfaces show whether insecure dev override is active.

Pass/miss impact:
- Improves parity with OpenClaw gateway security posture (fail-closed default).
- Reduces accidental insecure runtime starts during ad-hoc local execution.

Rollback note:
- Revert `server.py` changes in auth config and `require_api_key`.

## Update Log (2026-03-04, SQLite Runtime State Store for History/Events)

Change:
- Added SQLite-backed runtime state store module:
  - `server_modules/runtime_state_store.py`
  - tables:
    - `run_history`
    - `channel_events`
- Runtime now initializes DB on boot:
  - `init_runtime_state_db(ORION_RUNTIME_STATE_DB)`
- `RUN_HISTORY` and `CHANNEL_EVENTS` persistence now writes to SQLite first, with JSON compatibility fallback retained:
  - run history:
    - `upsert_run_history_item(...)`
    - `replace_run_history(...)`
    - `list_run_history(...)`
  - channel events:
    - `append_channel_event(...)`
    - `replace_channel_events(...)`
    - `list_channel_events(...)`
- Added runtime health metadata:
  - `runtime_state_db`

Files:
- `server_modules/runtime_state_store.py`
- `server.py`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile server.py server_modules/runtime_state_store.py
sqlite3 .orion_runtime_state.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1;"
sqlite3 .orion_runtime_state.db "SELECT 'run_history', count(*) FROM run_history UNION ALL SELECT 'channel_events', count(*) FROM channel_events;"
```

Expected output:
- Runtime state DB exists (`.orion_runtime_state.db`) with `run_history` and `channel_events`.
- History/event data survives process restarts via SQLite-backed load path.
- Existing JSON artifacts remain for compatibility during migration.

Pass/miss impact:
- Major reliability parity improvement: state persistence no longer depends only on in-memory + JSON source-of-truth.
- Sets foundation for full DB-backed state migration (schedules/profiles/idempotency next).

Rollback note:
- Revert `server.py` runtime state store wiring.
- Remove `server_modules/runtime_state_store.py`.
- Delete `.orion_runtime_state.db` if rollback is complete.

## Update Log (2026-03-04, Vault Crypto Hardening with Legacy Compatibility)

Change:
- Replaced vault encryption default from OpenSSL-subprocess-only format to versioned runtime format:
  - prefix: `orion.v2:`
  - algorithm: `Fernet + PBKDF2-SHA256` with policy-bounded iterations
- Added backward-compatible decrypt path for existing legacy OpenSSL vault records.
- Added controlled fallback toggle for legacy OpenSSL encrypt when cryptography backend is unavailable:
  - `ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK=1` (default on for migration safety)
- Added runtime observability fields in `/health` + doctor config:
  - `vault_cipher_prefix`
  - `vault_kdf_iterations`
  - `vault_legacy_openssl_decrypt`
  - `vault_legacy_openssl_encrypt_fallback`
- Added dependency declarations for runtime/worker environments:
  - `cryptography>=42.0.0`

Files:
- `server.py`
- `requirements.txt`
- `requirements-worker.txt`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile server.py
python3 -m py_compile server_modules/runtime_state_store.py
```

Expected output:
- New vault entries are saved in `orion.v2` format.
- Existing pre-migration vault entries still decrypt successfully.
- Health/doctor endpoints expose vault crypto mode and fallback flags.

Pass/miss impact:
- Security parity improves by moving primary vault crypto into runtime code path (no hard dependency on external `openssl` binary for new records).
- Migration risk reduced by keeping legacy decrypt and guarded legacy encrypt fallback.

Rollback note:
- Revert `server.py` vault crypto helper changes.
- Revert dependency updates in `requirements.txt` and `requirements-worker.txt`.

## Update Log (2026-03-04, Ops Daemon Auto-Recovery + Visibility)

Change:
- Added daemon watchdog loop for day-to-day self-healing:
  - probes runtime + local worker + telegram autopilot health
  - tracks consecutive failures
  - auto-runs stack recovery when threshold is reached
  - throttles recovery with cooldown and per-hour cap to prevent restart storms
- Added watchdog telemetry to daemon `/health` and `ops_daemon_status` payloads:
  - healthy, consecutive failures, recovery counters, last recovery, last unhealthy reason
- Hardened daemon recovery path:
  - recovery start uses:
    - `START_FRONTEND=0`
    - `START_OPS_DAEMON=0`
    - `ORION_OPENCLAW_GATEWAY_POLICY=ignore`
  - avoids daemon recursion and avoids browser disruption during backend/runtime recovery
- Added status visibility in operator surfaces:
  - `scripts/status_orion_ops_daemon.sh` now prints watchdog status lines
  - `scripts/orion_go.sh` now prints daemon watchdog snapshot in quick checks
  - web Control Center now shows watchdog status/failure/recovery metrics
- Fixed daemon status reliability:
  - stack startup no longer clears `ops-daemon.pid`
  - daemon status script treats health-reachable daemon as running even if PID file is stale

Files:
- `scripts/orion_ops_daemon.py`
- `scripts/status_orion_ops_daemon.sh`
- `scripts/orion_go.sh`
- `scripts/start_orion_local_stack.sh`
- `frontend/app/api/local-ops/route.ts`
- `frontend/app/page.api.ts`
- `frontend/app/page.tsx`

Commands used:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project
python3 -m py_compile scripts/orion_ops_daemon.py
bash scripts/start_orion_ops_daemon.sh
bash scripts/status_orion_ops_daemon.sh
RUNTIME_KEY='replace-with-strong-key' bash scripts/start_orion_local_stack.sh
```

Expected output:
- `status_orion_ops_daemon.sh` prints:
  - `watchdog: enabled=... healthy=... fails=... recoveries_total=...`
- `orion go --watch` includes `ops_daemon:` watchdog line in checks.
- Web Control Center daemon status includes watchdog metrics.
- When runtime/worker/autopilot become unhealthy for threshold polls, daemon attempts automatic recovery with backoff.

Pass/miss impact:
- Improves OpenClaw-style operational reliability:
  - less terminal babysitting
  - explicit self-healing + explicit status.

Rollback note:
- Revert files listed above.
