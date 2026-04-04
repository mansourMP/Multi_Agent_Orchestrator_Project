# OpenClaw Parity Minimal (Empyralis)

This is the fastest, lowest-risk path to make Empyralis behave like a stable OpenClaw-style system without rewriting everything.

## Goal

Make channel behavior deterministic, execution policy explicit, and failures diagnosable.

## Already Implemented

1. Telegram sender allowlist gate (`allow_from`) in runtime autopilot.
2. Sender-drop observability (`dropped_sender_count`, drop metadata) in autopilot status.
3. Telegram connector setup/rebind scripts now support `allow_from` metadata and better defaults.

Primary Empyralis files:

- `server_modules/autopilot_connectors.py`
- `scripts/setup_telegram_connector.sh`
- `scripts/telegram_rebind_and_watch.sh`

## OpenClaw Sources To Mirror

1. Telegram sender policy and allowlist:
   - `reference/openclaw/openclaw-src/src/channels/telegram/allow-from.ts`
   - `reference/openclaw/openclaw-src/docs/channels/telegram.md`
2. Group policy:
   - `reference/openclaw/openclaw-src/src/config/group-policy.ts`
   - `reference/openclaw/openclaw-src/docs/channels/groups.md`
3. Tool policy:
   - `reference/openclaw/openclaw-src/src/agents/tool-policy.ts`
   - `reference/openclaw/openclaw-src/docs/gateway/sandbox-vs-tool-policy-vs-elevated.md`
4. Memory subsystem:
   - `reference/openclaw/openclaw-src/src/memory/index.ts`
   - `reference/openclaw/openclaw-src/src/memory/sqlite.ts`
5. Security audit:
   - `reference/openclaw/openclaw-src/src/security/audit.ts`

## Minimal Parity Plan (Execution Order)

### Phase 1: Channel Policy (Done + finalize)

1. Keep `allow_from` fail-closed per connector.
2. Keep `ALLOW_ANY_CHAT=0` as default for production script paths.
3. Add one explicit status line in UI/CLI showing sender policy mode (`open` vs `allowlist`).

Acceptance:

- Unauthorized sender messages are dropped and counted.
- `GET /channels/telegram/autopilot/status` exposes drop counters and last dropped sender.

### Phase 2: Tool Policy Gate (Next)

1. Add explicit tool allow/deny policy map in runtime path before tool execution.
2. Default to deny dangerous tools and require approval for medium-risk actions.
3. Expose policy snapshot in `/health` and preflight output.
4. Add a deterministic policy diagnostics endpoint: `POST /tools/policy/evaluate`.

Target Empyralis files:

- `server_modules/runtime_policy.py`
- `server.py`

Acceptance:

- Forbidden tools fail with clear policy reason.
- Allowed tools execute and are auditable.
- Policy decisions can be inspected before execution from one API call.

### Phase 3: Memory Contract (Next)

1. Define one memory contract (source, scope, retention).
2. Keep memory ingestion structured (`profile`, `project`, `session` buckets).
3. Add deterministic read path used by run planner.

Target Empyralis files:

- `python_engine/memory_manager.py`
- `python_engine/cognitive_loop.py`
- `server.py`

Acceptance:

- Repeated user asks produce context-aware answers from persisted memory.
- Memory read/write paths are visible in run metadata.

### Phase 4: Audit + Doctor (Next)

1. Add a compact runtime audit report:
   - channel policy
   - tool policy
   - memory health
   - auth mode
2. Keep one command that returns pass/fail with reasons.

Target Empyralis files:

- `server.py`
- `scripts/orion_environment_readiness.sh`
- `scripts/orion_terminal_wizard.sh`

Acceptance:

- One command shows exact blockers without manual log diving.

## Non-Negotiable Defaults

1. Never run with wildcard sender policy in production (`allow_any_chat=0`).
2. Never run with unrestricted shell tool execution.
3. Never hide auth failures behind local fallback without explicit warning.
4. Always store machine-readable error category/source in autopilot state.

## Operator Runbook (No Research)

1. Rebind Telegram safely:

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project && RUNTIME_KEY='replace-with-strong-key' bash scripts/telegram_rebind_and_watch.sh
```

2. Check status:

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project && curl -s -H "X-API-Key: replace-with-strong-key" "http://127.0.0.1:8001/channels/telegram/autopilot/status" | jq
```

3. Check latest run root cause:

```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project && RUNTIME_KEY='replace-with-strong-key' bash scripts/show_latest_run.sh
```

## Definition Of Done (Minimal)

1. Telegram channel: deterministic access control and stable run replies.
2. Tool policy: explicit deny/approve/allow pipeline.
3. Memory: persistent and queryable in run planning.
4. Doctor/audit: one command explains failures immediately.
