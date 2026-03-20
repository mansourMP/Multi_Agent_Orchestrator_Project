# Empyralis Platform — Full System Report (Everything So Far)

Date: 2026-01-23
Owner: Mansur
Project: Multi_Agent_Orchestrator_Project

---

## 29) Product Contract V1 + Language Cleanup Kickoff (2026-02-25)

### Scope completed
Started execution of the strategic shift away from org-role framing toward a single Outcome Worker model.

### Files updated
- `docs/ORION_PRODUCT_CONTRACT_V1.md` (new)
- `frontend/components/Sidebar.tsx`

### What changed
1. Added a locked V1 product contract:
   - one-worker default UX
   - three-pack scope
   - language and safety rules
   - PMF metrics targets
2. Updated sidebar user-facing labels to reduce role/enterprise framing:
   - `Home` -> `Worker Home`
   - simple nav `Autopilot` -> `Start`
   - `Automation Lab` -> `Playground`
   - `Pro Mode` label -> `Advanced Tools`

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint components/Sidebar.tsx` -> PASS

## 28) Design Hardening — Mom Mode V2 (2026-02-25)

### Scope completed
Refined the default Autopilot homepage visual system and information hierarchy to feel more premium and less technical.

### File updated
- `frontend/app/page.tsx`

### What changed
1. Introduced a single neutral premium palette (`UI`) with charcoal surfaces and terracotta accent (no neon blue/green).
2. Reworked top shell styling:
   - stronger card shell
   - cleaner header language
   - advanced link styling aligned to the new palette
3. Improved setup UX presentation:
   - setup progress chips (`System`, `Account`, `Connection`)
   - plain-language step labels
   - consistent button/input borders and backgrounds
4. Reframed right panel from raw logs to clearer execution framing:
   - title changed to `Execution & Results`
   - result card now emphasizes:
     - `What Empyralis did`
     - `Next steps`
   - action buttons (`Copy summary`, `Export JSON`, `Create follow-up`) restyled for consistency
5. Updated status colors and badge semantics to match the same palette.
6. Updated simplicity footer copy and visual style.

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx` -> PASS

## 27) Autopilot Outcome Packs + One-Click UX Hardening (2026-02-25)

### Scope completed
Implemented the next Empyralis Autopilot product pass across runtime + default frontend:
1. Two additional deterministic outcome packs
2. One-click run hardening and clearer startup/stream error handling
3. Result actions for non-technical users
4. Updated quickstart docs for reliable local startup

### Backend changes (`server.py`)
- Added new pack IDs and support registry:
  - `weekly-content-studio`
  - `competitor-brief-digest`
- Added `PACK_PHASES` to provide consistent 3-phase progress logs per pack.
- Implemented deterministic pack executors:
  - `execute_weekly_content_pack(...)`
  - `execute_competitor_brief_pack(...)`
- Added unified dispatcher:
  - `execute_outcome_pack(pack_id, context)`
- Updated runtime execution flow:
  - `run_orion_mission(...)` now executes all supported outcome packs through one path.
  - Retains HITL approval guard using `outbound_actions` when trust mode is not `auto`.
- Hardened run start validation:
  - `POST /runs/start` now rejects unknown `metadata.outcome_pack` with HTTP 400.

### Frontend changes (`frontend/app/page.tsx`)
- Expanded outcome packs from 1 -> 3:
  - Customer Ops Autopilot
  - Weekly Content Studio
  - Competitor Brief Digest
- Added pack selector and pack-specific input labels/placeholders.
- Improved one-click run UX:
  - `isStarting` state
  - clearer button state (`Starting run...`)
  - safer stream disconnect handling (syncs run snapshot from `/runs/{id}`)
  - improved API error extraction from JSON `detail` payloads
- Added result actions in Live activity panel:
  - `Copy summary`
  - `Export JSON`
  - `Create follow-up`
- Extended result rendering for each new pack type.

### Docs updates
- Added:
  - `docs/QUICKSTART_ORION_AUTOPILOT.md`
- Updated:
  - `README.md` with direct link to the Empyralis quickstart.

### Validation
- `python3 -m py_compile server.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx` -> PASS

## 31) Autopilot Layout Tightening — Responsive Fit Pass (2026-02-25)

### Goal
Fix oversized layout behavior and keep all UI content within viewport bounds across desktop/tablet/mobile.

### Completed
- `frontend/app/page.tsx`
  - Added viewport-aware responsiveness with runtime breakpoints:
    - `isNarrow` (<1180)
    - `isTablet` (<980)
    - `isMobile` (<760)
  - Hardened outer shell:
    - dynamic padding by breakpoint
    - `width: 100%`
    - `boxSizing: border-box`
    - `overflowX: hidden`
  - Made page sections adaptive:
    - KPI strip: 4 -> 2 -> 1 columns
    - main two-column layout collapses to single column on narrow screens
    - left/right panels set `minWidth: 0` to prevent overflow
  - Improved mobile stacking/wrapping:
    - header actions stack on small screens
    - setup rows and next-step CTA stack cleanly
    - button groups wrap instead of overflowing
    - multi-input grids collapse to one column on tablet/mobile
  - Result panel improvements:
    - action buttons wrap
    - `runId` and next-step text can break lines
    - log drawer height scales by breakpoint (280/340/430)
  - Footer helper card stacks on mobile.

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx` -> PASS
- `python3 -m py_compile server.py` -> PASS

## 34) Ultra-Simple Mode Pass (One Command + One Controls Button) (2026-02-25)

### Goal
Reduce main-screen cognitive load even further:
- no multi-button control clusters
- no heavy setup/forms visible by default

### Completed
- `frontend/app/page.tsx`
  - Primary surface now uses:
    - one command input
    - one run/open-setup button
    - one `Controls` button
    - inline pack selector
  - Main heavy workspace panel is hidden by default (`showBuilderWorkspace=false`) so users are not forced through complex forms.
  - Control access moved into one right drawer with tabs:
    - Setup
    - Details
    - Metrics
    - Logs
  - Added trust mode selector inside `Details` drawer (keeps safety, avoids clutter on main surface).
  - Run button behavior simplified:
    - if setup is incomplete, it opens Setup drawer with clear message
    - if setup is ready, it runs immediately

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx` -> PASS
- `python3 -m py_compile server.py` -> PASS

## 33) Command Bar + Drawer UX (OpenClaw-style Layering, without product cloning) (2026-02-25)

### Goal
Adopt a lighter, command-first workflow with detail layers in drawers so the default screen is simpler for non-technical users.

### Completed
- `frontend/app/page.tsx`
  - Added top command bar:
    - single-line command input bound to `goal`
    - Enter-to-run behavior
    - primary `Run` action inline
  - Added compact control row from command bar:
    - `Setup`
    - `Details`
    - `Metrics`
    - `Logs`
  - Added right-side drawer system (`drawerPanel`):
    - `setup` drawer (step status + quick actions)
    - `details` drawer (pack selector + structured inputs)
    - `metrics` drawer (runtime KPI cards)
    - `logs` drawer (streamed activity list)
  - Added drawer accessibility/behavior:
    - click outside to close
    - `Esc` key to close
  - Kept Empyralis-specific logic intact:
    - outcome packs
    - trust modes
    - runtime APIs
    - execution summary flow

### Why this is the correct move
- Copies the good interaction pattern (command-first + progressive disclosure), not the product identity.
- Preserves Empyralis’s differentiator: outcome-pack + safety model, while reducing UI overload.

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx` -> PASS
- `python3 -m py_compile server.py` -> PASS

## 32) Command-First Simplification (OpenClaw-style Interaction Pass) (2026-02-25)

### Goal
Reduce UI complexity and make default workflow command-first, with optional details only when needed.

### Completed
- `frontend/app/page.tsx`
  - Defaulted optional panels to closed:
    - setup wizard now starts collapsed
    - pack input details start collapsed
    - live logs start collapsed
    - KPI strip starts collapsed behind a toggle
  - Added toggles:
    - `Show/Hide metrics`
    - `Show/Hide details` (pack inputs)
    - `Show/Hide logs`
  - Preserved user preferences in local storage:
    - `showSetupWizard`
    - `showPackInputs`
    - `showKpis`
  - Auto-opens logs during active/problem states:
    - running
    - waiting for approval
    - error
  - Kept run flow unchanged:
    - same packs
    - same trust modes
    - same runtime endpoints

### Result
- The page now behaves like a simple command console first:
  - goal + pack + run are primary
  - setup/metrics/logs/details are secondary on demand

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx` -> PASS
- `python3 -m py_compile server.py` -> PASS

### Notes
- Runtime import-level smoke execution was not run in this shell due missing `fastapi` in the current Python toolchain, but static compile and frontend checks passed.

## 21) Week 1 Runtime Hardening + KPI Hooks (2026-02-24)

### Scope completed
Implemented Week 1 backend hardening tasks in `server.py`:
1. Auth baseline improvements
2. Runtime KPI instrumentation
3. Better run status semantics for timeout and HITL waits

### Backend changes (`server.py`)

#### Auth baseline
- Added `CREW_AUTH_REQUIRED` env flag.
- `require_api_key(...)` now supports:
  - `X-API-Key`
  - `Authorization: Bearer <key>`
  - query `?api_key=...` (existing compatibility)
- Added fail-fast behavior:
  - If `CREW_AUTH_REQUIRED=1` and no `CREW_API_KEY` is configured, API returns `503`.

#### KPI instrumentation
- Added in-memory runtime metrics with lock protection:
  - runs started/completed/failed/timeout
  - average run duration
  - average time-to-first-value
  - average human-in-the-loop wait time
- Added run-level timing fields:
  - `duration_ms`
  - `time_to_first_value_ms`
  - `_hitl_wait_total_ms`
- Added metrics endpoints:
  - `GET /metrics`
  - `GET /kpis` (alias)

#### Run lifecycle correctness
- `set_run_status(...)` now tracks:
  - HITL waiting windows (`waiting_for_input`)
  - final duration on terminal states
  - terminal counts (`completed`, `failed`, `timeout`)
- Fixed crew timeout handling:
  - timeout now sets explicit run status `timeout`.
- SSE iterator now terminates on `timeout` status and records first value timing on first log packet.
- `GET /runs/{run_id}` now returns timing fields.

#### Health endpoint visibility
- `/health` now includes:
  - `auth_required`
  - `crew_api_key_configured`
  - timeout/retry/backoff runtime settings

### Validation
- `python3 -m py_compile server.py main.py` -> PASS

### Notes
- Could not run FastAPI runtime integration tests in this shell due missing local `fastapi` import for the current Python executable.
- Syntax/compile checks passed; runtime can be verified by launching `uvicorn` and hitting `/health` + `/metrics`.

---

## 22) OpenClaw Reference Analysis + Adoption Track (2026-02-24)

### Research completed
- Scanned local OpenClaw runtime directories:
  - `/Users/mansur/.openclaw`
  - `/Users/mansur/.openclaw/workspace/.openclaw`
- Cloned official source for reference study:
  - `reference/openclaw/openclaw-src`
- Confirmed license status:
  - MIT (`reference/openclaw/openclaw-src/LICENSE`)

### What was implemented
- Added runtime diagnostics endpoint:
  - `GET /doctor` in `server.py`
  - Includes pass/warn/fail checks with remediation suggestions for:
    - OpenAI connectivity
    - crew validation
    - auth policy
    - CORS safety
    - timeout/retry policy
    - vault storage writable state
    - TLS cert bundle availability
- Added OpenClaw-pattern adoption blueprint:
  - `ORION_OPENCLAW_ADOPTION_BLUEPRINT.md`
  - Defines adopt-now vs skip-now scope and a 14-day execution track.

### Validation
- `python3 -m py_compile server.py` -> PASS

---

## 23) Mom Mode UX Upgrade (2026-02-24)

### Objective
Make Empyralis usable for non-technical users by default (single input, simple run flow, plain-language errors).

### File updated
- `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`

### What changed
1. Added quick-start autopilot templates:
   - Inbox Triage
   - Lead Follow-up
   - Booking Assistant
2. Added trust mode selector:
   - Ask me before risky actions
   - Auto-run low-risk actions
3. Added preflight check before run:
   - Calls `GET /doctor`
   - Blocks run on `fail` checks
   - Blocks managed OpenAI runs when OpenAI connectivity is not ready
4. Improved error readability:
   - Maps provider/auth/network errors to plain-language guidance
5. Removed technical noise in visible log copy:
   - "Autopilot started..." instead of exposing run ID in user-facing log.
6. Start button UX improved:
   - `Start Autopilot`
   - `Checking setup...` while preflight runs
   - disabled while running or preflight check is active
7. Updated waiting state label:
   - `Needs your approval`

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/workflows/[id]/WorkflowEditorInnerPro.tsx` -> PASS

---

## 24) Map/Org-Chart Decommission (2026-02-24)

### Objective
Ensure Empyralis no longer presents CEO/department map-building as the default product direction.

### Changes made
1. Removed leftover map styling imports from global app styles:
   - Deleted ReactFlow global CSS imports from `frontend/app/globals.css`.
2. Reframed workflow templates to operator-first outcomes:
   - `Marketing Sprint` -> `Inbox Triage`
   - `Research Brief` -> `Booking Assistant`
   - Updated starter goals to practical autopilot tasks.
3. Removed map/canvas wording from fallback editor:
   - `WorkflowEditorClient.tsx` fallback message now says simple mode.
   - `WorkflowEditorInnerLite.tsx` now uses task/simple copy (no canvas references).
4. Removed CEO/marketing org-language from Agents page:
   - Mock profiles now `Operator` style roles (Customer Ops, Booking, Research).
   - UI copy changed from “workforce/hire agent” to “operator profiles”.

### Files updated
- `frontend/app/globals.css`
- `frontend/app/workflows/page.tsx`
- `frontend/app/workflows/[id]/WorkflowEditorClient.tsx`
- `frontend/app/workflows/[id]/WorkflowEditorInnerLite.tsx`
- `frontend/app/agents/page.tsx`

### Validation
- `cd frontend && npx eslint 'app/workflows/[id]/WorkflowEditorClient.tsx' 'app/workflows/[id]/WorkflowEditorInnerLite.tsx' app/workflows/page.tsx app/agents/page.tsx` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS

---

## 25) Default Mom Mode Entry + Pro Toggle (2026-02-24)

### Objective
Make Empyralis feel consumer-simple by default while preserving advanced workflows for power users.

### What changed
1. New default home page (`/`) is now a true Mom Mode Autopilot:
   - one goal input
   - quick templates
   - trust mode selector
   - `Start Autopilot` action
   - live transparent activity feed
   - approval buttons (`Approve` / `Hold`) when HITL is required
2. Added startup preflight in Mom Mode:
   - calls `/doctor` before run
   - blocks run when doctor reports fail checks
   - blocks managed OpenAI run when provider connectivity is not ready
3. Added plain-language error mapping:
   - converts raw API/auth/network failures into user-readable recovery guidance
4. Sidebar now defaults to Simple Mode:
   - only `Autopilot` shown by default
   - `Enable Pro Mode` toggle added in sidebar footer
   - Pro Mode state persisted to localStorage (`orion_pro_mode`)
   - when Pro Mode is disabled, user is returned to `/` if on advanced routes

### Files updated
- `frontend/app/page.tsx` (rewritten as default Mom Mode experience)
- `frontend/components/Sidebar.tsx` (Simple/Pro nav switching + persisted toggle)

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx components/Sidebar.tsx app/workflows/page.tsx 'app/workflows/[id]/WorkflowEditorClient.tsx' 'app/workflows/[id]/WorkflowEditorInnerLite.tsx'` -> PASS

---

## 26) Guided Onboarding Wizard in Mom Mode (2026-02-24)

### Objective
Remove terminal dependency for first-time users by adding a step-by-step setup flow directly in the default Autopilot page.

### File updated
- `frontend/app/page.tsx`

### What changed
1. Added explicit 3-step setup wizard:
   - Step 1: Run Empyralis system check (`/doctor`)
   - Step 2: Connect AI account (managed mode or BYOK OpenAI key)
   - Step 3: Test connection before first run
2. Added BYOK account management in Mom Mode:
   - save OpenAI key to vault (`POST /credentials/vault`)
   - refresh and select saved credentials (`GET /credentials/vault`)
   - validate selected account (`POST /credentials/vault/{id}/test`)
3. Integrated setup gating into run action:
   - `Start Autopilot` is disabled until all setup steps pass
   - button states now include `Complete setup first` and `Checking setup...`
4. Updated run payload for BYOK:
   - sends `credential_id` when BYOK mode is selected
5. Improved user guidance:
   - plain-language errors and step-level status feedback

### Validation
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx components/Sidebar.tsx` -> PASS

---

## 0) Scope of This File
This document captures:
- What was built and changed
- How the platform works end‑to‑end
- Known gaps/issues
- Next steps and the target direction (paper‑style hierarchy)

It is meant to reduce onboarding time for a senior engineer.

---

## 1) What The Platform Is
A multi‑agent orchestration platform with:
- **Workflow Builder** (ReactFlow) to place agents and connect them.
- **Backend API** (NestJS) for workflows, executions, agents, etc.
- **Crew Runtime** (FastAPI + CrewAI) for live agent runs + approvals.
- **UI Shell** with Overview, Workflows, Agents, Executions, Credentials, Settings, etc.

Core concept: CEO + departments + workers + tools.

---

## 2) Runtime Architecture (How It Connects)

### Frontend (Next.js)
- Base: `frontend/`
- Dev URL: `http://127.0.0.1:3000`
- Main workflow editor: `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`
- API client: `frontend/lib/api.ts`

### Backend (NestJS)
- Base: `backend/`
- Dev URL: `http://127.0.0.1:4000`
- API base: `/api/v1/*`
- Workflows CRUD lives in `backend/src/workflows/*`

### Crew Runtime (FastAPI)
- Base: repo root `server.py`
- Dev URL: `http://127.0.0.1:8001`
- Endpoints:
  - `POST /start-mission`
  - `GET /stream-logs/{run_id}` (SSE)
  - `POST /submit-decision`
  - `GET /health`

### Ports
- 3000: Frontend
- 4000: Backend
- 8001: Crew runtime

---

## 3) How The Workflow Editor Works

File: `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`

### Current Features
- **Top bar** (n8n‑style): Save / Publish / Run / Auto‑Arrange / Versions / Logs.
- **Autosave**: Debounced save with status indicator + retry button.
- **Node types**: Agent nodes are primary; tool nodes are blocked (tools attach to agents via detail panel).
- **Quick Add**: floating button + search to add nodes near cursor.
- **Right panel**: agent transparency (duty, prompt, summary, tools, model, provider, temp, max tokens).
- **Bottom drawer**: Logs + Work Log (reads WORK_LOG_SUMMARY.md).
- **Ghost preview**: shows drop preview on canvas.
- **Token usage (estimated)**: per‑agent from log length.

### Important Behavior
- **Auto‑Arrange** now uses **hybrid layout** (departments across, workers stacked). Still being refined.
- **Map view** remains the main editor. Org view was removed.

---

## 4) UI & Design Direction
- Dark, Claude‑inspired neutral palette.
- Minimal neon accents only for highlights.
- Dots background on map (no square grid).
- Sidebar collapsed on workflows to maximize canvas.

### Current Priority Direction
You want the map to feel like a **paper‑style office layout**:
- CEO at top
- Department labels under CEO (just labels, not agents)
- Agents under each department
- Departments spread horizontally, workers stacked vertically
- When published, show clean hierarchy (no plus buttons)
- When editing, show “+” under each department to add workers

---

## 5) Crew Runtime (FastAPI) — Current State

File: `server.py`

### Implemented
- **/health** endpoint
- **Timeout** protection (default 300s)
- **Retry with backoff** (configurable)
- **CORS locked** by origin
- **API key auth** via `CREW_API_KEY` (header or query)
- **Structured JSON logs**
- **Input validation** on `/submit-decision`
- **Certifi SSL fix** for OpenAI health check

### /health Output Example
- `openai_key_present`
- `openai_key_valid`
- `openai_status` (HTTP code)
- `openai_error` (if any)
- `crew_valid`, `errors`

---

## 6) Crew Runtime (main.py)

File: `main.py`

- CEO, Marketing, Coder, Designer agents
- Tasks include expected_output
- Hierarchical process with max_iter=15
- Uses `os.environ["OPENAI_API_KEY"]` (hard fail if missing)

---

## 7) Backend (NestJS) – Workflows & Executions

### Workflows
- Soft delete added: DELETE → status=archived
- `findAll` filters out archived
- Workflow templates now available in frontend create modal

### Executions
- New endpoint: `GET /executions/:id`
- Execution replay modal in frontend
- Execution export JSON

### Token Usage (Real)
- LLM service now returns usage (OpenAI/Anthropic)
- Executions emit token logs
- Frontend execution replay shows total token usage

---

## 8) Frontend Pages of Note

### Workflows Page
- Create workflow modal with templates
- Duplicate workflow
- Archive modal (soft delete)

### Execution Page
- List executions
- Modal replay of steps
- Export JSON
- Token summary

### Overview Page
- Metrics cards: prod executions, failures, failure rate, avg duration, HITL wait

---

## 9) Added Features (Summary of Work Done)

UI/UX:
- Top bar with save/publish/run
- Autosave
- Bottom logs drawer
- Quick Add floating menu
- Token usage (estimated)
- Prompt history library
- Executive summary
- Version restore modal
- Templates and duplicate

Backend:
- Soft delete workflows
- Execution replay endpoint
- LLM usage tracking (OpenAI/Anthropic)

Crew runtime:
- Health check, retry, timeout, auth, structured logs

---

## 10) Known Issues / Gaps

### Major
- **Map layout still not paper‑style** (needs department header nodes and strict hierarchy).
- **Crew main.py stability** still fragile; CEO/agent definitions must stay valid.

### UI
- Department labels need to be implemented (not agents).
- Auto‑arrange must enforce CEO → Departments → Agents.
- Need “Edit vs Published” mode to hide + buttons.

### Runtime
- OpenAI health check still shows 401 if key invalid.

---

## 11) Next Required Build (High Priority)

### Paper‑Style Layout (Requested)
- Add **Department header nodes** (not agents)
- Top‑down flow:
  - CEO
  - Departments
  - Agents under departments
- Each department shows **+ button** in edit mode
- In published view: hide + buttons

### Additional (Later)
- Prompt library backend storage
- Trust levels enforced on backend
- Workflow templates: AI‑generated (real), not placeholder

---

## 12) Commands To Run

### Frontend
```
cd /Users/mansur/Multi_Agent_Orchestrator_Project/frontend
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

### Backend
```
cd /Users/mansur/Multi_Agent_Orchestrator_Project/backend
npm install
npm run start:dev
```

### Crew Runtime
```
cd /Users/mansur/Multi_Agent_Orchestrator_Project
uvicorn server:app --host 0.0.0.0 --port 8001
```

---

## 13) Current Design Goal (Final Direction)
- Keep the dark background and map visuals.
- Make layout feel like an office workflow document:
  - CEO on top
  - Department labels under CEO
  - Agents under each department
  - Vertical growth downward, horizontal growth per department

---

## 14) Latest Stabilization Pass (2026-02-24)

### What was fixed
- Added **Run Session API (engine-ready)** in Crew runtime:
  - `POST /runs/start`
  - `GET /runs/{run_id}`
  - `GET /runs/{run_id}/stream`
  - `POST /runs/{run_id}/decision`
- Added **Engine Adapter layer** in runtime:
  - `CrewEngineAdapter` registered in `ENGINE_REGISTRY`
  - execution routed by run `engine` field (extensible for future Codex adapter)
- Kept backward compatibility endpoints:
  - `/start-mission`, `/stream-logs/{run_id}`, `/submit-decision` now wrap new `/runs/*` API.
- Removed conflicting squad runtime path in Pro editor (`startSquadSession` stream to Nest endpoint) and standardized on Crew runtime (`/runs/*` API with legacy compatibility routes).
- Updated Squad Cast behavior:
  - It now seeds the canvas with agent cards (including guaranteed CEO seed if missing).
  - Run execution is explicitly started via the `Run` action.
- Improved run lifecycle:
  - `isRunning` and `crewStatus` now update on `run_complete`/`run_error` events.
  - Stream close on completion is handled to avoid stale status.
- Added an in-platform command console inside the bottom logs drawer:
  - `run`, `approve`, `reject`, `arrange`, `save`, `help`.
- Simplified left-side controls in workflow editor:
  - Single floating `+` quick-add trigger.
  - Removed duplicate/competing add controls from render path.
- Restored editor interactivity:
  - Nodes are draggable and connectable.
  - Pan and zoom are enabled again.
- Added dotted map background (ReactFlow `BackgroundVariant.Dots`) and top-right controls panel.
- Expanded paper workspace width for better visibility (`min(1400px, calc(100% - 120px))`).
- Added local `dagre` type shim for strict TypeScript builds:
  - `frontend/types/dagre.d.ts`.
- Updated FastAPI CORS handling to accept both local frontend origins by default:
  - `FRONTEND_ORIGINS=http://127.0.0.1:3000,http://localhost:3000`.

### Files updated in this pass
- `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`
- `frontend/types/dagre.d.ts`
- `server.py`

### Verification results
- Frontend production build succeeds:
  - `cd frontend && NEXT_DISABLE_ESLINT=1 npm run build`
- Python runtime syntax check succeeds:
  - `python3 -m py_compile server.py main.py`

### Remaining known concerns
- Global ESLint baseline has many pre-existing errors/warnings across unrelated files; not part of this stabilization patch.
- Workflow editor still contains legacy sections that should be modularized later (UI cleanup/refactor).

---

## 15) Codex Runtime + Repo Cleanup Pass (2026-02-24)

### Codex integration (new)
- Added a real engine abstraction in `server.py` with two engines:
  - `crew` (existing CrewAI flow)
  - `codex` (OpenAI Responses API-backed flow)
- `codex` engine now accepts business-plan context and runs via:
  - `POST /runs/start` with `{ "engine": "codex", "business_plan": "...", ... }`
- Added Codex/OpenAI runtime settings:
  - `OPENAI_RESPONSES_URL` (default `https://api.openai.com/v1/responses`)
  - `CODEX_MODEL` (default `gpt-4.1`)
- Added OpenAI response text extraction and structured run completion/error events.

### Workflow editor wiring (updated)
- Workflow run UI now targets new run-session API:
  - start: `POST /runs/start`
  - stream: `GET /runs/{run_id}/stream`
  - decision: `POST /runs/{run_id}/decision`
- Added engine selector in top bar (`CODEX` / `CREW`) and run button reflects selected engine.
- Console drawer commands extended:
  - `run codex`, `run crew`, `approve`, `reject`, `arrange`, `save`, `help`
- Run payload now includes a generated business-plan digest from workflow + agent duties.

### Backward compatibility
- Legacy endpoints kept and mapped:
  - `/start-mission` -> `/runs/start`
  - `/stream-logs/{run_id}` -> `/runs/{run_id}/stream`
  - `/submit-decision` -> `/runs/{run_id}/decision`

### Lean cleanup performed
- Removed obvious non-runtime artifacts:
  - `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx.bak`
  - `frontend/components/REPORT 21.01`
  - tracked Python bytecode under `__pycache__/` and `python_engine/__pycache__/`
  - accidental root `package-lock.json`
- Updated `.gitignore` to ignore:
  - `__pycache__/`, `*.pyc`, `*.pyo`, `*.bak`

### Validation
- `python3 -m py_compile server.py main.py` -> OK
- `cd frontend && NEXT_DISABLE_ESLINT=1 npm run build` -> OK

---

## 16) Single-Agent Pivot + Archive Cleanup (2026-02-24)

### Product direction change
- The platform is now aligned to a **single-agent-first** workflow model.
- Removed default CEO/department assumptions from new workflow setup.
- Goal: one operator agent can run the business plan end-to-end locally.

### Repo cleanup (documents)
- Legacy top-level markdown docs were moved to:
  - `archive/legacy-docs/`
- Kept at root:
  - `README.md`
  - `WORK_LOG_SUMMARY.md`

### Runtime update (`main.py`)
- Rebuilt CrewAI runtime as one agent:
  - Agent: `Operator`
  - Tasks: `plan_task`, `execute_task`, `deploy_task`
  - `deploy_task` retains `human_input=True`
  - `max_iter=15`
  - Uses `os.environ["OPENAI_API_KEY"]` (no hardcoded secrets)
- Process changed to `Process.sequential` for deterministic single-agent execution.

### FastAPI compatibility update (`server.py`)
- Validation no longer requires `manager_llm` unless process is hierarchical.
- This keeps health checks compatible with sequential single-agent crews.

### Workflow editor update (`WorkflowEditorInnerPro.tsx`)
- Node library reduced to one default entry:
  - `Operator Agent`
- New/empty workflows now seed with one `Operator` node.
- `deploySquadLayout` no longer auto-injects CEO.
- Auto-arrange no longer creates synthetic department nodes.
  - It now arranges only existing canvas nodes and edges (top-to-bottom).
- Tool presets simplified to operator-focused toolbelt.
- Approval modal and toasts renamed from CEO/executive wording to neutral run wording.

### Type update (`frontend/lib/agent.types.ts`)
- `AgentProfile.role` and `provider` generalized to `string`.
- Default squad updated to a single Operator profile.

### Verification
- `python3 -m py_compile main.py server.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint 'app/workflows/[id]/WorkflowEditorInnerPro.tsx'`
  - Reports pre-existing lint baseline warnings/errors unrelated to this pivot.

---

## 17) Non-Technical UX Pivot (No Map / No Org Chart) (2026-02-24)

### Why this pivot
- Target users are non-developers.
- The previous node-map/CEO-department UX added complexity and confusion.
- New goal: "my mom can use it" workflow experience.

### What changed in the workflow screen
- Replaced map editor with a simplified **Operator Studio**:
  - Step 1: Write goal
  - Step 2: Optional advanced settings (model, duty, system prompt)
  - Step 3: Run operator
  - Step 4: Read transparent live logs
  - Step 5: Approve/Hold only when needed
- Removed all ReactFlow map logic from active editor route.
- Active file now:
  - `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`

### Runtime flow in new UI
- Start run via:
  - `POST /runs/start` with engine=`codex`
- Stream logs via:
  - `GET /runs/{run_id}/stream` (SSE)
- Submit approval decision via:
  - `POST /runs/{run_id}/decision`
- Save/publish workflow still supported via NestJS API.

### Additional archive cleanup
- Moved old map-only frontend editor files into:
  - `archive/legacy-frontend-editor/frontend/...`
- Archived files include:
  - `WorkflowEditorInner.tsx`
  - `WorkflowCanvas.tsx`, `WorkflowCanvas.module.css`
  - `NodePalette.tsx`, `NodePropertiesPanel.tsx`
  - `QuickConnectMenu.tsx`, `ResourceCore.tsx`, `LiveIntelFeed.tsx`
  - `SquadCastingModal.tsx`, `KeyboardShortcuts.tsx`
  - `CommandPalette.tsx`, `ExecutionStatusBar.tsx`
  - `hooks/useKeyboardShortcuts.ts`

### Validation after pivot
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npm run build` -> PASS
- `python3 -m py_compile main.py server.py` -> PASS

---

## 18) Multi-Provider Wizard + Encrypted Vault + Model Picker (2026-02-24)

### Scope completed
Implemented all requested next items in one pass:
1. Connection Wizard + encrypted credentials vault + provider health checks
2. Provider adapter layer (OpenAI / Anthropic / Gemini / Vertex)
3. Model picker per provider (auto-load)
4. Simplified run UI language for non-technical users

### Backend changes (`server.py`)
- Added provider catalog and adapter registry:
  - `openai`, `anthropic`, `gemini`, `vertex`
- Added encrypted local vault with OpenSSL AES-256-CBC + PBKDF2:
  - vault file: `.orion_credentials_vault.json`
  - key source: `CREDENTIAL_VAULT_KEY` or auto-created `.orion_vault_key`
- Added provider endpoints:
  - `GET /providers`
  - `POST /providers/test`
  - `GET /providers/{provider}/models?credential_id=...`
- Added vault endpoints:
  - `GET /credentials/vault`
  - `POST /credentials/vault`
  - `DELETE /credentials/vault/{credential_id}`
  - `POST /credentials/vault/{credential_id}/test`
- Extended run start payload:
  - accepts `provider`, `model`, `credential_id`
- Updated codex engine execution path:
  - chooses adapter by provider
  - resolves credential from vault
  - runs generation via provider-specific API
  - no longer hard-bound to OpenAI-only path

### Frontend changes (`WorkflowEditorInnerPro.tsx`)
- Reworked into a 3-step non-technical flow:
  - **1) Connect AI** (provider, mode, vault credentials, test, model picker)
  - **2) Describe task** (plain goal input)
  - **3) Run** (single run button, optional behavior settings)
- Added credential creation inputs per provider:
  - OpenAI / Anthropic / Gemini API key
  - Vertex access token + project + location
- Added model auto-load per selected provider/credential
- Added provider-aware run request to backend runtime
- Persists connection settings in workflow meta:
  - `operator.connection.provider`
  - `operator.connection.mode`
  - `operator.connection.credentialId`

### Runtime integration
- Run payload now passes:
  - provider
  - model
  - credential_id (BYOK mode)
- Live logs and approval behavior remain unchanged for user simplicity.

### Validation (post-change)
- `python3 -m py_compile server.py main.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/workflows/[id]/WorkflowEditorInnerPro.tsx` -> PASS
- `cd frontend && npm run build` -> PASS

---

## 19) Hardening Pass: Workspace Vault Scoping + Key Rotation/Backup + Masked Usage (2026-02-24)

### Scope completed
Implemented the approved hardening items:
1. Vault key rotation + encrypted export/import bundles
2. Per-workspace credential ownership/scoping
3. Masked token/cost usage telemetry surfaced in workflow UI

### Backend updates (`server.py`)
- Fixed codex runtime context ordering bug in `CodexEngineAdapter` (`metadata` initialization).
- Added workspace-aware vault access helpers:
  - `_normalize_workspace_id(...)`
  - `_workspace_visible(...)`
  - `list_vault_credentials(workspace_id=...)`
  - `resolve_vault_credential(credential_id, workspace_id=...)`
- Added vault key file update helper:
  - `_set_vault_passphrase(...)`
- Added credential identity helper for dedupe during import:
  - `_credential_identity(...)`

### New/updated API behavior
- `GET /credentials/vault?workspace_id=...` -> returns scoped credentials.
- `POST /credentials/vault` now stores `workspace_id`.
- `DELETE /credentials/vault/{credential_id}?workspace_id=...` enforces workspace visibility.
- `POST /credentials/vault/{credential_id}/test?workspace_id=...` enforces workspace visibility.
- `GET /providers/{provider}/models?credential_id=...&workspace_id=...` supports scoped credential resolve.
- `POST /runs/start` now accepts and stores `workspace_id` in run context.

### New vault hardening endpoints
- `POST /credentials/vault/rotate-key`
  - Re-encrypts all vault secrets with a new passphrase.
  - Rejects rotation when `CREDENTIAL_VAULT_KEY` env override is active.
- `POST /credentials/vault/export`
  - Exports scoped credentials as a passphrase-encrypted bundle.
- `POST /credentials/vault/import`
  - Imports encrypted bundle with optional `overwrite` behavior.
  - Dedupes by `(provider, label, workspace_id)`.

### Usage telemetry updates
- Added masked telemetry estimator:
  - `build_masked_usage(provider, model, input_text, output_text)`
- Codex runs now emit:
  - stream event: `usage_masked`
  - run object field: `usage_masked`
- `GET /runs/{run_id}` now returns `usage_masked`.

### Frontend updates (`frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`)
- Added workspace awareness:
  - reads `workflow.workspaceId`
  - passes `workspace_id` to vault/model/run endpoints
- Added vault operations UI in workflow page:
  - export bundle
  - import bundle (+ overwrite toggle)
  - rotate vault key
- Added masked usage UI card:
  - provider/model
  - input/output/total token estimates
  - masked cost band
- Run stream parser now handles `usage_masked` events.

### Validation (post-hardening)
- `python3 -m py_compile server.py main.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/workflows/[id]/WorkflowEditorInnerPro.tsx` -> PASS
- `cd frontend && npm run build` -> PASS

---

## 20) Consumer-First UX Pass (No Map by Default) (2026-02-24)

### Objective
Shift the product toward non-developers:
- outcome-first UX,
- plain-language labels,
- advanced controls hidden by default,
- no map-centric workflow framing in the primary experience.

### Changes made

#### Navigation language simplified (`frontend/components/Sidebar.tsx`)
- Renamed primary navigation:
  - `Overview` -> `Home`
  - `Workflows` -> `Tasks`
  - `Executions` -> `Run History`
  - `Credentials` -> `Connected Accounts`
- Secondary:
  - `Command Center` -> `Automation Lab`
- Removed developer-heavy items from primary nav (Agents/Variables/Admin) to reduce cognitive load.
- Section label updated:
  - `Platform` -> `Workspace`

#### Tasks list page reframed (`frontend/app/workflows/page.tsx`)
- Page copy rewritten for non-technical users:
  - `Workflows` -> `Tasks`
  - `New Workflow` -> `New Task`
  - `Create Workflow` modal -> `Create Task`
  - `Archive Workflow` -> `Delete Task`
- Replaced node-heavy templates with simple starter templates using `mode: simple_operator`.
- Removed AI template generation box from modal to reduce complexity.
- Replaced `nodes` metric with `Ready to run` status text.
- Empty and loading states now reference tasks, not workflows.

#### Editor default mode simplified (`frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`)
- Default connection mode set to `managed` (lower setup friction).
- Editor now starts with:
  1) **Describe your task**
  2) **Start**
- Advanced setup is hidden behind toggle:
  - `Edit advanced setup`
  - includes provider/model/account/vault operations when needed.
- Wording updates:
  - `Workflow` -> `Task`
  - `Run Operator` -> `Start`
  - `Credential Vault` -> `Connected Accounts`
  - `Idle` status -> `Ready`

#### Minor fallback language update
- `frontend/app/workflows/[id]/WorkflowEditorClient.tsx`
  - fallback banner simplified to:
    - `Task view is running in lightweight mode.`

#### Home dashboard language update (`frontend/app/page.tsx`)
- `Create Workflow` -> `Create Task`
- summary tabs and empty state text updated to task-oriented language.
- typing cleanup to satisfy stricter lint rules.

### Validation
- `cd frontend && npx eslint components/Sidebar.tsx app/page.tsx app/workflows/page.tsx app/workflows/[id]/WorkflowEditorClient.tsx app/workflows/[id]/WorkflowEditorInnerPro.tsx` -> PASS
- `cd frontend && npm run build` -> PASS

---

## 21) Empyralis Independence Refactor — Step 1 (2026-02-24)

### Goal
Start removing brand/runtime coupling to external frameworks by making Empyralis the primary runtime surface.

### Completed
- Backend runtime config migrated to Empyralis naming with backward compatibility:
  - Added `env_first()` helper in `server.py`.
  - Primary env vars now:
    - `ORION_API_KEY`
    - `ORION_AUTH_REQUIRED`
    - `ORION_RUN_TIMEOUT_SECONDS`
    - `ORION_MAX_RETRIES`
    - `ORION_RETRY_BACKOFF_SECONDS`
  - Legacy `CREW_*` vars still supported as fallback for safe migration.
- Backend API branding updates:
  - FastAPI title changed to `Empyralis Runtime API`.
  - Health payload now includes `orion_api_key_configured` and `runtime_valid`.
  - Engines list now hides legacy alias from default response (`crew` kept only as compatibility alias).
- Runtime engine normalization:
  - Default engine changed from `crew` to `orion`.
  - Incoming `engine="crew"` is normalized to `orion`.
  - Legacy compatibility endpoint `/start-mission` now launches `orion` engine.
- UI env surface migrated to Empyralis naming (with fallback):
  - `frontend/app/page.tsx`
  - `frontend/app/health/page.tsx`
  - `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`
  - all now read `NEXT_PUBLIC_ORION_API_URL` / `NEXT_PUBLIC_ORION_API_KEY` first, then fallback to old `NEXT_PUBLIC_CREW_*`.
- Health UI wording updated:
  - `Crew Runtime` -> `Empyralis Runtime`.
- Frontend env sample updated:
  - `frontend/.env.local` now defines `NEXT_PUBLIC_ORION_API_URL` and `NEXT_PUBLIC_ORION_API_KEY`.

### Validation
- `python3 -m py_compile server.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx app/health/page.tsx app/workflows/[id]/WorkflowEditorInnerPro.tsx` -> PASS

### Notes
- This step is naming/runtime-surface independence, not full engine replacement yet.
- CrewAI execution adapter still exists internally and will be removed in Step 2.

## 22) Empyralis Independence Refactor — Step 2 (Engine Decoupling) (2026-02-24)

### Goal
Remove the runtime dependency on CrewAI/main.py and run Empyralis with an internal engine.

### Completed
- Removed hard dependency on `main.py` from runtime:
  - `server.py` no longer imports `conductor_crew`.
- Replaced Crew-based runtime path with Empyralis-native execution:
  - Added `run_orion_mission(run_id)` in `server.py`.
  - `OrionEngineAdapter` now executes internal Empyralis flow (not CrewAI).
  - Flow now does:
    1) planning pass via selected provider/model,
    2) optional human approval gate for risky actions,
    3) execution summary pass,
    4) masked usage telemetry emission.
- Added Empyralis-native helper logic:
  - provider/model/credential context resolution (`resolve_run_execution_context`)
  - approval heuristic + gate (`requires_human_approval`, `wait_for_human_decision`)
  - runtime validation (`validate_orion_runtime`)
  - agent summary formatting (`format_agent_summary`)
- Engine registry cleaned:
  - active engines: `orion`, `codex`
  - removed Crew alias from registry.
- Health payload cleaned:
  - added/kept Empyralis fields (`runtime_valid`, `orion_api_key_configured`)
  - removed Crew-specific keys from health payload.
- Requirements decoupled from CrewAI:
  - `requirements.txt`: removed `crewai`, added explicit `certifi`
  - `requirements-worker.txt`: removed `crewai` and `langchain_openai`, added explicit `certifi`
- `main.py` rewritten as Empyralis standalone runner (OpenAI Responses API), no CrewAI import.

### Validation
- `python3 -m py_compile server.py main.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx app/health/page.tsx app/workflows/[id]/WorkflowEditorInnerPro.tsx` -> PASS

### Notes
- Backward env compatibility retained temporarily in server/frontend:
  - `ORION_*` is primary.
  - old `CREW_*`/`NEXT_PUBLIC_CREW_*` values still fallback to prevent local breakage.
- Next migration step can remove fallback keys once local env is fully switched to `ORION_*` only.

## 23) Empyralis Independence Refactor — Step 3 (Hard Cut + SMB Pack #1 Default) (2026-02-24)

### Goal
Complete Empyralis-only frontend runtime wiring and set a clear default business outcome flow for non-technical users.

### Completed
- Removed remaining legacy frontend env fallback keys:
  - `frontend/app/health/page.tsx`
  - `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`
  - both now use only:
    - `NEXT_PUBLIC_ORION_API_URL`
    - `NEXT_PUBLIC_ORION_API_KEY`
- Removed backward-compat entries from frontend env file:
  - `frontend/.env.local`
  - deleted:
    - `NEXT_PUBLIC_CREW_API_URL`
    - `NEXT_PUBLIC_CREW_API_KEY`
- Updated Autopilot default flow to explicit SMB Outcome Pack #1:
  - `frontend/app/page.tsx`
  - added `Customer Ops Autopilot` pack model with:
    - fixed scope chips:
      - Inbox triage
      - Lead follow-up
      - Booking coordination
    - default pack goal button (`Use default`)
    - quick-goal shortcuts inside the pack
- Added pack metadata into runtime start payload:
  - `metadata.outcome_pack`
  - `metadata.outcome_pack_label`
  - `metadata.outcome_scope`
  - keeps trust + connection mode metadata.

### Validation
- `python3 -m py_compile server.py main.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx app/health/page.tsx app/workflows/[id]/WorkflowEditorInnerPro.tsx` -> PASS

### Notes
- Runtime compatibility endpoints (`/start-mission`, `/stream-logs/{run_id}`, `/submit-decision`) remain intentionally available in `server.py` for old UI paths, but primary UI now uses Empyralis routes (`/runs/*`).

## 24) Empyralis Independence Refactor — Step 4 (Reliability + Identity Hardening) (2026-02-24)

### Goal
Remove local setup friction causing “it doesn’t work” and tighten product identity away from legacy naming.

### Completed
- Added runtime API key handling directly in UI (no env-file edits required during local use):
  - `frontend/app/page.tsx`
  - `frontend/app/workflows/[id]/WorkflowEditorInnerPro.tsx`
  - behavior:
    - runtime key input in setup/advanced panel
    - key is persisted in browser localStorage (`orion_runtime_api_key`)
    - headers and SSE stream auth now read from this runtime key state.
- Reduced localhost/127.0.0.1 mismatch issues:
  - `frontend/lib/api.ts` default API URL changed to `http://127.0.0.1:4000/api/v1`.
- Product identity cleanup:
  - Sidebar brand changed from `conductor.` to `orion.`:
    - `frontend/components/Sidebar.tsx`
  - Home CTA copy updated:
    - `Open Pro Studio` -> `Open Advanced Builder`
    - `frontend/app/page.tsx`
  - Backend startup log branding:
    - `AgentForge Backend` -> `Empyralis Backend`
    - `backend/src/main.ts`
- Type/lint hardening on API client:
  - removed `any` from `frontend/lib/api.ts` function signatures
  - removed unused catch variable.

### Validation
- `python3 -m py_compile server.py main.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx app/health/page.tsx app/workflows/[id]/WorkflowEditorInnerPro.tsx components/Sidebar.tsx lib/api.ts` -> PASS

## 25) Empyralis Runtime Productization — Step 5 (Pack Actions + Legacy Route Removal) (2026-02-24)

### Goal
Move from compatibility mode to Empyralis-native product behavior with real SMB pack actions.

### Completed
- Removed legacy compatibility runtime routes from FastAPI:
  - deleted `/start-mission`
  - deleted `/stream-logs/{run_id}`
  - deleted `/submit-decision`
- Removed dead squad stream client function:
  - deleted `startSquadSession(...)` from `frontend/lib/api.ts`
- Added deterministic `Customer Ops Autopilot` pipeline in `server.py`:
  - inbox triage (priority/category/action)
  - lead follow-up drafts (hot/warm/cold classification)
  - booking slot proposals (pending confirmation list)
  - optional human approval gate before outbound actions when trust mode is not `auto`
  - structured result payload emitted as `pack_summary` log event
- Added structured result persistence in run state:
  - run object now stores `result_data`
  - `GET /runs/{run_id}` now returns `result` + `result_data`
- Updated Autopilot UI to feed real pack inputs and show real pack outputs:
  - `frontend/app/page.tsx`
  - added input panes for:
    - inbox messages
    - leads
    - booking slots
  - sends `metadata.pack_inputs` on `/runs/start`
  - switched default run engine from `codex` to `orion` for pack execution path
  - renders `Customer Ops Output` card from `pack_summary` stream event or `/runs/{id}` snapshot.

### Validation
- `python3 -m py_compile server.py main.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx app/health/page.tsx app/workflows/[id]/WorkflowEditorInnerPro.tsx lib/api.ts components/Sidebar.tsx app/layout.tsx app/credentials/page.tsx app/workflows/[id]/WorkflowEditorClient.tsx` -> PASS

## 26) Empyralis Connectors — Step 6 (Google Workspace Drafts + Calendar Events) (2026-02-24)

### Goal
Enable real connector execution for `Customer Ops Autopilot` (not just planning text).

### Completed
- Added dedicated connector catalog and vault APIs in `server.py`:
  - `GET /connectors`
  - `GET /connectors/vault`
  - `POST /connectors/vault`
  - `POST /connectors/vault/{credential_id}/test`
- Implemented Google Workspace connector validation:
  - checks Gmail profile and Calendar list with provided OAuth access token.
- Integrated connector execution into `Customer Ops Autopilot`:
  - lead follow-up drafts now create real Gmail drafts when connector is selected and lead line includes email.
  - booking proposals now create real Google Calendar events when slot is valid ISO datetime.
  - structured connector telemetry added to `result_data.connector`:
    - `gmail_drafts_created`
    - `calendar_events_created`
    - `gmail_profile`
    - warnings array
- Improved run result safety:
  - added context redaction in `/runs/{run_id}` response for sensitive keys (`token`, `key`, `secret`, etc.).
- Updated home Autopilot UI (`frontend/app/page.tsx`) to manage connector lifecycle:
  - list existing connectors
  - save Google Workspace connector token
  - test connector
  - pass `connector_credential_id` to runtime metadata
  - show connector output counters in live results card.

### Notes
- Calendar event creation requires slot values parseable as ISO datetime:
  - `YYYY-MM-DDTHH:MM:SSZ`
  - or `startISO/endISO`
- Human-readable slots like `Mon 10:00 AM` are kept as planning data but cannot be auto-created as calendar events.

### Validation
- `python3 -m py_compile server.py main.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx app/workflows/[id]/WorkflowEditorInnerPro.tsx app/health/page.tsx lib/api.ts app/layout.tsx app/credentials/page.tsx components/Sidebar.tsx app/workflows/[id]/WorkflowEditorClient.tsx` -> PASS

## 30) Empyralis Autopilot Hardening — Trust Presets + KPI Strip + Execution Summary (2026-02-25)

### Goal
Close the remaining productization gaps for simple-user mode:
- complete trust policy (`auto` / `guarded` / `strict`)
- tighten result schema
- expose runtime KPIs in UI
- improve setup guidance

### Completed
- Runtime trust policy unification in `server.py`:
  - Added canonical trust constants and normalization:
    - `auto`
    - `guarded`
    - `strict`
  - Added alias handling:
    - `ask` / `manual` -> `guarded`
    - `review` -> `strict`
  - Added `pack_approval_policy(...)`:
    - `auto`: no approval gate
    - `guarded`: approval when outbound/urgent activity exists
    - `strict`: approval required before finalizing actions
- Runtime schema tightening in `server.py`:
  - Added `normalize_pack_result(...)` to enforce:
    - `pack_id`
    - `summary`
    - `generated_at`
    - normalized `outputs.outbound_actions`
    - normalized `outputs.urgent_count`
    - fallback `next_steps`
  - Added execution summary payload:
    - `execution_summary.schema_version`
    - `execution_summary.trust_mode_applied`
    - `execution_summary.approval_required`
    - `execution_summary.approval_reason`
    - `execution_summary.risk_level`
    - `execution_summary.next_action`
    - `execution_summary.estimated_time_saved_minutes`
  - Added `result_schema_version=2` in pack results.
- Runtime error quality improvements in `server.py`:
  - Added `friendly_runtime_error_message(...)`.
  - Retry and terminal run errors now emit user-facing actionable messages while preserving raw error in retry diagnostics.
- `/runs/start` input hardening in `server.py`:
  - Validates `metadata.trust_mode`.
  - Validates `metadata.pack_inputs` object shape.
  - Validates `metadata.outcome_scope` and `metadata.connector_credential_id` types.
- Frontend trust preset upgrade in `frontend/app/page.tsx`:
  - Replaced old 2-mode control with:
    - `Guarded (recommended)`
    - `Auto (fastest)`
    - `Strict (approve everything)`
  - Added plain-language helper text per mode.
- Frontend KPI strip in `frontend/app/page.tsx`:
  - Polls `/metrics` every 15s.
  - Shows:
    - completion rate
    - average run duration
    - time-to-first-value
    - average human wait
- Frontend execution summary model in `frontend/app/page.tsx`:
  - Added typed `execution_summary` support in pack result types.
  - New summary card shows:
    - risk level
    - estimated time saved
    - applied trust mode
    - approval reason (if required)
    - immediate next action
- Onboarding v2 optimization in `frontend/app/page.tsx`:
  - Added “Next step” setup guidance row with one-click action where possible.
  - Persisted `trustMode` and selected pack in local storage.
  - Auto-fills goal from selected pack default when goal field is empty.
- Docs update:
  - Updated `docs/QUICKSTART_ORION_AUTOPILOT.md`:
    - trust mode guidance
    - KPI strip expectations
    - trust mode error note

### Validation
- `python3 -m py_compile server.py` -> PASS
- `cd frontend && npx tsc --noEmit` -> PASS
- `cd frontend && npx eslint app/page.tsx` -> PASS
