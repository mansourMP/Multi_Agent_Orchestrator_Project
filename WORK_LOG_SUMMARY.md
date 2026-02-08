# Orion Platform — Full System Report (Everything So Far)

Date: 2026-01-23
Owner: Mansur
Project: Multi_Agent_Orchestrator_Project

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

