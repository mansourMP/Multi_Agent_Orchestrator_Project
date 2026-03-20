# Empyralis Platform Single-File Research Handoff

Last updated: 2026-03-03
Project root: `/Users/mansur/Multi_Agent_Orchestrator_Project`

## 1) Purpose

This file is the single context package for external research agents (Anthropic, Codex, other models).

Goals:
- Avoid reading the whole repo.
- Provide a complete but compact system picture.
- Keep implementation, architecture, status, and roadmap in one place.

Rule:
- For research passes, use this file first.
- Only open source files when a specific section here points to them.

## 2) Current Platform Snapshot (Verified)

Operational status snapshot:
- Local stack: running (`runtime`, `backend`, `frontend`, `worker` all up).
- Readiness score: `9/10` (runtime, worker, AI auth, Telegram, Google Workspace are working).
- Telegram autopilot: active and processing updates.
- WhatsApp: not configured yet (optional right now).
- Latest run source: Telegram autopilot.
- Latest run provider: `codex_cli` (Codex path works).

Meaning:
- Core "chat with agent through Telegram" path is working.
- Web + runtime + local worker path is working.
- Email connector exists (Google Workspace; Gmail works, Calendar depends on Google scope).
- Main missing connector is WhatsApp/Twilio.

## 3) Product Identity

Working product name in repo history: Empyralis (original repo also contains AgentForge legacy docs/components).

Positioning:
- OpenClaw-inspired operations architecture.
- Empyralis-branded UX and defaults.
- "Set up once, then operate from Telegram + browser."

Brand tokens (approved direction):
- Primary: `#6D28D9` (deep violet)
- Secondary/highlight: `#8B5CF6` (cosmic purple)
- Warning/attention: `#F59E0B`

## 4) Architecture (High-Level)

```text
Telegram / WhatsApp / Browser / CLI
             |
             v
      Empyralis Runtime API (server.py)
             |
   +---------+-----------+------------------+
   |                     |                  |
Autopilot           Run orchestration   Policy & approvals
(channel I/O)       queue/history       trust_mode/tool policy
   |                     |                  |
   +----------- Local Companion Worker -----+
                         |
                    Model execution
                 (codex_cli / provider)
```

Core responsibilities:
- Runtime (`server.py` + `server_modules/*`): truth source for runs, approvals, memory, channel dispatch.
- Worker (`scripts/orion_local_worker.py`): executes queued work locally.
- Backend (`backend/`): API/control-plane services and UI data support.
- Frontend (`frontend/`): browser platform UX (dashboard/setup/control center).
- CLI (`bin/orion` + `scripts/orion_terminal/*`): setup, run, doctor, autopilot monitoring.

## 5) Main Surfaces and How Users Operate

Primary daily surfaces:
- Telegram bot chat (main conversational interface).
- Browser UI at `http://127.0.0.1:3000` (control center/workflows/settings).

Secondary/operator surfaces:
- `orion go --watch` for start + health + autopilot watch.
- `orion autopilot status` for channel status.
- `scripts/show_latest_run.sh --auto` for quick run diagnosis.

Product intent:
- Terminal should be optional after setup.
- Normal user flow should be Telegram + browser.

## 6) One-Command Operations Runbook

Start clean:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project && bash scripts/stop_orion_local_stack.sh && ORION_AUTH_MODE=codex ORION_DISABLE_OPENAI_API_KEY=1 RUNTIME_KEY='replace-with-strong-key' bash scripts/start_orion_local_stack.sh
```

Quick stable start + watch:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project && orion go --watch
```

Status checks:
```bash
cd /Users/mansur/Multi_Agent_Orchestrator_Project && bash scripts/status_orion_local_stack.sh
cd /Users/mansur/Multi_Agent_Orchestrator_Project && ./bin/orion autopilot status
cd /Users/mansur/Multi_Agent_Orchestrator_Project && RUNTIME_KEY='replace-with-strong-key' bash scripts/orion_environment_readiness.sh
cd /Users/mansur/Multi_Agent_Orchestrator_Project && RUNTIME_KEY='replace-with-strong-key' bash scripts/show_latest_run.sh --auto
```

Important shell rule:
- Keep commands single-line (line breaks caused many `scripts/: is a directory` and malformed key errors earlier).

## 7) Connector State

Telegram:
- Configured and active.
- Autopilot is processing messages and creating runs.

Google Workspace:
- Configured.
- Gmail actions valid.
- Calendar requires proper Google OAuth scope (`https://www.googleapis.com/auth/calendar`) to unlock calendar actions.

WhatsApp:
- Not configured yet.
- Requires Twilio setup (`Account SID`, auth token, WhatsApp sender).

## 8) Auth Model and Execution Path

Preferred mode:
- `ORION_AUTH_MODE=codex`
- `ORION_DISABLE_OPENAI_API_KEY=1`

Why:
- User wants Codex-first operation, not OpenAI API-key dependency.
- Recent successful runs show provider `codex_cli`.

Known auth failure mode encountered:
- `api.responses.write` missing scope caused fallback behavior earlier.
- Resolved by correct Codex login/session and stack restart in codex mode.

## 9) OpenClaw Parity: What Is Already Adopted

Adopted patterns:
- Gateway/runtime-first control plane.
- Quick setup + advanced configure split.
- Autopilot channels with continuous polling and status observability.
- Trust/policy gating with approval/blocked paths.
- One-command ops path (`orion go --watch` style).

Deliberate Empyralis differences:
- Empyralis brand and UI language.
- Broader web control center focus.
- Telegram menu behavior tuned for Empyralis workflow.

## 10) Known Pain Points (and Root Causes)

1) Stack appears "up" then offline
- Usually caused by process churn or mixed startup paths.
- Fix: use clean stop/start command above, then verify with status script.

2) Telegram rebind repeatedly asks for chat id
- Auto-detect may fail if Telegram inbound update is missing.
- Fix: send a real plain text message to the bot first, then rerun rebind.

3) Google connector repeated loop
- Token missing required Calendar scope.
- Gmail-only can work, Calendar remains disabled until scope granted.

4) Command parsing errors in zsh
- Split lines around `scripts/` or runtime key created invalid commands.
- Fix: one-line commands only.

## 11) Files That Matter Most (Read Order for Engineers)

1) Runtime core:
- `server.py`
- `server_modules/autopilot_connectors.py`
- `server_modules/runtime_policy.py`
- `server_modules/doctor_report.py`

2) Worker/runtime execution:
- `scripts/orion_local_worker.py`
- `scripts/run_local_worker.sh`

3) Ops and lifecycle:
- `scripts/start_orion_local_stack.sh`
- `scripts/stop_orion_local_stack.sh`
- `scripts/status_orion_local_stack.sh`
- `scripts/orion_go.sh`
- `scripts/orion_ops_daemon.py`

4) Frontend operating surfaces:
- `frontend/app/page.tsx`
- `frontend/app/page.api.ts`
- `frontend/components/orion/SetupWizard.tsx`
- `frontend/app/api/local-ops/route.ts`

5) Existing strategy docs:
- `docs/OPENCLAW_PARITY_BLUEPRINT.md`
- `docs/ORION_ONE_FILE_BLUEPRINT.md`

## 12) Current Gap List (Practical)

P0:
- Keep stack lifecycle stable across repeated starts.
- Prevent stale PID confusion and transient "up then down" operator experience.

P1:
- Complete WhatsApp connector flow and verification.
- Improve web-first setup so terminal is no longer required for normal users.

P2:
- Expand Telegram quick-intent UX (multi-step guided buttons, not only direct jump-to-AI).
- Tighten profile/memory quality loop for long-term assistant behavior.

## 13) Research Brief for External Agents

Ask external research agents to focus on:
- How to implement resilient local daemon/watchdog patterns for always-on developer stacks.
- OpenClaw-like onboarding simplicity without losing advanced power.
- Telegram UX patterns for "general AI assistant" that balance buttons + freeform chat.
- Web-only operational controls parity (everything doable in browser, minimal terminal dependence).
- Safe local file action model in browser-driven AGI systems (approval model, audit, rollback).

Expected output format from researchers:
- Architecture recommendation (1 page).
- Tradeoff table (simplicity vs power vs reliability).
- Concrete migration steps mapped to current Empyralis files.

## 14) Security Notes

- Do not commit raw secrets (tokens, API keys, OAuth access tokens).
- Keep runtime keys and connector secrets in local vault/state files only.
- Use policy gates (`guarded` trust mode) for high-impact actions.
- Require approvals for sensitive outbound actions where appropriate.

## 15) Definition of Success (Near-Term)

The platform is "operationally ready" when:
- Telegram chat is consistently responsive.
- Browser can control all daily operations without terminal.
- Readiness stays >= `9/10` with expected connectors.
- Latest runs consistently use intended provider path (`codex_cli`/configured cloud path), not unintended fallback.
- Failures produce single, actionable error messages (no endless debug loops).

