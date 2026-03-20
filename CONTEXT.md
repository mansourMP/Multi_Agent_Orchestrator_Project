# Empyralis Platform Context (Source of Truth)

## What We Are Building
Empyralis is an Agent OS: users describe outcomes, the runtime executes runs (often with local tools), and humans review approvals, runs, files, and connections. The public brand is “Empyralis”; “Orion” is the internal compatibility name (keep existing `orion_*` variables).

## What Already Exists
- Frontend: Next.js app in `frontend/` with “Home” (assistant-first) plus advanced surfaces (`/workspace`, Control Center).
- Backend/runtime: FastAPI in `server.py` with extracted modules in `server_modules/`.
- Desktop: Electron shell in `desktop/` that loads the local frontend and provides IPC helpers.
- Local worker: Python local-companion loop in `scripts/orion_local_worker*.py`.
- Integrations: Google Workspace (implemented + physically smoke-tested), Microsoft 365 (implemented but needs physical smoke test), Telegram/WhatsApp autopilot, local model/provider surfaces (OpenAI, Anthropic local CLI, Ollama, Gemini).
- Wave 1 UI polish completed on Connections/Outputs/Home and global CSS (reported build clean).

## Current Architecture
- Frontend entry: `frontend/app/layout.tsx` renders the shell (sidebar + top bar + assistant panel + main stage).
- Major pages: `frontend/app/page.tsx` (Home), `frontend/app/credentials/page.tsx` (Connections), `frontend/app/artifacts/page.tsx` (Outputs), `frontend/app/agents/page.tsx` (Agents / Single Agent Hub), `frontend/app/runs/[id]/inspect/page.tsx` (Run inspect).
- Core UI: `frontend/components/orion/workbench/*` and shell components in `frontend/components/`.
- Backend: `server.py` wires globals, config, and route registration; large logical blocks are progressively moved to `server_modules/`.
- Desktop: `desktop/main.js` launches and checks the stack, loads `http://127.0.0.1:3000`, and exposes IPC helpers (including Claude CLI auth).
- Startup scripts: `scripts/start_empyralis_local_stack.sh`, `scripts/stop_empyralis_local_stack.sh`, `scripts/run_empyralis_desktop.sh`.

## Important Files (Where Things Live)
- Backend main: `server.py` (now ~6,462 lines).
- Backend modules:
  - Runs API routes: `server_modules/runtime_runs_api.py`
  - Inbox/events API routes: `server_modules/runtime_events_api.py`
  - Agent workspace + artifacts API routes: `server_modules/agent_workspace_api.py`
  - Runtime memory subsystem: `server_modules/runtime_memory.py`
  - Runtime channel events storage/helpers: `server_modules/runtime_events.py`
  - Outcome packs execution: `server_modules/outcome_packs.py`
  - Vault crypto/storage: `server_modules/vault_store.py`, helpers in `server_modules/vault_helpers.py`
  - State DB store: `server_modules/runtime_state_store.py`
  - Connectors/autopilot: `server_modules/autopilot_connectors.py`
- Frontend shell/nav:
  - Sidebar: `frontend/components/Sidebar.tsx`
  - Top bar: `frontend/components/orion/PlatformTopBar.tsx`
  - Assistant panel: `frontend/components/orion/PlatformAssistantPanel.tsx`
  - Hard-navigation helper: `frontend/lib/safeNavigate.ts`
- Theme: `frontend/app/globals.css` (Indigo Velvet theme + shell layout).
- OpenClaw parity notes: `docs/OPENCLAW_PARITY_BLUEPRINT.md` (scan on 2026-03-15: pass=28 miss=2; parity scan not re-run after later fixes).

## Decisions Already Made
- Keep UI surfaces minimal and understandable (Perplexity-like); preserve sidebar and top bar.
- Split normal-user experience (Home) from advanced/admin surfaces (Workspace, Control Center).
- Connections/Outputs are browse-first with native file handling.
- Single-agent mode is the short-term product surface; multi-agent orchestration can exist backend-side but should be hidden/disabled by flag.
- Unified inbox timeline is the primary “what happened” surface across channels.

## What Is Currently Being Worked On
- Wave 2: Backend hardening by modularizing `server.py` into `server_modules/`.
- Extracted recently:
  - Outcome packs -> `server_modules/outcome_packs.py`
  - Runtime memory -> `server_modules/runtime_memory.py`
  - Channel events helpers -> `server_modules/runtime_events.py`
  - Run endpoints -> `server_modules/runtime_runs_api.py`
  - Inbox endpoints -> `server_modules/runtime_events_api.py`
  - Agent workspace + artifacts endpoints -> `server_modules/agent_workspace_api.py`
- Frontend: Single Agent Hub layout refactor (balanced two-column layout) and CSS module cleanup:
  - `frontend/app/agents/page.tsx`
  - `frontend/app/agents/page.module.css`
- Telegram UX: remove Telegram “menu buttons” (Work menu / Project menu / Skills / Context / Status / Approvals / Help) by default:
  - `server_modules/autopilot_connectors.py` now defaults `ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS` to off and uses `{"remove_keyboard": True}` when off.
- Navigation reliability workaround: Next app-router navigation was throwing `TypeError: Failed to fetch` in dev, so core UI navigation now uses hard navigation via `safeNavigate`:
  - `frontend/components/Sidebar.tsx`
  - `frontend/components/orion/PlatformTopBar.tsx`
  - `frontend/components/orion/PlatformAssistantPanel.tsx`
  - Some in-page navigation already switched (not all usage removed everywhere).

## What Is Broken or Unfinished
- Testing is blocked in this environment: `pytest` is not installed and pip cannot reach PyPI (network/DNS blocked). A local venv `.venv/` exists but cannot download packages.
- Microsoft 365 integration still needs a physical end-to-end smoke test with a real account.
- Desktop: Apple Silicon Electron crashes were mitigated by forcing software rendering (SwiftShader / Metal disabled), but desktop stability still needs real-world confirmation.
- Root-cause of Next app-router “Failed to fetch” is not fully diagnosed; hard-navigation is a workaround.

## Next Tasks to Continue Development
1. Finish backend modularization (remaining big route blocks in `server.py`: schedules/metrics/approvals/setup/onboarding etc) while keeping behavior identical.
2. Add a reliable test harness: either vendor/ship pytest wheels locally or enable network so pytest can install; then run terminal/runtime tests.
3. Smoke-test Microsoft 365 connector flows end-to-end.
4. Desktop stability pass on Apple Silicon: verify Electron flags, IPC, and single-window behavior in packaged/dev.
5. Design phase: continue polishing Home/Connections/Outputs/Run Inspect and unify spacing/typography while keeping minimal density.

## Rules the Agent Should Follow
- Treat this file as the source of truth for the current state.
- The repo may be dirty; do not revert unrelated changes.
- If behavior doesn’t match code, restart the local stack and desktop before debugging UI.
- Preserve the shell layout (sidebar/top bar) unless explicitly requested.
- Keep single-agent mode as the default product surface; hide/disable multi-agent controls when enabled.
- Prefer small, behavior-preserving refactors when modularizing backend code.
